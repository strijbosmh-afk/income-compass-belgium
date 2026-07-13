import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useDataVersion } from '@/hooks/useDataVersion';
import { supabase } from '@/integrations/supabase/client';
import { applyShare } from '@/lib/incomeTypes';
import { Activity, BrainCircuit, ChevronDown, PiggyBank, ShieldCheck, TrendingUp, Wallet } from 'lucide-react';

type IncomeRow = {
  record_date: string;
  month: number;
  year: number;
  netto: number;
  total_amount?: number;
  aandeel_arts?: number;
  bouwfonds?: number;
  mif?: number;
  income_type?: string;
};

type ScoreBreakdown = {
  incomePower: number;
  stability: number;
  retirementReadiness: number;
  resilience: number;
  diversification: number;
  dataQuality: number;
};

const fmt = (value: number) => `€${value.toLocaleString('nl-BE', { maximumFractionDigits: 0 })}`;
const OWNER_BIRTH_DATE = '1976-04-14';

export function FinancialFutureScoreWidget() {
  const { user } = useAuth();
  const dataVersion = useDataVersion();
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [pensionTotal, setPensionTotal] = useState(0);
  const [latestPensionDate, setLatestPensionDate] = useState<string | null>(null);
  const [portfolioCost, setPortfolioCost] = useState(0);
  const [portfolioBuckets, setPortfolioBuckets] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);

    const pensionSources = [
      { table: 'pension_ipt_records', field: 'opgebouwde_reserve' },
      { table: 'vapz_records', field: 'pensioenreserve' },
      { table: 'vapz_riziv_records', field: 'pensioenreserve' },
      { table: 'pensioensparen_records', field: 'pensioenreserve' },
    ];

    Promise.all([
      supabase
        .from('income_records')
        .select('record_date, month, year, netto, total_amount, aandeel_arts, bouwfonds, mif, income_type')
        .eq('user_id', user.id)
        .order('record_date', { ascending: false })
        .limit(800),
      ...pensionSources.map(({ table, field }) =>
        (supabase as any)
          .from(table)
          .select(`${field}, snapshot_date`)
          .eq('user_id', user.id)
          .order('snapshot_date', { ascending: false })
          .limit(1)
          .maybeSingle()
      ),
      (supabase as any)
        .from('portfolio_assets')
        .select('asset_type, currency, quantity, purchase_price')
        .eq('user_id', user.id),
    ]).then(([incomeRes, ...rest]) => {
      if (cancelled) return;
      const pensionResults = rest.slice(0, pensionSources.length) as any[];
      const portfolioRes = rest[pensionSources.length] as any;

      setIncomeRows((((incomeRes as any).data || []).map((row: any) => applyShare(row))) as IncomeRow[]);

      const pensionValues = pensionResults.map((res, idx) => {
        const row = res.data;
        const field = pensionSources[idx].field;
        return row ? { value: Number(row[field] || 0), date: String(row.snapshot_date || '') } : null;
      }).filter(Boolean) as { value: number; date: string }[];
      setPensionTotal(pensionValues.reduce((sum, row) => sum + row.value, 0));
      const pensionDates = pensionValues.map((row) => row.date).filter(Boolean).sort();
      setLatestPensionDate(pensionDates[pensionDates.length - 1] || null);

      const assets = (portfolioRes.data || []) as Array<{ asset_type: string; currency: string; quantity: number; purchase_price: number }>;
      setPortfolioCost(assets.reduce((sum, asset) => sum + Number(asset.quantity || 0) * Number(asset.purchase_price || 0), 0));
      setPortfolioBuckets(new Set(assets.map((asset) => `${asset.asset_type}:${asset.currency || 'EUR'}`)));
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [user, dataVersion]);

  const result = useMemo(() => {
    const ageInfo = inferAge(user?.user_metadata || {});
    const age = ageInfo.age ?? 45;
    const monthly = monthlyIncome(incomeRows);
    const recentMonths = monthly.slice(0, 12);
    const activeMonths = recentMonths.filter((month) => month.value > 0);
    const monthlyAverage = activeMonths.length > 0
      ? activeMonths.reduce((sum, month) => sum + month.value, 0) / activeMonths.length
      : 0;
    const annualizedNet = monthlyAverage * 12;
    const values = activeMonths.map((month) => month.value);
    const mean = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const stdDev = values.length > 1
      ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
      : 0;
    const coefficientOfVariation = mean > 0 ? stdDev / mean : 1;
    const wealthBase = pensionTotal + portfolioCost;
    const targetMultiple = retirementTargetMultiple(age);
    const targetCapital = Math.max(annualizedNet * targetMultiple, annualizedNet);
    const pensionAge = latestPensionDate ? daysSince(latestPensionDate) : null;

    const breakdown: ScoreBreakdown = {
      incomePower: clamp((annualizedNet / 180_000) * 100),
      stability: clamp((activeMonths.length / 10) * 55 + (1 - Math.min(coefficientOfVariation, 0.8) / 0.8) * 45),
      retirementReadiness: targetCapital > 0 ? clamp((wealthBase / targetCapital) * 100) : 0,
      resilience: annualizedNet > 0 ? clamp((wealthBase / annualizedNet / 3) * 100) : 0,
      diversification: clamp(
        (pensionTotal > 0 ? 34 : 0) +
        (portfolioCost > 0 ? 33 : 0) +
        (portfolioBuckets.size >= 3 ? 33 : portfolioBuckets.size * 11)
      ),
      dataQuality: clamp(
        (activeMonths.length >= 6 ? 40 : activeMonths.length * 6) +
        (latestPensionDate && pensionAge !== null && pensionAge < 395 ? 30 : latestPensionDate ? 15 : 0) +
        (portfolioCost > 0 ? 20 : 0) +
        (ageInfo.isKnown ? 10 : 4)
      ),
    };

    const score = Math.round(
      breakdown.incomePower * 0.22 +
      breakdown.stability * 0.18 +
      breakdown.retirementReadiness * 0.26 +
      breakdown.resilience * 0.14 +
      breakdown.diversification * 0.10 +
      breakdown.dataQuality * 0.10
    );

    return {
      age,
      ageKnown: ageInfo.isKnown,
      annualizedNet,
      monthlyAverage,
      activeMonths: activeMonths.length,
      coefficientOfVariation,
      pensionTotal,
      portfolioCost,
      portfolioBucketCount: portfolioBuckets.size,
      targetCapital,
      targetMultiple,
      score: clamp(score),
      label: scoreLabel(score),
      breakdown,
      latestPensionDate,
    };
  }, [incomeRows, latestPensionDate, pensionTotal, portfolioBuckets, portfolioCost, user?.user_metadata]);

  if (loading || incomeRows.length === 0) return null;

  return (
    <Card className="data-card overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <BrainCircuit className="h-4 w-4 text-primary" />
              Financiële toekomstscore
            </CardTitle>
            <p className="mt-1 hidden text-sm text-muted-foreground md:block">
              Indicatieve score op basis van inkomen, stabiliteit, pensioen, beleggingen en leeftijd.
            </p>
            <p className="mt-1 text-xs text-muted-foreground md:hidden">
              {result.score}/100 · {result.label.text}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`${result.label.className} hidden w-fit md:inline-flex`}>{result.label.text}</Badge>
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
        <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
          <div className="rounded-3xl border border-primary/15 bg-primary/5 p-5">
            <div className="flex items-end gap-2">
              <span className="text-5xl font-semibold tracking-tight">{result.score}</span>
              <span className="pb-1 text-lg text-muted-foreground">/100</span>
            </div>
            <Progress value={result.score} className="mt-4 h-2" />
            <p className="mt-3 text-xs text-muted-foreground">
              Leeftijd: {result.ageKnown ? `${result.age} jaar` : `geschat ${result.age} jaar`}. Pensioendoel: ongeveer {result.targetMultiple.toFixed(1)}x jaarinkomen.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <ScoreTile icon={Wallet} label="Inkomenskracht" value={result.breakdown.incomePower} helper={`${fmt(result.annualizedNet)} jaarprojectie`} />
            <ScoreTile icon={Activity} label="Stabiliteit" value={result.breakdown.stability} helper={`${result.activeMonths} actieve maanden`} />
            <ScoreTile icon={PiggyBank} label="Pensioenfit" value={result.breakdown.retirementReadiness} helper={`${fmt(result.pensionTotal + result.portfolioCost)} / ${fmt(result.targetCapital)}`} />
            <ScoreTile icon={ShieldCheck} label="Buffer" value={result.breakdown.resilience} helper={`${fmt(result.pensionTotal + result.portfolioCost)} vermogen`} />
            <ScoreTile icon={TrendingUp} label="Spreiding" value={result.breakdown.diversification} helper={`${result.portfolioBucketCount} portfolio-buckets`} />
            <ScoreTile icon={BrainCircuit} label="Datakwaliteit" value={result.breakdown.dataQuality} helper={result.latestPensionDate ? `Pensioen ${result.latestPensionDate}` : 'Pensioen mist'} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreTile({ icon: Icon, label, value, helper }: { icon: typeof Wallet; label: string; value: number; helper: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="h-3.5 w-3.5 text-primary" />
          {label}
        </span>
        <span className="font-semibold">{Math.round(value)}</span>
      </div>
      <Progress value={value} className="mt-2 h-1.5" />
      <p className="mt-2 truncate text-xs text-muted-foreground" title={helper}>{helper}</p>
    </div>
  );
}

function monthlyIncome(rows: IncomeRow[]) {
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    const key = row.record_date ? row.record_date.slice(0, 7) : `${row.year}-${String(row.month).padStart(2, '0')}`;
    byMonth.set(key, (byMonth.get(key) || 0) + Number(row.netto || 0));
  }
  return Array.from(byMonth.entries())
    .map(([month, value]) => ({ month, value }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

function inferAge(metadata: Record<string, any>) {
  const directAge = Number(metadata.age ?? metadata.leeftijd);
  if (Number.isFinite(directAge) && directAge > 18 && directAge < 90) {
    return { age: directAge, isKnown: true };
  }
  const rawDate = metadata.birthdate || metadata.birth_date || metadata.date_of_birth || metadata.geboortedatum;
  if (rawDate) {
    const birthDate = new Date(String(rawDate));
    if (!Number.isNaN(birthDate.getTime())) {
      const now = new Date();
      let age = now.getFullYear() - birthDate.getFullYear();
      const hasHadBirthday = now.getMonth() > birthDate.getMonth() || (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
      if (!hasHadBirthday) age -= 1;
      if (age > 18 && age < 90) return { age, isKnown: true };
    }
  }
  const ownerBirthDate = new Date(OWNER_BIRTH_DATE);
  const now = new Date();
  let age = now.getFullYear() - ownerBirthDate.getFullYear();
  const hasHadBirthday = now.getMonth() > ownerBirthDate.getMonth() || (now.getMonth() === ownerBirthDate.getMonth() && now.getDate() >= ownerBirthDate.getDate());
  if (!hasHadBirthday) age -= 1;
  return { age, isKnown: true };
}

function retirementTargetMultiple(age: number) {
  if (age < 30) return 0.5;
  if (age < 40) return 1 + ((age - 30) / 10) * 0.8;
  if (age < 50) return 1.8 + ((age - 40) / 10) * 1.5;
  if (age < 60) return 3.3 + ((age - 50) / 10) * 2.2;
  if (age < 67) return 5.5 + ((age - 60) / 7) * 2.0;
  return 7.5;
}

function scoreLabel(score: number) {
  if (score >= 80) return { text: 'Zeer sterk', className: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' };
  if (score >= 65) return { text: 'Sterk', className: 'bg-green-500/15 text-green-700 border-green-500/30' };
  if (score >= 50) return { text: 'Gezond, met werkpunten', className: 'bg-amber-500/15 text-amber-700 border-amber-500/30' };
  if (score >= 35) return { text: 'Kwetsbaar', className: 'bg-orange-500/15 text-orange-700 border-orange-500/30' };
  return { text: 'Aandacht nodig', className: 'bg-red-500/15 text-red-700 border-red-500/30' };
}

function daysSince(date: string) {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
