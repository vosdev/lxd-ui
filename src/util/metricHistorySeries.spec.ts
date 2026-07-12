import {
  getCpuSeries,
  getFilesystemSeries,
  getMemorySeries,
} from "util/metricHistorySeries";
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

interface FsEntry {
  device: string;
  mountpoint: string;
  free: number;
  total: number;
}

const filesystemEntry = (
  time: number,
  filesystems: FsEntry[],
): MetricHistoryEntry => ({
  time,
  metric: [
    {
      name: "lxd_filesystem_free_bytes",
      help: "",
      type: "GAUGE",
      metrics: filesystems.map((fs) => ({
        labels: { ...labels, device: fs.device, mountpoint: fs.mountpoint },
        value: String(fs.free),
      })),
    },
    {
      name: "lxd_filesystem_size_bytes",
      help: "",
      type: "GAUGE",
      metrics: filesystems.map((fs) => ({
        labels: { ...labels, device: fs.device, mountpoint: fs.mountpoint },
        value: String(fs.total),
      })),
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

describe("getFilesystemSeries", () => {
  it("returns empty series on empty history", () => {
    expect(getFilesystemSeries([], instance)).toEqual([]);
  });

  it("builds a percentage series for the root filesystem", () => {
    const history = [
      filesystemEntry(0, [
        { device: "sda1", mountpoint: "/", free: 750, total: 1000 },
      ]),
      filesystemEntry(15, [
        { device: "sda1", mountpoint: "/", free: 500, total: 1000 },
      ]),
    ];

    expect(getFilesystemSeries(history, instance)).toEqual([
      {
        device: "/",
        used: 500,
        total: 1000,
        points: [
          { time: 0, value: 25 },
          { time: 15, value: 50 },
        ],
      },
    ]);
  });

  it("keeps the root filesystem first, other filesystems after", () => {
    const history = [
      filesystemEntry(0, [
        { device: "sda1", mountpoint: "/", free: 500, total: 1000 },
        { device: "sdb1", mountpoint: "/data", free: 200, total: 400 },
      ]),
    ];

    const series = getFilesystemSeries(history, instance);

    expect(series.map((item) => item.device)).toEqual(["/", "sdb1"]);
    expect(series[1]).toEqual({
      device: "sdb1",
      used: 200,
      total: 400,
      points: [{ time: 0, value: 50 }],
    });
  });

  it("collects a separate series per device across snapshots", () => {
    const history = [
      filesystemEntry(0, [
        { device: "sda1", mountpoint: "/", free: 900, total: 1000 },
        { device: "sdb1", mountpoint: "/data", free: 100, total: 200 },
      ]),
      filesystemEntry(15, [
        { device: "sda1", mountpoint: "/", free: 800, total: 1000 },
        { device: "sdb1", mountpoint: "/data", free: 50, total: 200 },
      ]),
    ];

    const series = getFilesystemSeries(history, instance);

    expect(series[0].points).toEqual([
      { time: 0, value: 10 },
      { time: 15, value: 20 },
    ]);
    expect(series[1].points).toEqual([
      { time: 0, value: 50 },
      { time: 15, value: 75 },
    ]);
  });
});
