import type { LxdInstance } from "types/instance";
import type { MetricHistoryEntry } from "context/metricHistory";
import {
  getCpuUsage,
  getMemoryUsage,
  type CpuUsage,
} from "util/metricSelectors";

export interface CpuSeriesPoint {
  time: number; // seconds since epoch
  value: number; // cpu usage in percent, 0 to 100
}

export interface MemorySeriesPoint {
  time: number; // seconds since epoch
  used: number; // bytes, excluding cache
  cached: number; // bytes
  total: number; // bytes
}

// the LXD metrics endpoint serves cached responses for several seconds, so
// two quick polls can return identical cpu counters. Only report 0% usage
// from identical counters once the samples are far enough apart to rule out
// a cached response.
const METRIC_CACHE_GRACE_SECONDS = 20;

const getCoreCount = (cpu: CpuUsage, instance: LxdInstance): number => {
  if (cpu.coreCount > 0) {
    return cpu.coreCount;
  }

  // fall back to instance config for VMs, which often have a 0 value for cores in metrics
  const cpuLimit = instance.expanded_config["limits.cpu"];
  if (cpuLimit) {
    const limit = parseInt(cpuLimit);
    return limit > 0 ? limit : 1;
  }

  // fall back to single core
  return 1;
};

const calculateCpuUsage = (
  now: CpuUsage,
  prev: CpuUsage,
  instance: LxdInstance,
): number | null => {
  const nowBusySeconds = now.cpuSecondsTotal - now.cpuSecondsIdle;
  const prevBusySeconds = prev.cpuSecondsTotal - prev.cpuSecondsIdle;
  const busySeconds = nowBusySeconds - prevBusySeconds;

  const cores = getCoreCount(now, instance);
  const totalSeconds = (now.time - prev.time) * cores;
  if (totalSeconds <= 0) {
    return null;
  }

  const result = (100 * busySeconds) / totalSeconds;
  if (result < 0) {
    return null;
  }

  return Math.min(result, 100);
};

export const getCpuSeries = (
  history: MetricHistoryEntry[],
  instance: LxdInstance,
): CpuSeriesPoint[] => {
  const samples: CpuUsage[] = [];
  history.forEach((entry) => {
    const sample = getCpuUsage(entry, instance);
    if (sample) {
      samples.push(sample);
    }
  });

  const series: CpuSeriesPoint[] = [];
  let base: CpuUsage | null = null;
  samples.forEach((now) => {
    if (!base) {
      base = now;
      return;
    }

    if (now.cpuSecondsTotal === base.cpuSecondsTotal) {
      // identical counters within the grace period are cached responses with
      // a stale scrape time, don't use them as a delta base. Beyond the grace
      // period they mean a genuinely idle instance.
      if (now.time - base.time >= METRIC_CACHE_GRACE_SECONDS) {
        series.push({ time: now.time, value: 0 });
        base = now;
      }
      return;
    }

    const value = calculateCpuUsage(now, base, instance);
    if (value !== null) {
      series.push({ time: now.time, value });
    }
    base = now;
  });

  return series;
};

export const getMemorySeries = (
  history: MetricHistoryEntry[],
  instance: LxdInstance,
): MemorySeriesPoint[] => {
  const series: MemorySeriesPoint[] = [];
  history.forEach((entry) => {
    const memory = getMemoryUsage(entry.metric, instance);
    if (!memory) {
      return;
    }

    series.push({
      time: entry.time,
      used: memory.total - memory.free - memory.cached,
      cached: memory.cached,
      total: memory.total,
    });
  });

  return series;
};
