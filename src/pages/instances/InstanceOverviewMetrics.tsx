import type { FC } from "react";
import { getInstanceMetricReport } from "util/metricSelectors";
import { Spinner } from "@canonical/react-components";
import type { LxdInstance } from "types/instance";
import { useAuth } from "context/auth";
import { useMetrics } from "context/useMetrics";
import InstanceUsageCpuGraph from "pages/instances/InstanceUsageCpuGraph";
import InstanceUsageMemoryGraph from "pages/instances/InstanceUsageMemoryGraph";
import InstanceUsageFilesystemGraph from "pages/instances/InstanceUsageFilesystemGraph";

interface Props {
  instance: LxdInstance;
  onFailure: (title: string, e: unknown) => void;
}

const InstanceOverviewMetrics: FC<Props> = ({ instance, onFailure }) => {
  const { isRestricted } = useAuth();

  const {
    data: serverMetrics = [],
    error,
    isLoading,
  } = useMetrics(instance.location);

  if (error) {
    onFailure("Loading metrics failed", error);
  }

  const instanceMetrics = getInstanceMetricReport(serverMetrics, instance);

  if (isRestricted) {
    return (
      <div className="u-text--muted">
        Details are not available for restricted users
      </div>
    );
  }

  const hasFilesystem =
    !!instanceMetrics.rootFilesystem ||
    instanceMetrics.otherFilesystems.length > 0;

  return (
    <>
      {isLoading ? (
        <Spinner className="u-loader" text="Loading metrics..." />
      ) : (
        <table>
          <tbody>
            <tr className="metric-row">
              <th className="u-text--muted">CPU</th>
              <td>
                {instanceMetrics.memory ? (
                  <InstanceUsageCpuGraph instance={instance} />
                ) : (
                  "-"
                )}
              </td>
            </tr>
            <tr className="metric-row">
              <th className="u-text--muted">Memory</th>
              <td>
                {instanceMetrics.memory ? (
                  <InstanceUsageMemoryGraph instance={instance} />
                ) : (
                  "-"
                )}
              </td>
            </tr>
            <tr className="metric-row">
              <th className="u-text--muted">Filesystem</th>
              <td>
                {hasFilesystem ? (
                  <InstanceUsageFilesystemGraph instance={instance} />
                ) : (
                  "-"
                )}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </>
  );
};

export default InstanceOverviewMetrics;
