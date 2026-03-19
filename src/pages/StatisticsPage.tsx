import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, TrendingUp, TrendingDown, Activity, BarChart3, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';

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
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [compareYear, setCompareYear] = useState<string>('');
  const [tab, setTab] = useState('statistieken');

  useEffect(() => {
    if (!user) return;
    supabase.from('income_records')
      .select('id, month, year, income_type, nomenclature_code, total_amount, aandeel_arts, bouwfonds, mif, netto, description')
      .eq('user_id', user.id)
      .then(({ data }) => { setRecords(data || []); setLoading(false); });
  }, [user]);

  const years = useMemo(() => [...new Set(records.map(r => r.year))].sort((a, b) => b - a), [records]);
  const yearFiltered = useMemo(() => records.filter(r => String(r.year) === selectedYear), [records, selectedYear]);

  const monthlyData = useMemo(() =>
    MONTHS.map((name, idx) => {
      const mr = yearFiltered.filter(r => r.month === idx + 1);
      return { month: name, netto: mr.reduce((s, r) => s + r.netto, 0) };
    }), [yearFiltered]);

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

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Statistieken</h1>
          <p className="text-muted-foreground mt-1">Analyses, trends en jaarvergelijking.</p>
        </div>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            {years.length === 0 && <SelectItem value={selectedYear}>{selectedYear}</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="statistieken">Statistieken</TabsTrigger>
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
                    <LineChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                      <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                      <Tooltip formatter={(val: number) => fmt(val)} />
                      <Line type="monotone" dataKey="netto" name="Netto" stroke="hsl(174, 50%, 40%)" strokeWidth={2.5} dot={{ r: 4, fill: 'hsl(174, 50%, 40%)' }} />
                    </LineChart>
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
    </div>
  );
}
