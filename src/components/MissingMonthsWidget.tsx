import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useDataVersion } from '@/hooks/useDataVersion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, CalendarX, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const MONTH_NAMES = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

interface MonthStat {
  month: number; // 1..12
  count: number;
  netto: number;
  isFuture: boolean;
  status: 'ok' | 'low' | 'missing' | 'future';
}

export function MissingMonthsWidget({ year }: { year: number }) {
  const { user } = useAuth();
  const dataVersion = useDataVersion();
  const [stats, setStats] = useState<MonthStat[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('income_records')
      .select('month, netto')
      .eq('user_id', user.id)
      .eq('year', year)
      .then(({ data }) => {
        if (cancelled) return;
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const rows = (data as any[]) || [];
        const perMonth = Array.from({ length: 12 }, (_, i) => {
          const mr = rows.filter(r => r.month === i + 1);
          return { month: i + 1, count: mr.length, netto: mr.reduce((s, r) => s + Number(r.netto || 0), 0) };
        });
        // Bereken gemiddelde over actieve (niet-toekomstige, niet-lege) maanden
        const activeMonths = perMonth.filter(m => {
          const isFuture = year > currentYear || (year === currentYear && m.month > currentMonth);
          return !isFuture && m.count > 0;
        });
        const avg = activeMonths.length > 0
          ? activeMonths.reduce((s, m) => s + m.count, 0) / activeMonths.length
          : 0;
        const result: MonthStat[] = perMonth.map(m => {
          const isFuture = year > currentYear || (year === currentYear && m.month > currentMonth);
          let status: MonthStat['status'];
          if (isFuture) status = 'future';
          else if (m.count === 0) status = 'missing';
          else if (avg > 0 && m.count < avg * 0.5) status = 'low';
          else status = 'ok';
          return { ...m, isFuture, status };
        });
        setStats(result);
      });
    return () => { cancelled = true; };
  }, [user, year, dataVersion]);

  if (!stats) return null;

  const missing = stats.filter(s => s.status === 'missing');
  const low = stats.filter(s => s.status === 'low');
  const hasIssues = missing.length > 0 || low.length > 0;
  const totalRecords = stats.reduce((s, m) => s + m.count, 0);

  if (totalRecords === 0) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarX className="h-4 w-4 text-primary" />
            Maandcontrole {year}
            {hasIssues ? (
              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 gap-1">
                <AlertTriangle className="h-3 w-3" />
                {missing.length + low.length} aandachtspunt{missing.length + low.length !== 1 ? 'en' : ''}
              </Badge>
            ) : (
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1">
                <CheckCircle2 className="h-3 w-3" /> Compleet
              </Badge>
            )}
          </CardTitle>
          <Button asChild size="sm" variant="ghost" className="gap-1 text-xs">
            <Link to="/upload">Toevoegen <ArrowRight className="h-3 w-3" /></Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-6 md:grid-cols-12 gap-1.5">
          {stats.map(s => {
            const base = 'flex flex-col items-center justify-center rounded-md border px-1 py-2 text-[10px]';
            const tone =
              s.status === 'missing' ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400' :
              s.status === 'low'     ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400' :
              s.status === 'future'  ? 'bg-muted/30 border-border/40 text-muted-foreground' :
                                       'bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400';
            return (
              <div
                key={s.month}
                className={`${base} ${tone}`}
                title={
                  s.status === 'future' ? `${MONTH_NAMES[s.month - 1]} (toekomst)` :
                  s.status === 'missing' ? `${MONTH_NAMES[s.month - 1]}: geen records` :
                  s.status === 'low' ? `${MONTH_NAMES[s.month - 1]}: slechts ${s.count} records (laag)` :
                  `${MONTH_NAMES[s.month - 1]}: ${s.count} records`
                }
              >
                <span className="font-medium">{MONTH_SHORT[s.month - 1]}</span>
                <span className="font-mono tabular-nums">
                  {s.status === 'future' ? '—' : s.count}
                </span>
              </div>
            );
          })}
        </div>
        {hasIssues && (
          <div className="mt-3 text-xs text-muted-foreground space-y-0.5">
            {missing.length > 0 && (
              <div>
                <span className="font-medium text-red-700 dark:text-red-400">Ontbrekend:</span>{' '}
                {missing.map(m => MONTH_SHORT[m.month - 1]).join(', ')}
              </div>
            )}
            {low.length > 0 && (
              <div>
                <span className="font-medium text-amber-700 dark:text-amber-400">Weinig records:</span>{' '}
                {low.map(m => `${MONTH_SHORT[m.month - 1]} (${m.count})`).join(', ')}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
