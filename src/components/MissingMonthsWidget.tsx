import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useDataVersion } from '@/hooks/useDataVersion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, CalendarX, ArrowRight, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { incomeTypeLabel } from '@/lib/incomeTypes';

const MONTH_NAMES = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

type FilterType = 'all' | 'ambulatory' | 'hospitalized' | 'associatie';

interface RawRow { month: number; netto: number; income_type: string }

interface MonthStat {
  month: number;
  count: number;
  netto: number;
  isFuture: boolean;
  status: 'ok' | 'low' | 'missing' | 'soon-missing' | 'future';
}

export function MissingMonthsWidget({ year }: { year: number }) {
  const { user } = useAuth();
  const dataVersion = useDataVersion();
  const [rows, setRows] = useState<RawRow[] | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('income_records')
      .select('month, netto, income_type')
      .eq('user_id', user.id)
      .eq('year', year)
      .then(({ data }) => {
        if (cancelled) return;
        setRows((data as any[]) || []);
      });
    return () => { cancelled = true; };
  }, [user, year, dataVersion]);

  const stats = useMemo<MonthStat[] | null>(() => {
    if (!rows) return null;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const filtered = filter === 'all' ? rows : rows.filter(r => r.income_type === filter);
    const perMonth = Array.from({ length: 12 }, (_, i) => {
      const mr = filtered.filter(r => r.month === i + 1);
      return { month: i + 1, count: mr.length, netto: mr.reduce((s, r) => s + Number(r.netto || 0), 0) };
    });
    const activeMonths = perMonth.filter(m => {
      const isFuture = year > currentYear || (year === currentYear && m.month > currentMonth);
      return !isFuture && m.count > 0;
    });
    const avg = activeMonths.length > 0
      ? activeMonths.reduce((s, m) => s + m.count, 0) / activeMonths.length
      : 0;
    const base: MonthStat[] = perMonth.map(m => {
      const isFuture = year > currentYear || (year === currentYear && m.month > currentMonth);
      let status: MonthStat['status'];
      if (isFuture) status = 'future';
      else if (m.count === 0) status = 'missing';
      else if (avg > 0 && m.count < avg * 0.5) status = 'low';
      else status = 'ok';
      return { ...m, isFuture, status };
    });
    // Eerste 2 ontbrekende maanden -> oranje
    let highlighted = 0;
    for (const s of base) {
      if (s.status === 'missing' && highlighted < 2) {
        s.status = 'soon-missing';
        highlighted++;
      }
    }
    return base;
  }, [rows, year, filter]);

  if (!stats) return null;

  const missing = stats.filter(s => s.status === 'missing' || s.status === 'soon-missing');
  const low = stats.filter(s => s.status === 'low');
  const hasIssues = missing.length > 0 || low.length > 0;
  const totalRecords = stats.reduce((s, m) => s + m.count, 0);

  if (totalRecords === 0 && filter === 'all') return null;

  const exportCsv = () => {
    const header = ['Jaar', 'Maand', 'Maandnaam', 'Inkomenssoort', 'Status', 'Aantal records'];
    const issueRows = stats.filter(s => s.status === 'missing' || s.status === 'soon-missing' || s.status === 'low');
    const lines = [header.join(';')];
    for (const s of issueRows) {
      lines.push([
        year,
        s.month,
        MONTH_NAMES[s.month - 1],
        filter === 'all' ? 'Alle' : incomeTypeLabel[filter],
        s.status === 'low' ? 'Weinig records' : 'Ontbrekend',
        s.count,
      ].join(';'));
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ontbrekende-maanden-${year}${filter !== 'all' ? '-' + filter : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
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
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle inkomsten</SelectItem>
                <SelectItem value="ambulatory">{incomeTypeLabel.ambulatory}</SelectItem>
                <SelectItem value="hospitalized">{incomeTypeLabel.hospitalized}</SelectItem>
                <SelectItem value="associatie">{incomeTypeLabel.associatie}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-xs"
              onClick={exportCsv}
              disabled={!hasIssues}
              title={hasIssues ? 'Exporteer aandachtspunten als CSV' : 'Geen aandachtspunten om te exporteren'}
            >
              <Download className="h-3 w-3" /> Export
            </Button>
            <Button asChild size="sm" variant="ghost" className="h-8 gap-1 text-xs">
              <Link to="/upload">Toevoegen <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-6 md:grid-cols-12 gap-1.5">
          {stats.map(s => {
            const baseCls = 'flex flex-col items-center justify-center rounded-md border px-1 py-2 text-[10px]';
            const tone =
              s.status === 'missing'      ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400' :
              s.status === 'soon-missing' ? 'bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-400' :
              s.status === 'low'          ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400' :
              s.status === 'future'       ? 'bg-muted/30 border-border/40 text-muted-foreground' :
                                            'bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400';
            return (
              <div
                key={s.month}
                className={`${baseCls} ${tone}`}
                title={
                  s.status === 'future' ? `${MONTH_NAMES[s.month - 1]} (toekomst)` :
                  s.status === 'soon-missing' ? `${MONTH_NAMES[s.month - 1]}: geen records (eerstvolgend aan te vullen)` :
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
            {missing.filter(m => m.status === 'soon-missing').length > 0 && (
              <div>
                <span className="font-medium text-orange-700 dark:text-orange-400">Eerstvolgend aan te vullen:</span>{' '}
                {missing.filter(m => m.status === 'soon-missing').map(m => MONTH_SHORT[m.month - 1]).join(', ')}
              </div>
            )}
            {missing.filter(m => m.status === 'missing').length > 0 && (
              <div>
                <span className="font-medium text-red-700 dark:text-red-400">Ontbrekend:</span>{' '}
                {missing.filter(m => m.status === 'missing').map(m => MONTH_SHORT[m.month - 1]).join(', ')}
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
