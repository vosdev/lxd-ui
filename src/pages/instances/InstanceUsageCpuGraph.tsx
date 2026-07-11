import type { FC } from "react";
import UsageGraph from "components/UsageGraph";
import { getCpuSeries } from "util/metricHistorySeries";
import type { LxdInstance } from "types/instance";
import { useMetricHistory } from "context/metricHistory";

interface Props {
  instance: LxdInstance;
}

const InstanceUsageCpuGraph: FC<Props> = ({ instance }) => {
  const { getMetricHistory } = useMetricHistory();
  const series = getCpuSeries(getMetricHistory(), instance);
  const current = series[series.length - 1];

  return (
    <UsageGraph
      points={series}
      maxValue={100}
      formatValue={(value) => `${Math.round(value * 10) / 10}%`}
      label={current ? `${Math.round(current.value * 100) / 100}%` : ""}
    />
  );
};

export default InstanceUsageCpuGraph;
