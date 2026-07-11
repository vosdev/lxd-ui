import { createContext, useContext, type FC, type ReactNode } from "react";
import type { LxdMetricGroup } from "types/metrics";

export interface MetricHistoryEntry {
  time: number;
  metric: LxdMetricGroup[];
}

export interface MetricHistory {
  getMetricHistory: () => MetricHistoryEntry[];
  setMetricEntry: (newEntry: MetricHistoryEntry) => void;
}

const MetricHistoryContext = createContext<MetricHistory>({
  getMetricHistory: () => [],
  setMetricEntry: () => () => {},
});

interface Props {
  children: ReactNode;
}

// 120 entries at the 15 second poll interval covers 30 minutes of history
const MAX_HISTORY_ENTRIES = 120;

let history: MetricHistoryEntry[] = [];

export const MetricHistoryProvider: FC<Props> = ({ children }) => {
  return (
    <MetricHistoryContext.Provider
      value={{
        getMetricHistory: () => history,
        setMetricEntry: (newEntry: MetricHistoryEntry) => {
          history = [...history.slice(-(MAX_HISTORY_ENTRIES - 1)), newEntry];
        },
      }}
    >
      {children}
    </MetricHistoryContext.Provider>
  );
};

export function useMetricHistory() {
  return useContext(MetricHistoryContext);
}
