import { getCpuSeries, getMemorySeries } from "util/metricHistorySeries";
import type { LxdInstance } from "types/instance";
import type { MetricHistoryEntry } from "context/metricHistory";
import type { LxdMetricGroup } from "types/metrics";

const instance = {
  name: "vm1",
  project: "default",
  expanded_config: {},
} as LxdInstance;

const labels = {
  name: "vm1",
  project: "default",
  type: "container",
};

const cpuGroups = (
  idleSeconds: number,
  busySeconds: number,
  cores: number,
): LxdMetricGroup[] => [
  {
    name: "lxd_cpu_seconds_total",
    help: "",
    type: "COUNTER",
    metrics: [
      {
        labels: { ...labels, cpu: "0", mode: "idle" },
        value: String(idleSeconds),
      },
      {
        labels: { ...labels, cpu: "0", mode: "user" },
        value: String(busySeconds),
      },
    ],
  },
  {
    name: "lxd_cpu_effective_total",
    help: "",
    type: "GAUGE",
    metrics: [{ labels, value: String(cores) }],
  },
];

const cpuEntry = (
  time: number,
  idleSeconds: number,
  busySeconds: number,
  cores = 2,
): MetricHistoryEntry => ({
  time,
  metric: cpuGroups(idleSeconds, busySeconds, cores),
});

const memoryEntry = (
  time: number,
  free: number,
  cached: number,
  total: number,
): MetricHistoryEntry => ({
  time,
  metric: [
    {
      name: "lxd_memory_MemFree_bytes",
      help: "",
      type: "GAUGE",
      metrics: [{ labels, value: String(free) }],
    },
    {
      name: "lxd_memory_Cached_bytes",
      help: "",
      type: "GAUGE",
      metrics: [{ labels, value: String(cached) }],
    },
    {
      name: "lxd_memory_MemTotal_bytes",
      help: "",
      type: "GAUGE",
      metrics: [{ labels, value: String(total) }],
    },
  ],
});

describe("getCpuSeries", () => {
  it("returns empty series on empty history", () => {
    expect(getCpuSeries([], instance)).toEqual([]);
  });

  it("returns empty series on a single snapshot", () => {
    expect(getCpuSeries([cpuEntry(0, 100, 100)], instance)).toEqual([]);
  });

  it("computes usage from the delta of two snapshots", () => {
    const history = [cpuEntry(0, 100, 100), cpuEntry(10, 105, 115)];

    // 15 busy seconds on 2 cores over 10 seconds wall time: 15 / 20 = 75%
    expect(getCpuSeries(history, instance)).toEqual([{ time: 10, value: 75 }]);
  });

  it("skips snapshots with identical counters from the metric cache", () => {
    const history = [
      cpuEntry(0, 100, 100),
      cpuEntry(3, 100, 100), // cached response, no point emitted
      cpuEntry(10, 105, 115),
    ];

    const series = getCpuSeries(history, instance);

    // the third snapshot is computed against the first, skipping the cached one
    expect(series).toEqual([{ time: 10, value: 75 }]);
  });

  it("reports 0% for identical counters beyond the cache grace period", () => {
    const history = [cpuEntry(0, 100, 100), cpuEntry(30, 100, 100)];

    expect(getCpuSeries(history, instance)).toEqual([{ time: 30, value: 0 }]);
  });

  it("falls back to limits.cpu when metrics report zero cores", () => {
    const vm = {
      ...instance,
      expanded_config: { "limits.cpu": "4" },
    } as LxdInstance;
    const history = [cpuEntry(0, 100, 100, 0), cpuEntry(10, 105, 115, 0)];

    // 15 busy seconds on 4 cores over 10 seconds wall time: 15 / 40 = 37.5%
    expect(getCpuSeries(history, vm)).toEqual([{ time: 10, value: 37.5 }]);
  });

  it("clamps usage to 100%", () => {
    const history = [cpuEntry(0, 100, 100), cpuEntry(10, 100, 150)];

    // 50 busy seconds on 2 cores over 10 seconds wall time would be 250%
    expect(getCpuSeries(history, instance)).toEqual([{ time: 10, value: 100 }]);
  });

  it("drops negative deltas from counter resets", () => {
    const history = [cpuEntry(0, 100, 100), cpuEntry(10, 1, 2)];

    expect(getCpuSeries(history, instance)).toEqual([]);
  });

  it("ignores snapshots without data for the instance", () => {
    const otherInstance = { time: 5, metric: [] };
    const history = [
      cpuEntry(0, 100, 100),
      otherInstance,
      cpuEntry(10, 105, 115),
    ];

    expect(getCpuSeries(history, instance)).toEqual([{ time: 10, value: 75 }]);
  });
});

describe("getMemorySeries", () => {
  it("returns empty series on empty history", () => {
    expect(getMemorySeries([], instance)).toEqual([]);
  });

  it("maps each snapshot to a point", () => {
    const history = [
      memoryEntry(0, 500, 100, 1000),
      memoryEntry(15, 400, 150, 1000),
    ];

    expect(getMemorySeries(history, instance)).toEqual([
      { time: 0, used: 400, cached: 100, total: 1000 },
      { time: 15, used: 450, cached: 150, total: 1000 },
    ]);
  });

  it("skips snapshots without memory data", () => {
    const history = [
      memoryEntry(0, 500, 100, 1000),
      { time: 5, metric: [] },
      memoryEntry(15, 400, 150, 1000),
    ];

    expect(getMemorySeries(history, instance)).toEqual([
      { time: 0, used: 400, cached: 100, total: 1000 },
      { time: 15, used: 450, cached: 150, total: 1000 },
    ]);
  });
});
