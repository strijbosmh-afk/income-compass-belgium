import { useMemo, useState, useEffect } from 'react';
import { Line, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer, Area, ComposedChart, Brush, CartesianGrid } from 'recharts';
import { Goal, GoalMetric, GoalIncomeType } from '@/hooks/useGoals';

type IncomeRecord = {
  year: number;
  month: number;
  income_type: string;
  total_amount: number;
  aandeel_arts: number;
  netto: number;
};

const MONTH_SHORT = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const MONTH_LONG = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
const QUARTER_MONTHS: Record<number, [number, number]> = { 1: [1, 3], 2: [4, 6], 3: [7, 9], 4: [10, 12] };

function metricValue(r: IncomeRecord, m: GoalMetric): number {
  if (m === 'bruto') return r.total_amount;
  if (m === 'aandeel_arts') return r.aandeel_arts;
  return r.netto;
}

function matchType(r: IncomeRecord, t: GoalIncomeType): boolean {
  return t === 'all' ? true : r.income_type === t;
}

function buildBuckets(goal: Goal): { label: string; longLabel: string; monthIdx: number }[] {
  if (goal.period_type === 'year') {
    return MONTH_SHORT.map((label, i) => ({ label, longLabel: `${MONTH_LONG[i]} ${goal.year}`, monthIdx: i + 1 }));
  }
  if (goal.period_type === 'quarter') {
    const [m1, m2] = QUARTER_MONTHS[goal.period_value || 1];
    return [m1, m1 + 1, m2].map(m => ({ label: MONTH_SHORT[m - 1], longLabel: `${MONTH_LONG[m - 1]} ${goal.year}`, monthIdx: m }));
  }
  const m = goal.period_value || 1;
  return [{ label: MONTH_SHORT[m - 1], longLabel: `${MONTH_LONG[m - 1]} ${goal.year}`, monthIdx: m }];
}

const fmtCompact = (v: number) =>
  v >= 1000 ? `€${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `€${v.toFixed(0)}`;

const fmtFull = (v: number) =>
  `€ ${v.toLocaleString('de-BE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

type Datum = {
  label: string;
  longLabel: string;
  werkelijk: number | null;
  doel: number;
  periodeWerkelijk: number; // bedrag van die periode (niet cumulatief)
  gap: number | null; // werkelijk - doel
  pctVanDoel: number | null; // werkelijk / goal.amount
};

function CustomTooltip({ active, payload, totalTarget }: { active?: boolean; payload?: any[]; totalTarget: number }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload as Datum;
  const gapTone = d.gap == null ? '' : d.gap >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  return (
    <div className="rounded-md border border-border/70 bg-background shadow-lg px-3 py-2 text-xs space-y-1.5 min-w-[180px]">
      <div className="font-semibold text-foreground">{d.longLabel}</div>
      <div className="space-y-0.5 border-t border-border/50 pt-1.5">
        {d.werkelijk != null && (
          <div className="flex justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block w-2 h-2 rounded-sm bg-primary" /> Werkelijk (cum.)
            </span>
            <span className="font-medium tabular-nums">{fmtFull(d.werkelijk)}</span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block w-2 border-t border-dashed border-muted-foreground" /> Doel (lineair)
          </span>
          <span className="font-medium tabular-nums">{fmtFull(d.doel)}</span>
        </div>
        {d.gap != null && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Verschil</span>
            <span className={`font-medium tabular-nums ${gapTone}`}>
              {d.gap >= 0 ? '+' : ''}{fmtFull(d.gap)}
            </span>
          </div>
        )}
        {d.pctVanDoel != null && totalTarget > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">% van eind­doel</span>
            <span className="font-medium tabular-nums">{(d.pctVanDoel * 100).toFixed(1)}%</span>
          </div>
        )}
        <div className="flex justify-between gap-4 border-t border-border/50 pt-1 mt-1">
          <span className="text-muted-foreground">In deze periode</span>
          <span className="font-medium tabular-nums">{fmtFull(d.periodeWerkelijk)}</span>
        </div>
      </div>
    </div>
  );
}

type ChartProps = {
  goal: Goal;
  records: IncomeRecord[];
  fullHeight?: boolean;
  selectable?: boolean;
  selected?: Set<string>;
  onToggleSelect?: (label: string) => void;
  onDataReady?: (data: Datum[]) => void;
};

export function GoalTrendChart({ goal, records, fullHeight, selectable, selected, onToggleSelect, onDataReady }: ChartProps) {
  const [zoomReset, setZoomReset] = useState(0);

  const data: Datum[] = useMemo(() => {
    const buckets = buildBuckets(goal);
    const target = goal.amount || 0;

    if (goal.period_type === 'month') {
      const m = goal.period_value || 1;
      const recs = records.filter(r => r.year === goal.year && r.month === m && matchType(r, goal.income_type));
      const actual = recs.reduce((s, r) => s + metricValue(r, goal.metric), 0);
      return [0, 0.25, 0.5, 0.75, 1].map((f, i) => {
        const isLast = i === 4;
        const werkelijk = isLast ? actual : null;
        const doel = target * f;
        return {
          label: `W${i + 1}`,
          longLabel: `Week ${i + 1} – ${MONTH_LONG[m - 1]} ${goal.year}`,
          werkelijk,
          doel,
          periodeWerkelijk: isLast ? actual : 0,
          gap: werkelijk == null ? null : werkelijk - doel,
          pctVanDoel: werkelijk == null || target === 0 ? null : werkelijk / target,
        };
      });
    }

    let cum = 0;
    const stepTarget = target / buckets.length;
    return buckets.map((b, i) => {
      const recs = records.filter(r => r.year === goal.year && r.month === b.monthIdx && matchType(r, goal.income_type));
      const monthSum = recs.reduce((s, r) => s + metricValue(r, goal.metric), 0);
      cum += monthSum;
      const doel = stepTarget * (i + 1);
      return {
        label: b.label,
        longLabel: b.longLabel,
        werkelijk: cum,
        doel,
        periodeWerkelijk: monthSum,
        gap: cum - doel,
        pctVanDoel: target === 0 ? null : cum / target,
      };
    });
  }, [goal, records]);

  useEffect(() => { onDataReady?.(data); }, [data, onDataReady]);

  const maxVal = Math.max(goal.amount, ...data.map(d => Math.max(d.doel || 0, d.werkelijk || 0)));
  const showBrush = fullHeight && data.length > 4;

  // Custom dot voor selectie-mode: ster-vorm of grotere ring voor geselecteerde periodes
  const renderDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || payload?.werkelijk == null) return <g />;
    const isSel = selectable && selected?.has(payload.label);
    const baseR = fullHeight ? 3.5 : 2.5;
    return (
      <g>
        {isSel && (
          <circle cx={cx} cy={cy} r={baseR + 4} fill="hsl(var(--primary))" fillOpacity={0.18} stroke="hsl(var(--primary))" strokeWidth={1.5} />
        )}
        <circle cx={cx} cy={cy} r={baseR} fill="hsl(var(--primary))" />
      </g>
    );
  };

  const handleClick = (state: any) => {
    if (!selectable || !onToggleSelect) return;
    const label = state?.activeLabel ?? state?.activePayload?.[0]?.payload?.label;
    if (label) onToggleSelect(label);
  };

  return (
    <div className={fullHeight ? 'h-full w-full flex flex-col' : 'h-32 -mx-1'}>
      {fullHeight && showBrush && (
        <div className="flex justify-end mb-1">
          <button
            type="button"
            onClick={() => setZoomReset(z => z + 1)}
            className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Zoom resetten
          </button>
        </div>
      )}
      <div className={fullHeight ? 'flex-1 min-h-0' : 'h-full'}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart key={zoomReset} data={data} margin={{ top: 8, right: 16, left: fullHeight ? 16 : 0, bottom: showBrush ? 4 : 4 }} onClick={handleClick} style={selectable ? { cursor: 'pointer' } : undefined}>
            <defs>
              <linearGradient id={`gradient-${goal.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            {fullHeight && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />}
            <XAxis dataKey="label" tick={{ fontSize: fullHeight ? 12 : 10 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
            {fullHeight ? (
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} tickFormatter={fmtCompact} domain={[0, maxVal * 1.05 || 1]} />
            ) : (
              <YAxis hide domain={[0, maxVal * 1.05 || 1]} />
            )}
            <Tooltip
              cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '3 3' }}
              content={<CustomTooltip totalTarget={goal.amount} />}
              wrapperStyle={{ outline: 'none', zIndex: 50 }}
            />
            <ReferenceLine
              y={goal.amount}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="2 3"
              strokeOpacity={0.6}
              label={fullHeight ? { value: `Eind­doel ${fmtCompact(goal.amount)}`, position: 'insideTopRight', fill: 'hsl(var(--muted-foreground))', fontSize: 10 } : undefined}
            />
            <Area
              type="monotone"
              dataKey="werkelijk"
              name="Werkelijk"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill={`url(#gradient-${goal.id})`}
              dot={selectable ? renderDot : { r: fullHeight ? 3.5 : 2.5, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
              activeDot={{ r: fullHeight ? 5 : 4, stroke: 'hsl(var(--background))', strokeWidth: 2 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="doel"
              name="Doel"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: fullHeight ? 4 : 3, fill: 'hsl(var(--muted-foreground))', strokeWidth: 0 }}
            />
            {showBrush && (
              <Brush
                dataKey="label"
                height={22}
                stroke="hsl(var(--primary))"
                fill="hsl(var(--muted))"
                travellerWidth={8}
                tickFormatter={() => ''}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
