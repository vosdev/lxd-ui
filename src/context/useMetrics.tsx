import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAuth } from "./auth";
import { queryKeys } from "util/queryKeys";
import { fetchMetrics } from "api/metrics";
import type { LxdMetricGroup } from "types/metrics";
import { useServerEntitlements } from "util/entitlements/server";
import { useMetricHistory } from "context/metricHistory";

export const useMetrics = (
  location: string,
): UseQueryResult<LxdMetricGroup[]> => {
  const { isRestricted, isFineGrained } = useAuth();
  const { canViewMetrics } = useServerEntitlements();
  const { setMetricEntry, getMetricHistory } = useMetricHistory();

  return useQuery({
    queryKey: [queryKeys.metrics, location],
    queryFn: async () =>
      fetchMetrics(location).then((metric) => {
        setMetricEntry({ time: Date.now() / 1000, metric });
        return metric;
      }),
    // cpu usage is a delta between two snapshots, so poll quickly until a
    // second snapshot exists, then fall back to the regular interval
    refetchInterval: () => (getMetricHistory().length < 2 ? 3000 : 15 * 1000),
    enabled: !isRestricted && isFineGrained !== null && canViewMetrics(),
  });
};
