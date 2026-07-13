import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useDataVersion } from '@/hooks/useDataVersion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, TrendingUp, TrendingDown, Activity, BarChart3, ArrowUpRight, ArrowDownRight, Minus, Stethoscope } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, Cell } from 'recharts';
import { applyShare } from '@/lib/incomeTypes';

type IncomeEntry = {
  id: string;
  month: number;
  year: number;
  income_type: string;
  nomenclature_code: string;
  total_amount: number;
  aandeel_arts: number;
  bouwfonds: number;
  mif: number;
  netto: number;
  description: string | null;
  quantity: number;
};

const MONTHS = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const MONTH_NAMES = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const fmt = (val: number) => `€${val.toLocaleString('de-BE', { minimumFractionDigits: 2 })}`;
const fmtPct = (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;

export default function StatisticsPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<IncomeEntry[]>([]);
  const [nomenclature, setNomenclature] = useState<{ code: string; description: string; netto_amount: number }[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [compareYear, setCompareYear] = useState<string>('');
  const [tab, setTab] = useState('statistieken');
  const [prestatieType, setPrestatieType] = useState<'ambulatory' | 'hospitalized' | 'associatie'>('ambulatory');
  const [prestatieMonth, setPrestatieMonth] = useState<string>('all');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const dataVersion = useDataVersion();

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const requestedYears = [...new Set([parseInt(selectedYear), compareYear ? parseInt(compareYear) : null].filter((year): year is number => Number.isFinite(year)))];
    Promise.all([
      supabase.from('income_records')
        .select('id, month, year, income_type, nomenclature_code, total_amount, aandeel_arts, bouwfonds, mif, netto, description, quantity')
        .eq('user_id', user.id)
        .in('year', requestedYears),
      supabase.from('nomenclature_codes')
        .select('code, description, netto_amount')
        .eq('user_id', user.id),
      supabase.from('income_records').select('year').eq('user_id', user.id),
    ]).then(([r1, r2, yearsRes]) => {
      // Associatie-records zijn bij bewaren al genormaliseerd naar 50% eigen aandeel.
      setRecords(((r1.data as any[]) || []).map((r) => applyShare(r)));
      setNomenclature((r2.data as any) || []);
      setAvailableYears([...new Set((yearsRes.data || []).map((r) => r.year))].sort((a, b) => b - a));
      setLoading(false);
    });
  }, [user, dataVersion, selectedYear, compareYear]);

  const codeToInfo = useMemo(() => {
    const m: Record<string, { description: string; netto: number }> = {};
    nomenclature.forEach(n => { m[n.code] = { description: n.description, netto: Number(n.netto_amount) || 0 }; });
    return m;
  }, [nomenclature]);

  const years = useMemo(() => [...new Set([...availableYears, parseInt(selectedYear)])].filter(Boolean).sort((a, b) => b - a), [availableYears, selectedYear]);
  const yearFiltered = useMemo(() => records.filter(r => String(r.year) === selectedYear), [records, selectedYear]);

  const monthlyData = useMemo(() =>
    MONTHS.map((name, idx) => {
      const mr = yearFiltered.filter(r => r.month === idx + 1);
      return { month: name, netto: mr.reduce((s, r) => s + r.netto, 0) };
    }), [yearFiltered]);

  const monthlyTrendData = useMemo(() => {
    const activeMonths = monthlyData
      .map((month, idx) => ({ ...month, monthNumber: idx + 1 }))
      .filter((month) => month.netto > 0);

    if (activeMonths.length < 2) {
      return monthlyData.map((month) => ({ ...month, trend: null as number | null }));
    }

    const xMean = activeMonths.reduce((sum, month) => sum + month.monthNumber, 0) / activeMonths.length;
    const yMean = activeMonths.reduce((sum, month) => sum + month.netto, 0) / activeMonths.length;
    const denominator = activeMonths.reduce((sum, month) => sum + (month.monthNumber - xMean) ** 2, 0);
    const slope = denominator === 0
      ? 0
      : activeMonths.reduce((sum, month) => sum + (month.monthNumber - xMean) * (month.netto - yMean), 0) / denominator;
    const intercept = yMean - slope * xMean;
    const firstMonth = activeMonths[0].monthNumber;
    const lastMonth = activeMonths[activeMonths.length - 1].monthNumber;

    return monthlyData.map((month, idx) => {
      const monthNumber = idx + 1;
      return {
        ...month,
        trend: monthNumber >= firstMonth && monthNumber <= lastMonth
          ? Math.max(0, slope * monthNumber + intercept)
          : null,
      };
    });
  }, [monthlyData]);

  // --- Statistics ---
  const statsData = useMemo(() => {
    const monthlyNetto = MONTHS.map((name, idx) => {
      const mr = yearFiltered.filter(r => r.month === idx + 1);
      const total = mr.reduce((s, r) => s + r.netto, 0);
      return { month: idx + 1, name, total, count: mr.length };
    }).filter(m => m.count > 0);

    if (monthlyNetto.length === 0) return null;

    const values = monthlyNetto.map(m => m.total);
    const gemiddelde = values.reduce((a, b) => a + b, 0) / values.length;
    const mediaan = median(values);

    const besteM = monthlyNetto.reduce((best, m) => m.total > best.total ? m : best, monthlyNetto[0]);
    const slechtsteM = monthlyNetto.reduce((worst, m) => m.total < worst.total ? m : worst, monthlyNetto[0]);

    const differences: { from: string; to: string; diff: number; pct: number }[] = [];
    for (let i = 1; i < monthlyNetto.length; i++) {
      const prev = monthlyNetto[i - 1];
      const curr = monthlyNetto[i];
      const diff = curr.total - prev.total;
      const pct = prev.total !== 0 ? (diff / prev.total) * 100 : 0;
      differences.push({ from: prev.name, to: curr.name, diff, pct });
    }
    const grootsteStijging = differences.length > 0 ? differences.reduce((best, d) => d.diff > best.diff ? d : best, differences[0]) : null;
    const grootsteDaling = differences.length > 0 ? differences.reduce((worst, d) => d.diff < worst.diff ? d : worst, differences[0]) : null;

    const n = monthlyNetto.length;
    const xMean = monthlyNetto.reduce((s, m) => s + m.month, 0) / n;
    const yMean = gemiddelde;
    let num = 0, den = 0;
    monthlyNetto.forEach(m => { num += (m.month - xMean) * (m.total - yMean); den += (m.month - xMean) ** 2; });
    const slope = den !== 0 ? num / den : 0;
    const trendDirection = slope > 50 ? 'stijgend' : slope < -50 ? 'dalend' : 'stabiel';

    const recordNettos = yearFiltered.map(r => r.netto);
    const gemiddeldePerRecord = recordNettos.length > 0 ? recordNettos.reduce((a, b) => a + b, 0) / recordNettos.length : 0;
    const mediaanPerRecord = median(recordNettos);

    return { monthlyNetto, gemiddelde, mediaan, besteM, slechtsteM, grootsteStijging, grootsteDaling, trendDirection, slope, gemiddeldePerRecord, mediaanPerRecord, aantalRecords: yearFiltered.length, aantalMaanden: monthlyNetto.length };
  }, [yearFiltered]);

  // --- Year comparison ---
  const compareFiltered = useMemo(() => compareYear ? records.filter(r => String(r.year) === compareYear) : [], [records, compareYear]);

  const comparisonData = useMemo(() => {
    if (!compareYear) return null;
    const build = (data: IncomeEntry[]) => MONTHS.map((_, idx) => {
      const mr = data.filter(r => r.month === idx + 1);
      return { netto: mr.reduce((s, r) => s + r.netto, 0), count: mr.length };
    });
    const y1 = build(yearFiltered);
    const y2 = build(compareFiltered);

    const monthlyComparison = MONTHS.map((name, idx) => ({
      month: name,
      [`netto_${selectedYear}`]: y1[idx].netto,
      [`netto_${compareYear}`]: y2[idx].netto,
    }));

    let cum1 = 0, cum2 = 0;
    const cumulativeComparison = MONTHS.map((name, idx) => {
      cum1 += y1[idx].netto; cum2 += y2[idx].netto;
      return { month: name, [`cum_${selectedYear}`]: cum1, [`cum_${compareYear}`]: cum2 };
    });

    const totY1 = { netto: yearFiltered.reduce((s, r) => s + r.netto, 0), records: yearFiltered.length };
    const totY2 = { netto: compareFiltered.reduce((s, r) => s + r.netto, 0), records: compareFiltered.length };
    const nettoDiff = totY1.netto - totY2.netto;
    const nettoPct = totY2.netto !== 0 ? (nettoDiff / totY2.netto) * 100 : 0;

    return { monthlyComparison, cumulativeComparison, totY1, totY2, nettoDiff, nettoPct };
  }, [yearFiltered, compareFiltered, selectedYear, compareYear]);

  // --- Prestaties per nomenclatuur ---
  const prestatieData = useMemo(() => {
    const filtered = yearFiltered.filter(r =>
      r.income_type === prestatieType &&
      (prestatieMonth === 'all' || r.month === Number(prestatieMonth))
    );
    if (filtered.length === 0) return null;

    const byCode: Record<string, { code: string; description: string; count: number; netto: number }> = {};
    filtered.forEach(r => {
      const info = codeToInfo[r.nomenclature_code];
      const unit = info?.netto || 0;
      const qty = r.quantity && r.quantity > 0
        ? r.quantity
        : (unit > 0 ? Math.round(r.netto / unit) : 0);
      const desc = info?.description || r.description || r.nomenclature_code;
      if (!byCode[r.nomenclature_code]) {
        byCode[r.nomenclature_code] = { code: r.nomenclature_code, description: desc, count: 0, netto: 0 };
      }
      byCode[r.nomenclature_code].count += qty;
      byCode[r.nomenclature_code].netto += r.netto;
    });

    const list = Object.values(byCode).sort((a, b) => b.count - a.count);
    if (list.length === 0) return null;

    const totalCount = list.reduce((s, x) => s + x.count, 0);
    const beste = list[0];
    const slechtste = list[list.length - 1];
    const gemiddeld = totalCount / list.length;
    const aantalCodes = list.length;

    const chartData = list.slice(0, 10).map(x => ({
      code: x.code,
      label: x.description.length > 24 ? x.description.slice(0, 24) + '…' : x.description,
      aantal: x.count,
    }));

    return { list, chartData, totalCount, beste, slechtste, gemiddeld, aantalCodes };
  }, [yearFiltered, prestatieType, prestatieMonth, codeToInfo]);

  const codeDetail = useMemo(() => {
    if (!selectedCode) return null;
    const filtered = yearFiltered.filter(r =>
      r.income_type === prestatieType &&
      r.nomenclature_code === selectedCode &&
      (prestatieMonth === 'all' || r.month === Number(prestatieMonth))
    );
    const info = codeToInfo[selectedCode];
    const unit = info?.netto || 0;
    const description = info?.description || filtered[0]?.description || selectedCode;
    let totalQty = 0;
    const rows = filtered.map(r => {
      const qty = r.quantity && r.quantity > 0 ? r.quantity : (unit > 0 ? Math.round(r.netto / unit) : 0);
      totalQty += qty;
      return { ...r, qty };
    }).sort((a, b) => a.month - b.month);
    const totals = {
      netto: filtered.reduce((s, r) => s + r.netto, 0),
      aandeel: filtered.reduce((s, r) => s + r.aandeel_arts, 0),
      total: filtered.reduce((s, r) => s + r.total_amount, 0),
      mif: filtered.reduce((s, r) => s + r.mif, 0),
      bouwfonds: filtered.reduce((s, r) => s + r.bouwfonds, 0),
    };
    // monthly breakdown
    const monthly = MONTHS.map((name, idx) => {
      const mr = rows.filter(r => r.month === idx + 1);
      const qty = mr.reduce((s, r) => s + r.qty, 0);
      return { month: name, qty, netto: mr.reduce((s, r) => s + r.netto, 0) };
    });
    return { description, rows, totalQty, totals, unit, monthly };
  }, [selectedCode, yearFiltered, prestatieType, prestatieMonth, codeToInfo]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Statistieken</h1>
          <p className="text-muted-foreground mt-1">Analyses, trends en jaarvergelijking.</p>
        </div>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-full sm:w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            {years.length === 0 && <SelectItem value={selectedYear}>{selectedYear}</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="statistieken">Statistieken</TabsTrigger>
          <TabsTrigger value="prestaties">Prestaties</TabsTrigger>
          <TabsTrigger value="vergelijking">Jaarvergelijking</TabsTrigger>
        </TabsList>

        {/* Statistieken */}
        <TabsContent value="statistieken" className="space-y-6 mt-4">
          {!statsData ? (
            <div className="text-center py-12 text-muted-foreground">Geen data beschikbaar voor statistieken.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="stat-card">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><BarChart3 className="h-5 w-5 text-primary" /></div>
                    <div><p className="text-sm text-muted-foreground">Gemiddeld / maand</p><p className="text-xl font-semibold">{fmt(statsData.gemiddelde)}</p></div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center"><Minus className="h-5 w-5 text-secondary" /></div>
                    <div><p className="text-sm text-muted-foreground">Mediaan / maand</p><p className="text-xl font-semibold">{fmt(statsData.mediaan)}</p></div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      {statsData.trendDirection === 'stijgend' ? <ArrowUpRight className="h-5 w-5 text-primary" /> : statsData.trendDirection === 'dalend' ? <ArrowDownRight className="h-5 w-5 text-destructive" /> : <Minus className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div><p className="text-sm text-muted-foreground">Trend</p><p className="text-xl font-semibold capitalize">{statsData.trendDirection}</p><p className="text-xs text-muted-foreground">{fmt(Math.abs(statsData.slope))}/maand</p></div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Activity className="h-5 w-5 text-muted-foreground" /></div>
                    <div><p className="text-sm text-muted-foreground">Records</p><p className="text-xl font-semibold">{statsData.aantalRecords}</p><p className="text-xs text-muted-foreground">{statsData.aantalMaanden} maand(en)</p></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-border/50">
                  <CardHeader><CardTitle className="text-base">Beste & Slechtste Maand</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/10">
                      <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /><span className="text-sm font-medium">Beste maand</span></div>
                      <div className="text-right"><p className="font-semibold">{fmt(statsData.besteM.total)}</p><p className="text-xs text-muted-foreground">{MONTH_NAMES[statsData.besteM.month - 1]}</p></div>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/10">
                      <div className="flex items-center gap-2"><TrendingDown className="h-4 w-4 text-destructive" /><span className="text-sm font-medium">Slechtste maand</span></div>
                      <div className="text-right"><p className="font-semibold">{fmt(statsData.slechtsteM.total)}</p><p className="text-xs text-muted-foreground">{MONTH_NAMES[statsData.slechtsteM.month - 1]}</p></div>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/30">
                      <span className="text-sm text-muted-foreground">Verschil</span>
                      <p className="font-semibold">{fmt(statsData.besteM.total - statsData.slechtsteM.total)}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardHeader><CardTitle className="text-base">Grootste Verschillen</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {statsData.grootsteStijging && statsData.grootsteStijging.diff > 0 && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/10">
                        <div className="flex items-center gap-2"><ArrowUpRight className="h-4 w-4 text-primary" /><div><span className="text-sm font-medium">Grootste stijging</span><p className="text-xs text-muted-foreground">{statsData.grootsteStijging.from} → {statsData.grootsteStijging.to}</p></div></div>
                        <div className="text-right"><p className="font-semibold text-primary">{fmt(statsData.grootsteStijging.diff)}</p><p className="text-xs text-muted-foreground">{fmtPct(statsData.grootsteStijging.pct)}</p></div>
                      </div>
                    )}
                    {statsData.grootsteDaling && statsData.grootsteDaling.diff < 0 && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/10">
                        <div className="flex items-center gap-2"><ArrowDownRight className="h-4 w-4 text-destructive" /><div><span className="text-sm font-medium">Grootste daling</span><p className="text-xs text-muted-foreground">{statsData.grootsteDaling.from} → {statsData.grootsteDaling.to}</p></div></div>
                        <div className="text-right"><p className="font-semibold text-destructive">{fmt(statsData.grootsteDaling.diff)}</p><p className="text-xs text-muted-foreground">{fmtPct(statsData.grootsteDaling.pct)}</p></div>
                      </div>
                    )}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/30">
                      <span className="text-sm text-muted-foreground">Gemiddeld per record</span>
                      <p className="font-semibold">{fmt(statsData.gemiddeldePerRecord)}</p>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/30">
                      <span className="text-sm text-muted-foreground">Mediaan per record</span>
                      <p className="font-semibold">{fmt(statsData.mediaanPerRecord)}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border/50">
                <CardHeader><CardTitle className="text-base">Maandelijks Netto Verloop</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={monthlyTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                      <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                      <Tooltip formatter={(val: number) => fmt(val)} />
                      <Legend />
                      <Line type="monotone" dataKey="netto" name="Netto" stroke="hsl(174, 50%, 40%)" strokeWidth={2.5} dot={{ r: 4, fill: 'hsl(174, 50%, 40%)' }} />
                      <Line type="linear" dataKey="trend" name="Trendlijn" stroke="hsl(38, 92%, 50%)" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Prestaties */}
        <TabsContent value="prestaties" className="space-y-6 mt-4">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span className="text-sm font-medium text-muted-foreground">Type:</span>
            <Select value={prestatieType} onValueChange={(v) => setPrestatieType(v as 'ambulatory' | 'hospitalized' | 'associatie')}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ambulatory">Ambulant</SelectItem>
                <SelectItem value="hospitalized">Hospitalisatie</SelectItem>
                <SelectItem value="associatie">Associatie</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm font-medium text-muted-foreground ml-2">Maand:</span>
            <Select value={prestatieMonth} onValueChange={setPrestatieMonth}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Volledig jaar</SelectItem>
                {MONTH_NAMES.map((name, idx) => (
                  <SelectItem key={idx + 1} value={String(idx + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!prestatieData ? (
            <div className="text-center py-12 text-muted-foreground">
              Geen prestaties beschikbaar voor {prestatieType === 'ambulatory' ? 'ambulant' : prestatieType === 'hospitalized' ? 'hospitalisatie' : 'associatie'} in {prestatieMonth === 'all' ? selectedYear : `${MONTH_NAMES[Number(prestatieMonth) - 1]} ${selectedYear}`}.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="stat-card">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><Stethoscope className="h-5 w-5 text-primary" /></div>
                    <div><p className="text-sm text-muted-foreground">Totaal prestaties</p><p className="text-xl font-semibold">{prestatieData.totalCount}</p></div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center"><BarChart3 className="h-5 w-5 text-secondary" /></div>
                    <div><p className="text-sm text-muted-foreground">Aantal codes</p><p className="text-xl font-semibold">{prestatieData.aantalCodes}</p></div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Activity className="h-5 w-5 text-muted-foreground" /></div>
                    <div><p className="text-sm text-muted-foreground">Gemiddeld / code</p><p className="text-xl font-semibold">{prestatieData.gemiddeld.toFixed(1)}</p></div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-primary" /></div>
                    <div><p className="text-sm text-muted-foreground">Top code</p><p className="text-xl font-semibold">{prestatieData.beste.code}</p></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-border/50">
                  <CardHeader><CardTitle className="text-base">Beste & Slechtste Prestatie</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <button
                      type="button"
                      onClick={() => setSelectedCode(prestatieData.beste.code)}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/10 hover:bg-primary/10 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        <div>
                          <span className="text-sm font-medium">Meest uitgevoerd</span>
                          <p className="text-xs text-muted-foreground">{prestatieData.beste.code} – {prestatieData.beste.description}</p>
                        </div>
                      </div>
                      <div className="text-right"><p className="font-semibold">{prestatieData.beste.count}×</p><p className="text-xs text-muted-foreground">{fmt(prestatieData.beste.netto)}</p></div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCode(prestatieData.slechtste.code)}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/10 hover:bg-destructive/10 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-destructive" />
                        <div>
                          <span className="text-sm font-medium">Minst uitgevoerd</span>
                          <p className="text-xs text-muted-foreground">{prestatieData.slechtste.code} – {prestatieData.slechtste.description}</p>
                        </div>
                      </div>
                      <div className="text-right"><p className="font-semibold">{prestatieData.slechtste.count}×</p><p className="text-xs text-muted-foreground">{fmt(prestatieData.slechtste.netto)}</p></div>
                    </button>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/30">
                      <span className="text-sm text-muted-foreground">Verschil</span>
                      <p className="font-semibold">{prestatieData.beste.count - prestatieData.slechtste.count}×</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardHeader><CardTitle className="text-base">Alle prestaties</CardTitle></CardHeader>
                  <CardContent className="space-y-2 max-h-[320px] overflow-y-auto">
                    {prestatieData.list.map(item => (
                      <button
                        type="button"
                        key={item.code}
                        onClick={() => setSelectedCode(item.code)}
                        className="w-full flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/30 hover:bg-muted/60 hover:border-primary/40 transition-colors text-left"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{item.code}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                        </div>
                        <div className="text-right ml-3"><p className="font-semibold">{item.count}×</p><p className="text-xs text-muted-foreground">{fmt(item.netto)}</p></div>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border/50">
                <CardHeader><CardTitle className="text-base">Aantal prestaties per nomenclatuur (top 10)</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-2">Klik op een balk voor details.</p>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={prestatieData.chartData} margin={{ bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" angle={-25} textAnchor="end" interval={0} height={70} />
                      <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" allowDecimals={false} />
                      <Tooltip formatter={(val: number) => `${val}×`} />
                      <Bar dataKey="aantal" name="Aantal" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d: any) => d?.code && setSelectedCode(d.code)}>
                        {prestatieData.chartData.map((entry) => (
                          <Cell key={entry.code} fill="hsl(174, 50%, 40%)" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Jaarvergelijking */}
        <TabsContent value="vergelijking" className="space-y-6 mt-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm font-medium text-muted-foreground">Vergelijk {selectedYear} met:</span>
            <Select value={compareYear} onValueChange={setCompareYear}>
              <SelectTrigger className="w-28"><SelectValue placeholder="Jaar" /></SelectTrigger>
              <SelectContent>
                {years.filter(y => String(y) !== selectedYear).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!compareYear || !comparisonData ? (
            <div className="text-center py-12 text-muted-foreground">Selecteer een tweede jaar om te vergelijken.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-border/50">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground mb-1">Netto {selectedYear}</p>
                    <p className="text-2xl font-semibold">{fmt(comparisonData.totY1.netto)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{comparisonData.totY1.records} records</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground mb-1">Netto {compareYear}</p>
                    <p className="text-2xl font-semibold">{fmt(comparisonData.totY2.netto)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{comparisonData.totY2.records} records</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground mb-1">Verschil</p>
                    <p className={`text-2xl font-semibold ${comparisonData.nettoDiff >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {comparisonData.nettoDiff >= 0 ? '+' : ''}{fmt(comparisonData.nettoDiff)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{fmtPct(comparisonData.nettoPct)}</p>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border/50">
                <CardHeader><CardTitle className="text-base">Maandelijks Netto – {selectedYear} vs {compareYear}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={comparisonData.monthlyComparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                      <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                      <Tooltip formatter={(val: number) => fmt(val)} />
                      <Legend />
                      <Bar dataKey={`netto_${selectedYear}`} name={selectedYear} fill="hsl(174, 50%, 40%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey={`netto_${compareYear}`} name={compareYear} fill="hsl(210, 60%, 35%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader><CardTitle className="text-base">Cumulatief Netto – {selectedYear} vs {compareYear}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={comparisonData.cumulativeComparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                      <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                      <Tooltip formatter={(val: number) => fmt(val)} />
                      <Legend />
                      <Line type="monotone" dataKey={`cum_${selectedYear}`} name={selectedYear} stroke="hsl(174, 50%, 40%)" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey={`cum_${compareYear}`} name={compareYear} stroke="hsl(210, 60%, 35%)" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedCode} onOpenChange={(open) => !open && setSelectedCode(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedCode} – {codeDetail?.description}</DialogTitle>
            <DialogDescription>
              {prestatieType === 'ambulatory' ? 'Ambulant' : prestatieType === 'hospitalized' ? 'Hospitalisatie' : 'Hospitalisatie associatie'} · {prestatieMonth === 'all' ? `Volledig ${selectedYear}` : `${MONTH_NAMES[Number(prestatieMonth) - 1]} ${selectedYear}`}
            </DialogDescription>
          </DialogHeader>

          {codeDetail && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <p className="text-xs text-muted-foreground">Aantal</p>
                  <p className="text-lg font-semibold">{codeDetail.totalQty}×</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border border-border/30">
                  <p className="text-xs text-muted-foreground">Netto totaal</p>
                  <p className="text-lg font-semibold">{fmt(codeDetail.totals.netto)}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border border-border/30">
                  <p className="text-xs text-muted-foreground">Aandeel arts</p>
                  <p className="text-lg font-semibold">{fmt(codeDetail.totals.aandeel)}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border border-border/30">
                  <p className="text-xs text-muted-foreground">Eenheid netto</p>
                  <p className="text-lg font-semibold">{fmt(codeDetail.unit)}</p>
                </div>
              </div>

              {prestatieMonth === 'all' && (
                <Card className="border-border/50">
                  <CardHeader><CardTitle className="text-base">Per maand</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={codeDetail.monthly}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" allowDecimals={false} />
                        <Tooltip formatter={(val: number, name) => name === 'netto' ? fmt(val) : `${val}×`} />
                        <Bar dataKey="qty" name="Aantal" fill="hsl(174, 50%, 40%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              <Card className="border-border/50">
                <CardHeader><CardTitle className="text-base">Records ({codeDetail.rows.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Maand</TableHead>
                        <TableHead className="text-right">Aantal</TableHead>
                        <TableHead className="text-right">Bruto</TableHead>
                        <TableHead className="text-right">Aandeel arts</TableHead>
                        <TableHead className="text-right">Netto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {codeDetail.rows.map(r => (
                        <TableRow key={r.id}>
                          <TableCell>{MONTH_NAMES[r.month - 1]}</TableCell>
                          <TableCell className="text-right">{r.qty}×</TableCell>
                          <TableCell className="text-right">{fmt(r.total_amount)}</TableCell>
                          <TableCell className="text-right">{fmt(r.aandeel_arts)}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(r.netto)}</TableCell>
                        </TableRow>
                      ))}
                      {codeDetail.rows.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Geen records</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
