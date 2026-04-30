import { useGoals } from '@/hooks/useGoals';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Target, ArrowRight, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { Link } from 'react-router-dom';

const fmt = (val: number) => `€ ${val.toLocaleString('de-BE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const MONTH_NAMES = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

const periodLabel = (g: { period_type: string; period_value: number | null; period_start?: number | null; period_end?: number | null; year: number }) => {
  if (g.period_type === 'year') return `${g.year}`;
  if (g.period_type === 'quarter') return `Q${g.period_value} ${g.year}`;
  if (g.period_type === 'custom') {
    const s = g.period_start ?? 1;
    const e = g.period_end ?? s;
    return `${MONTH_NAMES[s - 1]}–${MONTH_NAMES[e - 1]} ${g.year}`;
  }
  return `${MONTH_NAMES[(g.period_value || 1) - 1]} ${g.year}`;
};

const incomeShort: Record<string, string> = { all: 'Totaal', ambulatory: 'Ambulant', hospitalized: 'Gehosp.' };

export function GoalsWidget({ year }: { year: number }) {
  const { progressList, loading } = useGoals(year);

  if (loading) return null;

  if (progressList.length === 0) {
    return (
      <Card className="border-dashed border-border/60">
        <CardContent className="py-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Target className="h-5 w-5 opacity-60" />
            <span>Geen doelen voor {year}. Stel doelen in om je voortgang en projectie te volgen.</span>
          </div>
          <Button asChild size="sm" variant="outline" className="gap-1.5 shrink-0">
            <Link to="/goals">Doelen instellen <ArrowRight className="h-3.5 w-3.5" /></Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Toon max 3, prioriteer: behind > on_track > ahead, dan jaar voor kwartaal voor maand
  const sorted = [...progressList].sort((a, b) => {
    const sw = { behind: 0, on_track: 1, ahead: 2, no_data: 3 } as const;
    const d = sw[a.status] - sw[b.status];
    if (d !== 0) return d;
    const order = { year: 0, quarter: 1, month: 2 } as const;
    return order[a.goal.period_type] - order[b.goal.period_type];
  });
  const shown = sorted.slice(0, 3);
  const hasWarning = progressList.some(p => p.status === 'behind');

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Doelstellingen
            {hasWarning && (
              <Badge className="bg-red-600/15 text-red-700 dark:text-red-400 border-red-600/30 gap-1">
                <AlertTriangle className="h-3 w-3" /> Aandacht
              </Badge>
            )}
          </CardTitle>
          <Button asChild size="sm" variant="ghost" className="gap-1 text-xs">
            <Link to="/goals">Alle {progressList.length} <ArrowRight className="h-3 w-3" /></Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {shown.map(p => {
          const barPct = Math.min(100, Math.max(0, p.progressPct));
          const barColor = p.status === 'behind' ? 'bg-red-500' : p.status === 'ahead' ? 'bg-green-500' : 'bg-primary';
          const Icon = p.status === 'behind' ? TrendingDown : p.status === 'ahead' ? TrendingUp : Target;
          const tone = p.status === 'behind' ? 'text-red-600 dark:text-red-400' : p.status === 'ahead' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground';
          return (
            <div key={p.goal.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{periodLabel(p.goal)}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{incomeShort[p.goal.income_type]}</span>
                </div>
                <div className="text-xs tabular-nums shrink-0">
                  <span className="font-semibold">{fmt(p.actual)}</span>
                  <span className="text-muted-foreground"> / {fmt(p.target)}</span>
                </div>
              </div>
              <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${barColor} transition-all`} style={{ width: `${barPct}%` }} />
                {/* Markering huidige periode-positie */}
                {p.periodPct > 0 && p.periodPct < 100 && (
                  <div className="absolute top-0 bottom-0 w-px bg-foreground/40" style={{ left: `${p.periodPct}%` }} title="Verwachte voortgang" />
                )}
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{p.progressPct.toFixed(0)}% behaald</span>
                <span className={`flex items-center gap-1 ${tone}`}>
                  <Icon className="h-3 w-3" />
                  Projectie: {fmt(p.projected)}
                  {p.target > 0 && (
                    <span>({p.deviationPct >= 0 ? '+' : ''}{p.deviationPct.toFixed(0)}%)</span>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
