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

  return (
    <UsageGraph
      series={[
        {
          name: "",
          color: "#06c",
          points: series,
          fill: "solid",
        },
      ]}
      maxValue={100}
      formatValue={(value) => `${Math.round(value * 10) / 10}%`}
    />
  );
};

export default InstanceUsageCpuGraph;
