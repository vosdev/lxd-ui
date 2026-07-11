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

  return (
    <UsageGraph
      points={series.map((point) => ({
        time: point.time,
        value: point.used,
        secondaryValue: point.cached,
      }))}
      maxValue={current?.total ?? 0}
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
