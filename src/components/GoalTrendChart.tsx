import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer, Area, ComposedChart } from 'recharts';
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
const QUARTER_MONTHS: Record<number, [number, number]> = { 1: [1, 3], 2: [4, 6], 3: [7, 9], 4: [10, 12] };

function metricValue(r: IncomeRecord, m: GoalMetric): number {
  if (m === 'bruto') return r.total_amount;
  if (m === 'aandeel_arts') return r.aandeel_arts;
  return r.netto;
}

function matchType(r: IncomeRecord, t: GoalIncomeType): boolean {
  return t === 'all' ? true : r.income_type === t;
}

function buildBuckets(goal: Goal): { label: string; monthIdx: number }[] {
  if (goal.period_type === 'year') {
    return MONTH_SHORT.map((label, i) => ({ label, monthIdx: i + 1 }));
  }
  if (goal.period_type === 'quarter') {
    const [m1, m2] = QUARTER_MONTHS[goal.period_value || 1];
    return [m1, m1 + 1, m2].map(m => ({ label: MONTH_SHORT[m - 1], monthIdx: m }));
  }
  // maand: toon één bucket (de doel-maand)
  const m = goal.period_value || 1;
  return [{ label: MONTH_SHORT[m - 1], monthIdx: m }];
}

const fmtCompact = (v: number) =>
  v >= 1000 ? `€${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `€${v.toFixed(0)}`;

const fmtFull = (v: number) =>
  `€ ${v.toLocaleString('de-BE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function GoalTrendChart({ goal, records, fullHeight }: { goal: Goal; records: IncomeRecord[]; fullHeight?: boolean }) {
  const data = useMemo(() => {
    const buckets = buildBuckets(goal);
    const target = goal.amount || 0;

    // Voor maand: toon cumulatief per dag — eenvoudig: 1 tijdstap (begin / actueel) als visueel niet zinvol.
    // Voor jaar/kwartaal: cumulatief per maand t.o.v. lineair pad.
    if (goal.period_type === 'month') {
      const m = goal.period_value || 1;
      const recs = records.filter(r => r.year === goal.year && r.month === m && matchType(r, goal.income_type));
      const actual = recs.reduce((s, r) => s + metricValue(r, goal.metric), 0);
      // Toon 4 weekpunten lineair
      return [0, 0.25, 0.5, 0.75, 1].map((f, i) => ({
        label: `W${i + 1}`,
        werkelijk: i === 4 ? actual : null, // alleen eindpunt — geen weekdata beschikbaar
        doel: target * f,
      }));
    }

    let cum = 0;
    const stepTarget = target / buckets.length;
    return buckets.map((b, i) => {
      const recs = records.filter(r => r.year === goal.year && r.month === b.monthIdx && matchType(r, goal.income_type));
      const monthSum = recs.reduce((s, r) => s + metricValue(r, goal.metric), 0);
      cum += monthSum;
      return {
        label: b.label,
        werkelijk: cum,
        doel: stepTarget * (i + 1),
      };
    });
  }, [goal, records]);

  const maxVal = Math.max(goal.amount, ...data.map(d => Math.max(d.doel || 0, d.werkelijk || 0)));

  return (
    <div className={fullHeight ? 'h-full w-full' : 'h-32 -mx-1'}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: fullHeight ? 16 : 0, bottom: 4 }}>
          <defs>
            <linearGradient id={`gradient-${goal.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fontSize: fullHeight ? 12 : 10 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
          {fullHeight ? (
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} tickFormatter={fmtCompact} domain={[0, maxVal * 1.05 || 1]} />
          ) : (
            <YAxis hide domain={[0, maxVal * 1.05 || 1]} />
          )}
          <Tooltip
            contentStyle={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))' }}
            formatter={(val: number, name: string) => [fmtFull(val), name === 'werkelijk' ? 'Werkelijk' : 'Doel (lineair)']}
            labelStyle={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}
          />
          <ReferenceLine y={goal.amount} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 3" strokeOpacity={0.5} />
          <Area type="monotone" dataKey="werkelijk" stroke="hsl(var(--primary))" strokeWidth={2} fill={`url(#gradient-${goal.id})`} dot={{ r: 2.5, fill: 'hsl(var(--primary))', strokeWidth: 0 }} connectNulls />
          <Line type="monotone" dataKey="doel" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
