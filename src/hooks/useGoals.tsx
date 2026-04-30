import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useDataVersion } from '@/hooks/useDataVersion';

export type GoalPeriodType = 'year' | 'quarter' | 'month';
export type GoalIncomeType = 'all' | 'ambulatory' | 'hospitalized';
export type GoalMetric = 'netto' | 'bruto' | 'aandeel_arts';

export type Goal = {
  id: string;
  year: number;
  period_type: GoalPeriodType;
  period_value: number | null;
  income_type: GoalIncomeType;
  metric: GoalMetric;
  amount: number;
  note: string | null;
};

type IncomeRecord = {
  year: number;
  month: number;
  income_type: string;
  total_amount: number;
  aandeel_arts: number;
  netto: number;
};

export type GoalProgress = {
  goal: Goal;
  // Periode-info
  periodStart: Date;
  periodEnd: Date;
  daysElapsed: number;
  daysTotal: number;
  periodPct: number; // % van periode verstreken (0-100)
  // Bedragen
  actual: number;
  target: number;
  progressPct: number; // % van doel behaald (0-…)
  // Forecast
  projected: number; // verwacht eindbedrag op basis van run-rate
  projectedPct: number; // projectie t.o.v. doel
  deviationPct: number; // afwijking projectie vs lineair pad (kan negatief)
  status: 'on_track' | 'ahead' | 'behind' | 'no_data';
};

const QUARTER_MONTHS: Record<number, [number, number]> = {
  1: [1, 3], 2: [4, 6], 3: [7, 9], 4: [10, 12],
};

function periodBounds(g: Goal): { start: Date; end: Date; months: number[] } {
  if (g.period_type === 'year') {
    return {
      start: new Date(g.year, 0, 1),
      end: new Date(g.year, 11, 31, 23, 59, 59),
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    };
  }
  if (g.period_type === 'quarter') {
    const q = g.period_value || 1;
    const [m1, m2] = QUARTER_MONTHS[q];
    return {
      start: new Date(g.year, m1 - 1, 1),
      end: new Date(g.year, m2, 0, 23, 59, 59),
      months: [m1, m1 + 1, m2],
    };
  }
  const m = g.period_value || 1;
  return {
    start: new Date(g.year, m - 1, 1),
    end: new Date(g.year, m, 0, 23, 59, 59),
    months: [m],
  };
}

function metricValue(r: IncomeRecord, metric: GoalMetric): number {
  if (metric === 'bruto') return r.total_amount;
  if (metric === 'aandeel_arts') return r.aandeel_arts;
  return r.netto;
}

function matchesIncomeType(r: IncomeRecord, t: GoalIncomeType): boolean {
  if (t === 'all') return true;
  return r.income_type === t;
}

export function computeProgress(goal: Goal, records: IncomeRecord[], today: Date = new Date()): GoalProgress {
  const { start, end, months } = periodBounds(goal);
  const msDay = 86_400_000;
  const daysTotal = Math.max(1, Math.round((end.getTime() - start.getTime()) / msDay) + 1);
  const elapsedRaw = Math.round((today.getTime() - start.getTime()) / msDay) + 1;
  const daysElapsed = Math.max(0, Math.min(daysTotal, elapsedRaw));
  const periodPct = (daysElapsed / daysTotal) * 100;

  const inPeriod = records.filter(r =>
    r.year === goal.year && months.includes(r.month) && matchesIncomeType(r, goal.income_type)
  );
  const actual = inPeriod.reduce((s, r) => s + metricValue(r, goal.metric), 0);
  const target = goal.amount || 0;
  const progressPct = target > 0 ? (actual / target) * 100 : 0;

  // Run-rate projectie: lineaire extrapolatie op basis van verstreken dagen
  let projected = actual;
  if (daysElapsed > 0 && daysElapsed < daysTotal) {
    projected = (actual / daysElapsed) * daysTotal;
  } else if (daysElapsed === 0) {
    projected = 0;
  }
  const projectedPct = target > 0 ? (projected / target) * 100 : 0;

  // Afwijking: projected vs target (in % van doel)
  // 0 = exact op doel, +20 = 20% boven doel verwacht, -15 = 15% onder doel
  const deviationPct = target > 0 ? ((projected - target) / target) * 100 : 0;

  let status: GoalProgress['status'] = 'on_track';
  if (target === 0 || actual === 0 && daysElapsed === 0) status = 'no_data';
  else if (deviationPct > 5) status = 'ahead';
  else if (deviationPct < -15) status = 'behind';

  return {
    goal,
    periodStart: start,
    periodEnd: end,
    daysElapsed,
    daysTotal,
    periodPct,
    actual,
    target,
    progressPct,
    projected,
    projectedPct,
    deviationPct,
    status,
  };
}

export function useGoals(year?: number) {
  const { user } = useAuth();
  const dataVersion = useDataVersion();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [records, setRecords] = useState<IncomeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      supabase.from('income_goals').select('*').eq('user_id', user.id),
      supabase.from('income_records').select('year,month,income_type,total_amount,aandeel_arts,netto').eq('user_id', user.id),
    ]).then(([gRes, rRes]) => {
      setGoals((gRes.data as Goal[]) || []);
      setRecords((rRes.data as IncomeRecord[]) || []);
      setLoading(false);
    });
  }, [user, dataVersion, refreshTick]);

  const refresh = useCallback(() => setRefreshTick(t => t + 1), []);

  const filteredGoals = useMemo(
    () => (year != null ? goals.filter(g => g.year === year) : goals),
    [goals, year]
  );

  const progressList = useMemo(
    () => filteredGoals.map(g => computeProgress(g, records)).sort((a, b) => {
      // Sorteer: jaar > kwartaal > maand, dan op periode_value
      const order = { year: 0, quarter: 1, month: 2 } as const;
      const d = order[a.goal.period_type] - order[b.goal.period_type];
      if (d !== 0) return d;
      return (a.goal.period_value || 0) - (b.goal.period_value || 0);
    }),
    [filteredGoals, records]
  );

  return { goals: filteredGoals, allGoals: goals, progressList, loading, refresh, records };
}
