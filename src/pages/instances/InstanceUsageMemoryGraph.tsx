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
  const current = series[series.length - 1];

  // scale the y-axis to the highest total reported in the visible window,
  // rather than just the latest sample. A memory limit change (or a single
  // transient bad reading right after one) would otherwise make the axis
  // snap to an inconsistent scale for one sample.
  const maxValue = series.reduce((max, point) => Math.max(max, point.total), 0);

  return (
    <UsageGraph
      points={series.map((point) => ({
        time: point.time,
        value: point.used,
        secondaryValue: point.cached,
        total: point.used + point.cached,
      }))}
      maxValue={maxValue}
      formatValue={humanFileSize}
      label={
        current
          ? humanFileSize(current.used + current.cached) +
            " of " +
            humanFileSize(current.total)
          : ""
      }
      valueLabel="used"
      secondaryLabel="cached"
    />
  );
};

export default InstanceUsageMemoryGraph;
