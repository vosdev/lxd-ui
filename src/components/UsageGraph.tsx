import { useEffect, useRef, useState, type FC, type MouseEvent } from "react";

export interface UsageGraphPoint {
  time: number; // seconds since epoch
  value: number;
  secondaryValue?: number; // stacked on top of value, e.g. cached memory
}

interface Props {
  points: UsageGraphPoint[];
  maxValue: number;
  formatValue: (value: number) => string;
  label: string;
  valueLabel?: string;
  secondaryLabel?: string;
}

const HEIGHT = 140;
const MARGIN = { top: 6, right: 1, bottom: 22, left: 52 };
const WINDOW_SECONDS = 30 * 60;
const GRID_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
const LABELED_FRACTIONS = [0, 0.5, 1];

const formatTimeAgo = (seconds: number): string => {
  if (seconds < 5) {
    return "now";
  }
  if (seconds < 90) {
    return `${Math.round(seconds)}s ago`;
  }
  return `${Math.round(seconds / 60)} min ago`;
};

const UsageGraph: FC<Props> = ({
  points,
  maxValue,
  formatValue,
  label,
  valueLabel,
  secondaryLabel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

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

  const hasGraph = points.length >= 2 && maxValue > 0 && width > 0;

  const lastPoint = points[points.length - 1];
  const windowStart = hasGraph
    ? Math.max(points[0].time, lastPoint.time - WINDOW_SECONDS)
    : 0;
  const windowDuration = hasGraph
    ? Math.max(lastPoint.time - windowStart, 1)
    : 1;
  const visiblePoints = hasGraph
    ? points.filter((point) => point.time >= windowStart)
    : [];

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

  const lineCoords = visiblePoints
    .map((point) => `${getX(point.time)},${getY(point.value)}`)
    .join(" L");
  const linePath = `M${lineCoords}`;
  const areaPath =
    `${linePath}` +
    ` L${getX(lastPoint?.time ?? 0)},${plotBottom}` +
    ` L${getX(visiblePoints[0]?.time ?? 0)},${plotBottom} Z`;

  const hasSecondary = visiblePoints.some(
    (point) => (point.secondaryValue ?? 0) > 0,
  );
  const secondaryTopCoords = visiblePoints
    .map(
      (point) =>
        `${getX(point.time)},${getY(point.value + (point.secondaryValue ?? 0))}`,
    )
    .join(" L");
  const secondaryPath =
    `M${secondaryTopCoords} L` +
    [...visiblePoints]
      .reverse()
      .map((point) => `${getX(point.time)},${getY(point.value)}`)
      .join(" L") +
    " Z";

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - bounds.left;
    let nearest = 0;
    visiblePoints.forEach((point, index) => {
      const distance = Math.abs(getX(point.time) - mouseX);
      if (distance < Math.abs(getX(visiblePoints[nearest].time) - mouseX)) {
        nearest = index;
      }
    });
    setHoverIndex(nearest);
  };

  const hoverPoint =
    hoverIndex !== null ? visiblePoints[hoverIndex] : undefined;

  return (
    <div className="usage-graph" ref={containerRef}>
      {hasGraph ? (
        <svg
          height={HEIGHT}
          width={width}
          role="img"
          aria-label={label}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            setHoverIndex(null);
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
                {formatTimeAgo(lastPoint.time - time)}
              </text>
            );
          })}
          <path className="usage-graph__area" d={areaPath} />
          {hasSecondary && (
            <path className="usage-graph__area--secondary" d={secondaryPath} />
          )}
          <path className="usage-graph__line" d={linePath} />
          {hoverPoint && (
            <g>
              <line
                className="usage-graph__crosshair"
                x1={getX(hoverPoint.time)}
                x2={getX(hoverPoint.time)}
                y1={MARGIN.top}
                y2={plotBottom}
              />
              <circle
                className="usage-graph__marker"
                cx={getX(hoverPoint.time)}
                cy={getY(hoverPoint.value)}
                r={3}
              />
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
      {hoverPoint && (
        <div
          className="usage-graph__tooltip"
          style={{
            left: Math.min(Math.max(getX(hoverPoint.time), 70), width - 70),
            top: getY(hoverPoint.value + (hoverPoint.secondaryValue ?? 0)) - 8,
          }}
        >
          <div className="u-text--muted">
            {new Date(hoverPoint.time * 1000).toLocaleTimeString()}
          </div>
          <div>
            {valueLabel ? `${valueLabel}: ` : ""}
            {formatValue(hoverPoint.value)}
          </div>
          {secondaryLabel && hoverPoint.secondaryValue !== undefined && (
            <div>
              {secondaryLabel}: {formatValue(hoverPoint.secondaryValue)}
            </div>
          )}
        </div>
      )}
      <div className="p-text--small u-no-margin--bottom u-text--muted">
        {label}
      </div>
    </div>
  );
};

export default UsageGraph;
