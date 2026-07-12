import type { FC } from "react";
import UsageGraph from "components/UsageGraph";
import { getMemorySeries } from "util/metricHistorySeries";
import type { LxdInstance } from "types/instance";
import { useMetricHistory } from "context/metricHistory";
import { humanFileSize } from "util/helpers";

interface Props {
  instance: LxdInstance;
}

const InstanceUsageMemoryGraph: FC<Props> = ({ instance }) => {
  const { getMetricHistory } = useMetricHistory();
  const series = getMemorySeries(getMetricHistory(), instance);

  // scale the y-axis to the highest total reported in the visible window,
  // rather than just the latest sample. A memory limit change (or a single
  // transient bad reading right after one) would otherwise make the axis
  // snap to an inconsistent scale for one sample.
  const maxValue = series.reduce((max, point) => Math.max(max, point.total), 0);

  return (
    <UsageGraph
      series={[
        {
          name: "used",
          color: "#06c",
          points: series.map((point) => ({
            time: point.time,
            value: point.used,
          })),
          stacked: true,
          fill: "solid",
        },
        {
          name: "cached",
          color: "#06c",
          points: series.map((point) => ({
            time: point.time,
            value: point.cached,
          })),
          stacked: true,
          fill: "faint",
          drawLine: false,
        },
      ]}
      maxValue={maxValue}
      formatValue={humanFileSize}
      showTotalInTooltip
    />
  );
};

export default InstanceUsageMemoryGraph;
