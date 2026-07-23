import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, FileCheck2, LineChart, PiggyBank, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDataVersion } from '@/hooks/useDataVersion';
import { applyShare } from '@/lib/incomeTypes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type IncomeRow = {
  month: number;
  year: number;
  income_type: string;
  netto: number;
};

type ClosureRow = {
  month: number;
  year: number;
};

type ActionItem = {
  title: string;
  description: string;
  href: string;
  cta: string;
  severity: 'high' | 'medium' | 'low';
  icon: typeof AlertTriangle;
};

const MONTH_NAMES = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

export function SmartActionItemsWidget({ year }: { year: number }) {
  const { user } = useAuth();
  const dataVersion = useDataVersion();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [closures, setClosures] = useState<ClosureRow[]>([]);
  const [latestPensionDate, setLatestPensionDate] = useState<string | null>(null);
  const [portfolioCount, setPortfolioCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      supabase.from('income_records').select('month, year, income_type, netto, total_amount, aandeel_arts, bouwfonds, mif').eq('user_id', user.id).eq('year', year),
      supabase.from('month_closures').select('month, year').eq('user_id', user.id).eq('year', year),
      supabase.from('pension_ipt_records').select('snapshot_date').eq('user_id', user.id).order('snapshot_date', { ascending: false }).limit(1),
      (supabase as any).from('vapz_records').select('snapshot_date').eq('user_id', user.id).order('snapshot_date', { ascending: false }).limit(1),
      (supabase as any).from('vapz_riziv_records').select('snapshot_date').eq('user_id', user.id).order('snapshot_date', { ascending: false }).limit(1),
      (supabase as any).from('pensioensparen_records').select('snapshot_date').eq('user_id', user.id).order('snapshot_date', { ascending: false }).limit(1),
      (supabase as any).from('portfolio_assets').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ]).then(([incomeRes, closureRes, iptRes, vapzRes, rizivRes, sparenRes, portfolioRes]) => {
      if (cancelled) return;
      setIncomeRows((((incomeRes.data as any[]) || []).map((row) => applyShare(row))) as IncomeRow[]);
      setClosures((closureRes.data as ClosureRow[]) || []);
      const dates = [iptRes, vapzRes, rizivRes, sparenRes]
        .flatMap((r) => ((r.data as any[]) || []).map((row) => row.snapshot_date))
        .filter(Boolean).sort();
      setLatestPensionDate(dates[dates.length - 1] || null);
      setPortfolioCount(portfolioRes.count || 0);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [user, year, dataVersion]);

  const actions = useMemo<ActionItem[]>(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const lastCompleteMonth = year < currentYear ? 12 : year === currentYear ? Math.max(1, currentMonth - 1) : 0;
    const byMonth = new Map<number, IncomeRow[]>();
    for (const row of incomeRows) {
      byMonth.set(row.month, [...(byMonth.get(row.month) || []), row]);
    }
    const closureSet = new Set(closures.map((closure) => `${closure.year}-${closure.month}`));
    const nextActions: ActionItem[] = [];

    const missingMonth = Array.from({ length: lastCompleteMonth }, (_, idx) => idx + 1)
      .find((month) => (byMonth.get(month) || []).length === 0);
    if (missingMonth) {
      nextActions.push({
        title: `${MONTH_NAMES[missingMonth - 1]} mist nog inkomsten`,
        description: 'Vul deze maand aan zodat je jaarprojectie en afsluiting betrouwbaar blijven.',
        href: '/upload',
        cta: 'Uploaden',
        severity: 'high',
        icon: Upload,
      });
    }

    const monthToClose = Array.from({ length: lastCompleteMonth }, (_, idx) => idx + 1)
      .find((month) => (byMonth.get(month) || []).length > 0 && !closureSet.has(`${year}-${month}`));
    if (monthToClose) {
      nextActions.push({
        title: `${MONTH_NAMES[monthToClose - 1]} nog niet afgesloten`,
        description: 'Controleer de maand en maak een vaste PDF-samenvatting zodra alles klopt.',
        href: `/?close=${year}-${String(monthToClose).padStart(2, '0')}#maandafsluiting`,
        cta: 'Afsluiten',
        severity: 'medium',
        icon: FileCheck2,
      });
    }

    const associatieMonths = Array.from(byMonth.entries())
      .map(([month, rows]) => ({ month, netto: rows.filter((row) => row.income_type === 'associatie').reduce((sum, row) => sum + Number(row.netto || 0), 0) }))
      .filter((row) => row.month <= lastCompleteMonth && row.netto > 0);
    if (associatieMonths.length >= 3) {
      const avg = associatieMonths.reduce((sum, row) => sum + row.netto, 0) / associatieMonths.length;
      const latest = associatieMonths[associatieMonths.length - 1];
      if (latest && latest.netto < avg * 0.65) {
        nextActions.push({
          title: 'Associatie-inkomen ligt lager dan normaal',
          description: `${MONTH_NAMES[latest.month - 1]} zit duidelijk onder je gemiddelde associatiedeel.`,
          href: '/records',
          cta: 'Nakijken',
          severity: 'medium',
          icon: AlertTriangle,
        });
      }
    }

    if (!latestPensionDate) {
      nextActions.push({
        title: 'Nog geen pensioenfiche verwerkt',
        description: 'Upload VAPZ of IPT om je pensioenreserve mee te nemen in je totaalbeeld.',
        href: '/pensioen/upload',
        cta: 'Pensioen uploaden',
        severity: 'low',
        icon: PiggyBank,
      });
    } else {
      const ageDays = Math.floor((Date.now() - new Date(latestPensionDate).getTime()) / 86_400_000);
      if (ageDays > 180) {
        nextActions.push({
          title: 'Pensioenupdate is ouder dan 6 maanden',
          description: 'Een recente snapshot maakt je pensioenoverzicht betrouwbaarder.',
          href: '/pensioen/upload',
          cta: 'Vernieuwen',
          severity: 'low',
          icon: PiggyBank,
        });
      }
    }

    if (portfolioCount === 0) {
      nextActions.push({
        title: 'Vermogen is nog leeg',
        description: 'Voeg je eerste aandeel of ETF toe om vermogen mee te volgen.',
        href: '/vermogen',
        cta: 'Toevoegen',
        severity: 'low',
        icon: LineChart,
      });
    }

    return nextActions.sort((a, b) => severityWeight[a.severity] - severityWeight[b.severity]).slice(0, 4);
  }, [closures, incomeRows, latestPensionDate, portfolioCount, year]);

  if (loading) return null;

  return (
    <Card className="data-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-primary" />
              Slimme actiepunten
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground md:hidden">
              {actions.length > 0 ? `${actions.length} actiepunt${actions.length === 1 ? '' : 'en'} vraagt aandacht` : 'Geen dringende aandachtspunten'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={actions.length > 0 ? 'bg-amber-500/15 text-amber-700 border-amber-500/30' : 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'}>
              {actions.length > 0 ? `${actions.length} open` : 'Alles rustig'}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs md:hidden"
              onClick={() => setMobileOpen((open) => !open)}
            >
              Details
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${mobileOpen ? 'rotate-180' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className={`${mobileOpen ? 'block' : 'hidden'} md:block`}>
        {actions.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-700">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            Geen dringende aandachtspunten. Je inkomsten, afsluiting en opvolging lijken op orde.
          </div>
        ) : (
          <div className="space-y-2">
            {actions.map((action) => (
              <div key={action.title} className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/80 p-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className={`mt-0.5 rounded-xl p-2 ${toneClass[action.severity]}`}>
                    <action.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium leading-tight">{action.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{action.description}</p>
                  </div>
                </div>
                <Button asChild size="sm" variant="ghost" className="shrink-0 gap-1 text-xs">
                  <Link to={action.href}>{action.cta} <ArrowRight className="h-3 w-3" /></Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const severityWeight = { high: 0, medium: 1, low: 2 };
const toneClass = {
  high: 'bg-red-500/10 text-red-600',
  medium: 'bg-amber-500/10 text-amber-700',
  low: 'bg-secondary/10 text-secondary',
};
