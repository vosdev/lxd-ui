import type { FC } from "react";
import UsageGraph from "components/UsageGraph";
import { getFilesystemSeries } from "util/metricHistorySeries";
import type { LxdInstance } from "types/instance";
import { useMetricHistory } from "context/metricHistory";
import { humanFileSize } from "util/helpers";

interface Props {
  instance: LxdInstance;
}

// distinct hues for the individual filesystem lines; the first (root) reuses
// the same blue as the CPU and memory graphs
const FILESYSTEM_COLORS = [
  "#06c",
  "#0e8420",
  "#c7162b",
  "#f99b11",
  "#77216f",
  "#00b3a4",
];

const InstanceUsageFilesystemGraph: FC<Props> = ({ instance }) => {
  const { getMetricHistory } = useMetricHistory();
  const filesystems = getFilesystemSeries(getMetricHistory(), instance);

  // a single filesystem gets a filled area to match the CPU/memory graphs;
  // multiple filesystems are drawn as lines so their fills don't overlap
  const fill = filesystems.length > 1 ? "none" : "faint";

  return (
    <UsageGraph
      series={filesystems.map((filesystem, index) => ({
        name: filesystem.device,
        color: FILESYSTEM_COLORS[index % FILESYSTEM_COLORS.length],
        points: filesystem.points,
        fill,
        showInLegend: true,
        legendValue: `${humanFileSize(filesystem.used)} of ${humanFileSize(filesystem.total)}`,
      }))}
      maxValue={100}
      formatValue={(value) => `${Math.round(value * 10) / 10}%`}
    />
  );
};

export default InstanceUsageFilesystemGraph;
