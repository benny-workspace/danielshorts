import { useId, useMemo, useState } from 'react';

/**
 * Chart primitives, drawn as plain SVG.
 *
 * Hand-rolled rather than pulled from a charting library: the whole set is a
 * few hundred lines, it inherits the site's palette instead of fighting a
 * theme layer, and it keeps a dashboard that only one person will ever open
 * from adding a hundred kilobytes to the bundle every visitor downloads.
 *
 * Every chart scales to its container through a viewBox, so none of them need
 * a resize observer to stay readable on a phone.
 */

export const CHART_COLORS = [
  'rgb(226 86 110)',
  'rgb(212 175 106)',
  'rgb(125 176 214)',
  'rgb(151 208 168)',
  'rgb(186 142 214)',
  'rgb(226 146 108)',
];

const AXIS = 'rgb(139 131 148 / 0.55)';
const GRID = 'rgb(139 131 148 / 0.14)';

export const formatMoney = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatPct = (value: number) => `${value.toFixed(1)}%`;

const shortDay = (iso: string) => {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

/* ------------------------------------------------------------ line chart */

export interface Series {
  key: string;
  label: string;
  color: string;
  /** Draws this series against a second scale on the right, e.g. money. */
  axis?: 'left' | 'right';
  format?: (value: number) => string;
}

/**
 * Multi-series line chart over days.
 *
 * Series can opt into a right-hand scale, which is what lets revenue (dollars)
 * and visitors (counts) share one plot without the larger number flattening
 * the smaller into the axis.
 */
export function LineChart({
  data,
  series,
  height = 240,
}: {
  data: Array<Record<string, number | string> & { day: string }>;
  series: Series[];
  height?: number;
}) {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const width = 720;
  const pad = { top: 16, right: 52, bottom: 28, left: 46 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const scales = useMemo(() => {
    const maxOf = (axis: 'left' | 'right') => {
      const keys = series.filter((s) => (s.axis ?? 'left') === axis).map((s) => s.key);
      const values = data.flatMap((row) => keys.map((key) => Number(row[key]) || 0));
      // A flat-zero series still needs a non-zero range or every point lands on
      // the axis line and the chart reads as broken rather than as empty.
      return Math.max(...values, 1);
    };
    return { left: maxOf('left'), right: maxOf('right') };
  }, [data, series]);

  if (!data.length) return <Empty height={height} />;

  const x = (index: number) =>
    pad.left + (data.length === 1 ? plotW / 2 : (index / (data.length - 1)) * plotW);

  const y = (value: number, axis: 'left' | 'right') =>
    pad.top + plotH - (value / scales[axis]) * plotH;

  const linePath = (s: Series) =>
    data
      .map((row, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(Number(row[s.key]) || 0, s.axis ?? 'left').toFixed(1)}`)
      .join(' ');

  const areaPath = (s: Series) => {
    if (data.length < 2) return '';
    return `${linePath(s)} L${x(data.length - 1).toFixed(1)} ${(pad.top + plotH).toFixed(1)} L${x(0).toFixed(1)} ${(pad.top + plotH).toFixed(1)} Z`;
  };

  // Only ever label a handful of days, or the axis turns into a smear.
  const tickEvery = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`${series.map((s) => s.label).join(' and ')} over time`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={pad.left} y={pad.top} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const gy = pad.top + plotH * fraction;
          return (
            <g key={fraction}>
              <line x1={pad.left} y1={gy} x2={pad.left + plotW} y2={gy} stroke={GRID} strokeWidth={1} />
              <text x={pad.left - 8} y={gy + 3} textAnchor="end" fontSize={9} fill={AXIS}>
                {Math.round(scales.left * (1 - fraction))}
              </text>
            </g>
          );
        })}

        {series.some((s) => s.axis === 'right')
          ? [0, 0.5, 1].map((fraction) => (
              <text
                key={fraction}
                x={pad.left + plotW + 8}
                y={pad.top + plotH * fraction + 3}
                fontSize={9}
                fill={AXIS}
              >
                {formatMoney(scales.right * (1 - fraction))}
              </text>
            ))
          : null}

        <g clipPath={`url(#${clipId})`}>
          {series.map((s, index) => (
            <g key={s.key}>
              {index === 0 ? <path d={areaPath(s)} fill={s.color} opacity={0.1} /> : null}
              <path
                d={linePath(s)}
                fill="none"
                stroke={s.color}
                strokeWidth={1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          ))}
        </g>

        {hover !== null ? (
          <g>
            <line
              x1={x(hover)}
              y1={pad.top}
              x2={x(hover)}
              y2={pad.top + plotH}
              stroke="rgb(243 237 228 / 0.35)"
              strokeWidth={1}
            />
            {series.map((s) => (
              <circle
                key={s.key}
                cx={x(hover)}
                cy={y(Number(data[hover][s.key]) || 0, s.axis ?? 'left')}
                r={3.5}
                fill={s.color}
                stroke="rgb(10 8 16)"
                strokeWidth={1.5}
              />
            ))}
          </g>
        ) : null}

        {data.map((row, i) =>
          i % tickEvery === 0 || i === data.length - 1 ? (
            <text
              key={row.day}
              x={x(i)}
              y={height - 8}
              textAnchor="middle"
              fontSize={9}
              fill={AXIS}
            >
              {shortDay(row.day)}
            </text>
          ) : null,
        )}

        {/* One hit area per point, so the whole column is hoverable. */}
        {data.map((row, i) => (
          <rect
            key={`hit-${row.day}`}
            x={x(i) - plotW / Math.max(data.length, 1) / 2}
            y={pad.top}
            width={plotW / Math.max(data.length, 1)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-2 text-[0.6875rem] text-ivory-3">
            <span className="h-[2px] w-4" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {hover !== null ? (
          <span className="ml-auto text-[0.6875rem] text-ivory-2">
            {shortDay(data[hover].day)} ·{' '}
            {series
              .map((s) => {
                const value = Number(data[hover][s.key]) || 0;
                return `${s.label} ${s.format ? s.format(value) : value}`;
              })
              .join(' · ')}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- donut */

export function Donut({
  slices,
  height = 200,
  centerLabel,
  centerValue,
}: {
  slices: Array<{ label: string; value: number; color?: string }>;
  height?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (!total) return <Empty height={height} />;

  const size = 200;
  const center = size / 2;
  const radius = 78;
  const thickness = 26;

  let angle = -Math.PI / 2;

  const arcs = slices.map((slice, index) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    const start = angle;
    const end = angle + sweep;
    angle = end;

    const point = (a: number, r: number) => `${center + r * Math.cos(a)} ${center + r * Math.sin(a)}`;
    const outer = radius;
    const inner = radius - thickness;
    // A slice covering everything would start and end on the same point, which
    // an arc renders as nothing at all — so draw it as a ring instead.
    const large = sweep > Math.PI ? 1 : 0;

    const d =
      sweep >= Math.PI * 2 - 0.0001
        ? `M ${center - outer} ${center} a ${outer} ${outer} 0 1 0 ${outer * 2} 0 a ${outer} ${outer} 0 1 0 ${-outer * 2} 0 M ${center - inner} ${center} a ${inner} ${inner} 0 1 1 ${inner * 2} 0 a ${inner} ${inner} 0 1 1 ${-inner * 2} 0`
        : `M ${point(start, outer)} A ${outer} ${outer} 0 ${large} 1 ${point(end, outer)} L ${point(end, inner)} A ${inner} ${inner} 0 ${large} 0 ${point(start, inner)} Z`;

    return {
      d,
      color: slice.color ?? CHART_COLORS[index % CHART_COLORS.length],
      label: slice.label,
      value: slice.value,
      share: (slice.value / total) * 100,
    };
  });

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <svg viewBox={`0 0 ${size} ${size}`} style={{ height, width: height }} role="img" aria-label="Breakdown">
        {arcs.map((arc) => (
          <path key={arc.label} d={arc.d} fill={arc.color} fillRule="evenodd">
            <title>{`${arc.label}: ${arc.value} (${arc.share.toFixed(1)}%)`}</title>
          </path>
        ))}
        {centerValue ? (
          <>
            <text
              x={center}
              y={center - 2}
              textAnchor="middle"
              fontSize={22}
              fill="rgb(243 237 228)"
              fontFamily="var(--font-display)"
            >
              {centerValue}
            </text>
            <text x={center} y={center + 16} textAnchor="middle" fontSize={9} fill={AXIS}>
              {centerLabel ?? ''}
            </text>
          </>
        ) : null}
      </svg>

      <ul className="w-full min-w-0 flex-1 space-y-2">
        {arcs.map((arc) => (
          <li key={arc.label} className="flex items-center gap-2.5 text-[0.8125rem]">
            <span className="h-2.5 w-2.5 shrink-0" style={{ background: arc.color }} />
            <span className="min-w-0 flex-1 truncate text-ivory-2">{arc.label}</span>
            <span className="numeral shrink-0 text-ivory">{arc.value}</span>
            <span className="shrink-0 text-[0.6875rem] text-ivory-3">{arc.share.toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- funnel */

/**
 * The funnel as a stack of proportional bars.
 *
 * Each bar's width is its share of the top of the funnel, so the shape of the
 * drop-off is visible at a glance; the number that matters most for diagnosis
 * — the rate from the *previous* step — is called out separately, because a
 * step can look healthy against the top while quietly losing half the people
 * who reached it.
 */
export function FunnelBars({
  steps,
}: {
  steps: Array<{
    label: string;
    hint: string;
    visitors: number;
    rateFromTop: number;
    rateFromPrev: number;
    lost: number;
  }>;
}) {
  const top = steps[0]?.visitors ?? 0;

  return (
    <ol>
      {steps.map((step, index) => {
        const width = top > 0 ? Math.max((step.visitors / top) * 100, step.visitors > 0 ? 1.5 : 0) : 0;
        const leak = index > 0 && step.rateFromPrev < 60;

        return (
          // Each step is its own ruled block. Without the divider the hint text
          // sits closer to the next step's label than to the bar it describes,
          // and the whole column reads off by one.
          <li
            key={step.label}
            className="border-b border-line-soft py-3.5 first:pt-0 last:border-0 last:pb-0"
          >
            <div className="flex items-baseline justify-between gap-4 pb-1.5">
              <span className="text-[0.8125rem] text-ivory-2">
                <span className="numeral mr-2 text-ivory-3">{String(index + 1).padStart(2, '0')}</span>
                {step.label}
              </span>
              <span className="flex shrink-0 items-baseline gap-3">
                <span className="numeral text-base text-ivory">{step.visitors}</span>
                <span className="w-14 text-right text-[0.6875rem] text-ivory-3">
                  {formatPct(step.rateFromTop)}
                </span>
              </span>
            </div>

            <div className="h-7 w-full bg-ink-800">
              <div
                className="h-full transition-[width] duration-700"
                style={{
                  width: `${width}%`,
                  background:
                    index === 0
                      ? 'rgb(243 237 228 / 0.22)'
                      : leak
                        ? 'rgb(212 175 106 / 0.55)'
                        : 'rgb(226 86 110 / 0.55)',
                }}
              />
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-1.5 text-[0.6875rem] leading-relaxed">
              <span className="max-w-[62ch] text-ivory-3">{step.hint}</span>
              {index > 0 ? (
                <span
                  className="shrink-0"
                  style={{ color: leak ? 'var(--color-gold)' : 'var(--color-ivory-3)' }}
                >
                  {formatPct(step.rateFromPrev)} of previous
                  {step.lost > 0 ? ` · ${step.lost} lost` : ''}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------- bar list */

export function BarList({
  rows,
  format,
}: {
  rows: Array<{ label: string; value: number; sub?: string; tone?: string }>;
  format?: (value: number) => string;
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  if (!rows.length) return <Empty height={120} />;

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 pb-1">
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ivory-2">{row.label}</span>
            {row.sub ? <span className="shrink-0 text-[0.6875rem] text-ivory-3">{row.sub}</span> : null}
            <span className="numeral shrink-0 text-sm text-ivory">
              {format ? format(row.value) : row.value}
            </span>
          </div>
          <div className="h-1.5 w-full bg-ink-800">
            <div
              className="h-full"
              style={{
                width: `${(row.value / max) * 100}%`,
                background: row.tone ?? 'rgb(var(--accent) / 0.6)',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Empty({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center border border-dashed border-line-soft text-[0.6875rem] text-ivory-3"
      style={{ height }}
    >
      Nothing recorded in this window yet.
    </div>
  );
}
