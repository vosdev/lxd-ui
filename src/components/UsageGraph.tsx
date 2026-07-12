import { useEffect, useRef, useState, type FC, type MouseEvent } from "react";

export interface UsageGraphPoint {
  time: number; // seconds since epoch
  value: number;
}

export interface UsageGraphSeries {
  name: string; // shown in the tooltip and legend, e.g. "used" or "/"
  color: string;
  points: UsageGraphPoint[];
  // stacked series sit on top of the running total of earlier stacked series
  // in the same graph (e.g. cached memory on top of used memory). Independent
  // series are each drawn from the baseline (e.g. one line per filesystem).
  stacked?: boolean;
  fill?: "solid" | "faint" | "none";
  drawLine?: boolean; // defaults to true
  showInLegend?: boolean;
  legendValue?: string; // extra text after the legend name, e.g. "12 GiB of 47 GiB"
}

interface Props {
  series: UsageGraphSeries[];
  maxValue: number;
  formatValue: (value: number) => string;
  showTotalInTooltip?: boolean; // add a "Total" line summing the stacked series
}

const HEIGHT = 140;
const MARGIN = { top: 6, right: 1, bottom: 22, left: 52 };
const WINDOW_SECONDS = 30 * 60;
const GRID_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
const LABELED_FRACTIONS = [0, 0.5, 1];
// approximate height of the tooltip, used to flip it below the point instead
// of clipping above the graph
const TOOLTIP_HEIGHT = 80;

const formatTimeAgo = (seconds: number): string => {
  if (seconds < 5) {
    return "now";
  }
  if (seconds < 90) {
    return `${Math.round(seconds)}s ago`;
  }
  return `${Math.round(seconds / 60)} min ago`;
};

const valueAtTime = (
  points: UsageGraphPoint[],
  time: number,
): number | undefined => {
  if (points.length === 0) {
    return undefined;
  }
  let nearest = points[0];
  points.forEach((point) => {
    if (Math.abs(point.time - time) < Math.abs(nearest.time - time)) {
      nearest = point;
    }
  });
  return nearest.value;
};

const UsageGraph: FC<Props> = ({
  series,
  maxValue,
  formatValue,
  showTotalInTooltip,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const observer = new ResizeObserver(() => {
      setWidth(container.getBoundingClientRect().width);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  const allTimes = series.flatMap((item) => item.points.map((p) => p.time));
  const windowEnd = allTimes.length ? Math.max(...allTimes) : 0;
  const windowStartRaw = allTimes.length ? Math.min(...allTimes) : 0;
  const windowStart = Math.max(windowStartRaw, windowEnd - WINDOW_SECONDS);
  const windowDuration = Math.max(windowEnd - windowStart, 1);

  const visibleSeries = series.map((item) => ({
    ...item,
    points: item.points.filter((point) => point.time >= windowStart),
  }));

  const hasGraph =
    width > 0 &&
    maxValue > 0 &&
    visibleSeries.some((item) => item.points.length >= 2);

  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const plotBottom = MARGIN.top + plotHeight;

  const getX = (time: number): number => {
    return MARGIN.left + ((time - windowStart) / windowDuration) * plotWidth;
  };

  const getY = (value: number): number => {
    const fraction = Math.min(Math.max(value / maxValue, 0), 1);
    return MARGIN.top + plotHeight - fraction * plotHeight;
  };

  // for stacked series, the y-position is the running total of earlier stacked
  // series plus this one; the area fills down to the running total below it
  const stackedBaseAt = (seriesIndex: number, time: number): number => {
    let base = 0;
    for (let i = 0; i < seriesIndex; i++) {
      if (visibleSeries[i].stacked) {
        base += valueAtTime(visibleSeries[i].points, time) ?? 0;
      }
    }
    return base;
  };

  const topValue = (
    item: (typeof visibleSeries)[number],
    seriesIndex: number,
    point: UsageGraphPoint,
  ): number => {
    return item.stacked
      ? stackedBaseAt(seriesIndex, point.time) + point.value
      : point.value;
  };

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const mouseTime =
      windowStart +
      ((event.clientX - bounds.left - MARGIN.left) / plotWidth) *
        windowDuration;
    let nearest: number | null = null;
    allTimes.forEach((time) => {
      if (
        time >= windowStart &&
        (nearest === null ||
          Math.abs(time - mouseTime) < Math.abs(nearest - mouseTime))
      ) {
        nearest = time;
      }
    });
    setHoverTime(nearest);
  };

  const hoverEntries =
    hoverTime !== null
      ? visibleSeries
          .map((item, index) => {
            const value = valueAtTime(item.points, hoverTime);
            if (value === undefined) {
              return null;
            }
            return {
              name: item.name,
              value,
              top: topValue(item, index, { time: hoverTime, value }),
            };
          })
          .filter((entry) => entry !== null)
      : [];

  const hoverTopY = hoverEntries.length
    ? Math.min(...hoverEntries.map((entry) => getY(entry.top)))
    : 0;
  const flipTooltipBelow = hoverTopY - MARGIN.top < TOOLTIP_HEIGHT;
  const tooltipTotal = hoverEntries
    .filter((_, index) => visibleSeries[index]?.stacked)
    .reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div className="usage-graph" ref={containerRef}>
      {hasGraph ? (
        <svg
          height={HEIGHT}
          width={width}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            setHoverTime(null);
          }}
        >
          {GRID_FRACTIONS.map((fraction) => (
            <g key={fraction}>
              <line
                className="usage-graph__grid-line"
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={getY(maxValue * fraction)}
                y2={getY(maxValue * fraction)}
              />
              {LABELED_FRACTIONS.includes(fraction) && (
                <text
                  className="usage-graph__axis-label"
                  x={MARGIN.left - 6}
                  y={getY(maxValue * fraction) + 3}
                  textAnchor="end"
                >
                  {formatValue(maxValue * fraction)}
                </text>
              )}
            </g>
          ))}
          {LABELED_FRACTIONS.map((fraction) => {
            const time = windowStart + windowDuration * fraction;
            return (
              <text
                key={fraction}
                className="usage-graph__axis-label"
                x={getX(time)}
                y={HEIGHT - 6}
                textAnchor={
                  fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"
                }
              >
                {formatTimeAgo(windowEnd - time)}
              </text>
            );
          })}
          {visibleSeries.map((item, index) => {
            if (item.points.length < 2) {
              return null;
            }
            const topCoords = item.points.map(
              (point) =>
                `${getX(point.time)},${getY(topValue(item, index, point))}`,
            );
            const linePath = `M${topCoords.join(" L")}`;
            const fill = item.fill ?? "none";
            let areaPath: string | null = null;
            if (fill !== "none") {
              const bottomCoords = [...item.points]
                .reverse()
                .map(
                  (point) =>
                    `${getX(point.time)},${item.stacked ? getY(stackedBaseAt(index, point.time)) : plotBottom}`,
                );
              areaPath = `${linePath} L${bottomCoords.join(" L")} Z`;
            }
            return (
              <g key={item.name}>
                {areaPath && (
                  <path
                    d={areaPath}
                    fill={item.color}
                    fillOpacity={fill === "solid" ? 1 : 0.15}
                  />
                )}
                {(item.drawLine ?? true) && (
                  <path
                    d={linePath}
                    fill="none"
                    stroke={item.color}
                    strokeWidth={1.5}
                  />
                )}
              </g>
            );
          })}
          {hoverTime !== null && hoverEntries.length > 0 && (
            <g>
              <line
                className="usage-graph__crosshair"
                x1={getX(hoverTime)}
                x2={getX(hoverTime)}
                y1={MARGIN.top}
                y2={plotBottom}
              />
              {hoverEntries.map((entry, index) => (
                <circle
                  key={visibleSeries[index].name}
                  className="usage-graph__marker"
                  cx={getX(hoverTime)}
                  cy={getY(entry.top)}
                  r={3}
                  fill={visibleSeries[index].color}
                />
              ))}
            </g>
          )}
        </svg>
      ) : (
        <div
          className="usage-graph__placeholder u-text--muted p-text--small"
          style={{ height: `${HEIGHT}px` }}
        >
          Collecting usage data...
        </div>
      )}
      {hoverTime !== null && hoverEntries.length > 0 && (
        <div
          className="usage-graph__tooltip"
          style={{
            left: Math.min(Math.max(getX(hoverTime), 70), width - 70),
            top: flipTooltipBelow ? hoverTopY + 8 : hoverTopY - 8,
            transform: flipTooltipBelow
              ? "translate(-50%, 0)"
              : "translate(-50%, -100%)",
          }}
        >
          <div className="u-text--muted">
            {new Date(hoverTime * 1000).toLocaleTimeString()}
          </div>
          {hoverEntries.map((entry) => (
            <div key={entry.name}>
              {entry.name ? `${entry.name}: ` : ""}
              {formatValue(entry.value)}
            </div>
          ))}
          {showTotalInTooltip && <div>Total: {formatValue(tooltipTotal)}</div>}
        </div>
      )}
      {visibleSeries.some((item) => item.showInLegend) && (
        <div className="usage-graph__legend p-text--small u-no-margin--bottom">
          {visibleSeries
            .filter((item) => item.showInLegend)
            .map((item) => (
              <span key={item.name} className="usage-graph__legend-item">
                <span
                  className="usage-graph__legend-swatch"
                  style={{ backgroundColor: item.color }}
                />
                <span className="u-text--muted">
                  {item.name}
                  {item.legendValue ? ` — ${item.legendValue}` : ""}
                </span>
              </span>
            ))}
        </div>
      )}
    </div>
  );
};

export default UsageGraph;
