import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, TrendingUp, TrendingDown, Activity, Building2, Landmark, Wallet, BarChart3, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';

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

type NomenclatureCode = {
  code: string;
  category: string;
  description: string;
};

const MONTHS = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const MONTH_NAMES = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
const CATEGORY_COLORS = [
  'hsl(174, 50%, 40%)', 'hsl(210, 60%, 35%)', 'hsl(340, 55%, 45%)',
  'hsl(45, 70%, 45%)', 'hsl(130, 40%, 40%)', 'hsl(270, 45%, 50%)',
  'hsl(20, 60%, 45%)', 'hsl(190, 50%, 35%)',
];

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<IncomeEntry[]>([]);
  const [nomenclatureCodes, setNomenclatureCodes] = useState<NomenclatureCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [compareYear, setCompareYear] = useState<string>('');
  const [viewMode, setViewMode] = useState('overview');

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('income_records').select('id, month, year, income_type, nomenclature_code, total_amount, aandeel_arts, bouwfonds, mif, netto, description').eq('user_id', user.id),
      supabase.from('nomenclature_codes').select('code, category, description').eq('user_id', user.id),
    ]).then(([recRes, nomRes]) => {
      setRecords(recRes.data || []);
      setNomenclatureCodes(nomRes.data || []);
      setLoading(false);
    });
  }, [user]);

  const codeToCategory = useMemo(() => {
    const map: Record<string, string> = {};
    nomenclatureCodes.forEach(n => { map[n.code] = n.category; });
    return map;
  }, [nomenclatureCodes]);

  const codeToLabel = useMemo(() => {
    const map: Record<string, string> = {};
    nomenclatureCodes.forEach(n => { map[n.code] = n.description ? `${n.code} – ${n.description}` : n.code; });
    return map;
  }, [nomenclatureCodes]);

  const years = useMemo(() => [...new Set(records.map(r => r.year))].sort((a, b) => b - a), [records]);
  
  // Year-filtered (for charts that need full year)
  const yearFiltered = useMemo(() => records.filter(r => String(r.year) === selectedYear), [records, selectedYear]);
  
  // Year+month filtered (for totals and stats)
  const filtered = useMemo(() => {
    let f = records.filter(r => String(r.year) === selectedYear);
    if (selectedMonth !== 'all') f = f.filter(r => r.month === parseInt(selectedMonth));
    return f;
  }, [records, selectedYear, selectedMonth]);

  const filterLabel = selectedMonth === 'all' ? selectedYear : `${MONTH_NAMES[parseInt(selectedMonth) - 1]} ${selectedYear}`;

  // Netto
  const nettoTotal = filtered.reduce((s, r) => s + r.netto, 0);
  const nettoAmbulant = filtered.filter(r => r.income_type === 'ambulatory').reduce((s, r) => s + r.netto, 0);
  const nettoHosp = filtered.filter(r => r.income_type === 'hospitalized').reduce((s, r) => s + r.netto, 0);

  // Afdracht
  const brutoTotal = filtered.reduce((s, r) => s + r.total_amount, 0);
  const totalAandeelArts = filtered.reduce((s, r) => s + r.aandeel_arts, 0);
  const totalAfdracht = brutoTotal - totalAandeelArts;
  const totalBouwfonds = filtered.reduce((s, r) => s + r.bouwfonds, 0);
  const totalMif = filtered.reduce((s, r) => s + r.mif, 0);

  // Monthly data (always full year for charts)
  const monthlyData = useMemo(() => {
    return MONTHS.map((name, idx) => {
      const mr = yearFiltered.filter(r => r.month === idx + 1);
      return {
        month: name,
        ambulant: mr.filter(r => r.income_type === 'ambulatory').reduce((s, r) => s + r.netto, 0),
        gehospitaliseerd: mr.filter(r => r.income_type === 'hospitalized').reduce((s, r) => s + r.netto, 0),
        netto: mr.reduce((s, r) => s + r.netto, 0),
      };
    });
  }, [yearFiltered]);

  const cumulativeData = useMemo(() => {
    let cumAmb = 0, cumHosp = 0;
    return MONTHS.map((name, idx) => {
      const mr = yearFiltered.filter(r => r.month === idx + 1);
      cumAmb += mr.filter(r => r.income_type === 'ambulatory').reduce((s, r) => s + r.netto, 0);
      cumHosp += mr.filter(r => r.income_type === 'hospitalized').reduce((s, r) => s + r.netto, 0);
      return { month: name, cumulatief: cumAmb + cumHosp, ambulant: cumAmb, gehospitaliseerd: cumHosp };
    });
  }, [yearFiltered]);

  const nomenclatureData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => { map[r.nomenclature_code] = (map[r.nomenclature_code] || 0) + r.netto; });
    return Object.entries(map).map(([code, bedrag]) => ({
      code, label: codeToLabel[code] || code, bedrag,
    })).sort((a, b) => b.bedrag - a.bedrag).slice(0, 10);
  }, [filtered, codeToLabel]);

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => {
      const cat = codeToCategory[r.nomenclature_code] || 'onbekend';
      map[cat] = (map[cat] || 0) + r.netto;
    });
    return Object.entries(map).map(([category, bedrag]) => ({ category, bedrag })).sort((a, b) => b.bedrag - a.bedrag);
  }, [filtered, codeToCategory]);

  const monthlyCategoryData = useMemo(() => {
    const cats = categoryTotals.map(c => c.category);
    return MONTHS.map((name, idx) => {
      const mr = yearFiltered.filter(r => r.month === idx + 1);
      const entry: Record<string, any> = { month: name };
      cats.forEach(cat => {
        entry[cat] = mr.filter(r => (codeToCategory[r.nomenclature_code] || 'onbekend') === cat).reduce((s, r) => s + r.netto, 0);
      });
      return entry;
    });
  }, [yearFiltered, categoryTotals, codeToCategory]);

  const monthlyAfdrachtData = useMemo(() => {
    return MONTHS.map((name, idx) => {
      const mr = yearFiltered.filter(r => r.month === idx + 1);
      const mTotal = mr.reduce((s, r) => s + r.total_amount, 0);
      const mAandeelArts = mr.reduce((s, r) => s + r.aandeel_arts, 0);
      const mBouwfonds = mr.reduce((s, r) => s + r.bouwfonds, 0);
      const mMif = mr.reduce((s, r) => s + r.mif, 0);
      return { month: name, afdracht: mTotal - mAandeelArts, bouwfonds: mBouwfonds, mif: mMif };
    });
  }, [yearFiltered]);

  // --- Statistics calculations ---
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

    // Month-over-month differences
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

    // Trend: simple linear regression
    const n = monthlyNetto.length;
    const xMean = monthlyNetto.reduce((s, m) => s + m.month, 0) / n;
    const yMean = gemiddelde;
    let num = 0, den = 0;
    monthlyNetto.forEach(m => {
      num += (m.month - xMean) * (m.total - yMean);
      den += (m.month - xMean) ** 2;
    });
    const slope = den !== 0 ? num / den : 0;
    const trendDirection = slope > 50 ? 'stijgend' : slope < -50 ? 'dalend' : 'stabiel';

    // Per-record stats
    const recordNettos = yearFiltered.map(r => r.netto);
    const gemiddeldePerRecord = recordNettos.length > 0 ? recordNettos.reduce((a, b) => a + b, 0) / recordNettos.length : 0;
    const mediaanPerRecord = median(recordNettos);

    return {
      monthlyNetto,
      gemiddelde,
      mediaan,
      besteM,
      slechtsteM,
      grootsteStijging,
      grootsteDaling,
      trendDirection,
      slope,
      gemiddeldePerRecord,
      mediaanPerRecord,
      aantalRecords: yearFiltered.length,
      aantalMaanden: monthlyNetto.length,
    };
  }, [yearFiltered]);

  // --- Year comparison data ---
  const compareFiltered = useMemo(() => compareYear ? records.filter(r => String(r.year) === compareYear) : [], [records, compareYear]);

  const comparisonData = useMemo(() => {
    if (!compareYear) return null;
    const buildYearMonthly = (data: IncomeEntry[]) =>
      MONTHS.map((name, idx) => {
        const mr = data.filter(r => r.month === idx + 1);
        return {
          netto: mr.reduce((s, r) => s + r.netto, 0),
          bruto: mr.reduce((s, r) => s + r.total_amount, 0),
          afdracht: mr.reduce((s, r) => s + r.total_amount - r.aandeel_arts, 0),
          count: mr.length,
        };
      });

    const y1 = buildYearMonthly(yearFiltered);
    const y2 = buildYearMonthly(compareFiltered);

    const monthlyComparison = MONTHS.map((name, idx) => ({
      month: name,
      [`netto_${selectedYear}`]: y1[idx].netto,
      [`netto_${compareYear}`]: y2[idx].netto,
    }));

    const cumulativeComparison = (() => {
      let cum1 = 0, cum2 = 0;
      return MONTHS.map((name, idx) => {
        cum1 += y1[idx].netto;
        cum2 += y2[idx].netto;
        return { month: name, [`cum_${selectedYear}`]: cum1, [`cum_${compareYear}`]: cum2 };
      });
    })();

    const totY1 = { netto: yearFiltered.reduce((s, r) => s + r.netto, 0), bruto: yearFiltered.reduce((s, r) => s + r.total_amount, 0), records: yearFiltered.length };
    const totY2 = { netto: compareFiltered.reduce((s, r) => s + r.netto, 0), bruto: compareFiltered.reduce((s, r) => s + r.total_amount, 0), records: compareFiltered.length };
    const nettoDiff = totY1.netto - totY2.netto;
    const nettoPct = totY2.netto !== 0 ? (nettoDiff / totY2.netto) * 100 : 0;

    return { monthlyComparison, cumulativeComparison, totY1, totY2, nettoDiff, nettoPct };
  }, [yearFiltered, compareFiltered, selectedYear, compareYear]);

  const pieData = [
    { name: 'Ambulant', value: nettoAmbulant },
    { name: 'Gehospitaliseerd', value: nettoHosp },
  ].filter(d => d.value > 0);

  const afdrachtPieData = [
    { name: 'Netto loon', value: nettoTotal },
    { name: 'Afdracht', value: totalAfdracht },
    { name: 'Bouwfonds', value: totalBouwfonds },
    { name: 'MIF', value: totalMif },
  ].filter(d => d.value > 0);

  const PIE_COLORS = ['hsl(174, 50%, 40%)', 'hsl(210, 60%, 35%)'];
  const AFDRACHT_COLORS = ['hsl(174, 50%, 40%)', 'hsl(210, 60%, 35%)', 'hsl(340, 55%, 45%)', 'hsl(45, 70%, 45%)'];
  const fmt = (val: number) => `€${val.toLocaleString('de-BE', { minimumFractionDigits: 2 })}`;
  const fmtPct = (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overzicht van je inkomsten voor {filterLabel}.</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Maand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle maanden</SelectItem>
              {MONTH_NAMES.map((name, idx) => <SelectItem key={idx} value={String(idx + 1)}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              {years.length === 0 && <SelectItem value={selectedYear}>{selectedYear}</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Statistieken */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Netto Inkomen</p>
              <p className="text-2xl font-semibold">{fmt(nettoTotal)}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center">
              <Activity className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ambulant</p>
              <p className="text-2xl font-semibold">{fmt(nettoAmbulant)}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Gehospitaliseerd</p>
              <p className="text-2xl font-semibold">{fmt(nettoHosp)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabbladen */}
      <Tabs value={viewMode} onValueChange={setViewMode}>
        <TabsList>
          <TabsTrigger value="overview">Per Type</TabsTrigger>
          <TabsTrigger value="category">Per Categorie</TabsTrigger>
          <TabsTrigger value="nomenclature">Per Nomenclatuur</TabsTrigger>
          <TabsTrigger value="statistieken">Statistieken</TabsTrigger>
          <TabsTrigger value="afdracht">Afdracht</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-base">Maandelijks Netto per Type</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                    <Tooltip formatter={(val: number) => fmt(val)} />
                    <Legend />
                    <Bar dataKey="ambulant" name="Ambulant" fill="hsl(174, 50%, 40%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="gehospitaliseerd" name="Gehospitaliseerd" fill="hsl(210, 60%, 35%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-base">Verdeling Netto</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {pieData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx]} />)}
                    </Pie>
                    <Tooltip formatter={(val: number) => fmt(val)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border/50 lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Cumulatief Netto Inkomen</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={cumulativeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                    <Tooltip formatter={(val: number) => fmt(val)} />
                    <Legend />
                    <Line type="monotone" dataKey="cumulatief" name="Totaal" stroke="hsl(210, 60%, 25%)" strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="ambulant" name="Ambulant" stroke="hsl(174, 50%, 40%)" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                    <Line type="monotone" dataKey="gehospitaliseerd" name="Gehospitaliseerd" stroke="hsl(210, 60%, 35%)" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="category" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-base">Netto per Categorie</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={categoryTotals} cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={3} dataKey="bedrag" nameKey="category" label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}>
                      {categoryTotals.map((_, idx) => <Cell key={idx} fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(val: number) => fmt(val)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-base">Totalen per Categorie</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={categoryTotals} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                    <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                    <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={100} stroke="hsl(220, 10%, 46%)" />
                    <Tooltip formatter={(val: number) => fmt(val)} />
                    <Bar dataKey="bedrag" name="Bedrag" radius={[0, 4, 4, 0]}>
                      {categoryTotals.map((_, idx) => <Cell key={idx} fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border/50 lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Maandelijks Netto per Categorie</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={monthlyCategoryData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                    <Tooltip formatter={(val: number) => fmt(val)} />
                    <Legend />
                    {categoryTotals.map((cat, idx) => (
                      <Bar key={cat.category} dataKey={cat.category} name={cat.category} stackId="a" fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="nomenclature" className="space-y-6 mt-4">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-base">Top Nomenclatuurcodes (Netto)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={nomenclatureData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={200} stroke="hsl(220, 10%, 46%)" />
                  <Tooltip formatter={(val: number) => fmt(val)} />
                  <Bar dataKey="bedrag" name="Bedrag" fill="hsl(174, 50%, 40%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Statistieken Tab */}
        <TabsContent value="statistieken" className="space-y-6 mt-4">
          {!statsData ? (
            <div className="text-center py-12 text-muted-foreground">Geen data beschikbaar voor statistieken.</div>
          ) : (
            <>
              {/* Overview stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="stat-card">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BarChart3 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Gemiddeld / maand</p>
                      <p className="text-xl font-semibold">{fmt(statsData.gemiddelde)}</p>
                    </div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                      <Minus className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Mediaan / maand</p>
                      <p className="text-xl font-semibold">{fmt(statsData.mediaan)}</p>
                    </div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      {statsData.trendDirection === 'stijgend' ? <ArrowUpRight className="h-5 w-5 text-primary" /> :
                       statsData.trendDirection === 'dalend' ? <ArrowDownRight className="h-5 w-5 text-destructive" /> :
                       <Minus className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Trend</p>
                      <p className="text-xl font-semibold capitalize">{statsData.trendDirection}</p>
                      <p className="text-xs text-muted-foreground">{fmt(Math.abs(statsData.slope))}/maand</p>
                    </div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                      <Activity className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Records</p>
                      <p className="text-xl font-semibold">{statsData.aantalRecords}</p>
                      <p className="text-xs text-muted-foreground">{statsData.aantalMaanden} maand(en)</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Best / Worst month + Differences */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-border/50">
                  <CardHeader><CardTitle className="text-base">Beste & Slechtste Maand</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/10">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Beste maand</span>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{fmt(statsData.besteM.total)}</p>
                        <p className="text-xs text-muted-foreground">{MONTH_NAMES[statsData.besteM.month - 1]}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/10">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-destructive" />
                        <span className="text-sm font-medium">Slechtste maand</span>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{fmt(statsData.slechtsteM.total)}</p>
                        <p className="text-xs text-muted-foreground">{MONTH_NAMES[statsData.slechtsteM.month - 1]}</p>
                      </div>
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
                        <div className="flex items-center gap-2">
                          <ArrowUpRight className="h-4 w-4 text-primary" />
                          <div>
                            <span className="text-sm font-medium">Grootste stijging</span>
                            <p className="text-xs text-muted-foreground">{statsData.grootsteStijging.from} → {statsData.grootsteStijging.to}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-primary">{fmt(statsData.grootsteStijging.diff)}</p>
                          <p className="text-xs text-muted-foreground">{fmtPct(statsData.grootsteStijging.pct)}</p>
                        </div>
                      </div>
                    )}
                    {statsData.grootsteDaling && statsData.grootsteDaling.diff < 0 && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/10">
                        <div className="flex items-center gap-2">
                          <ArrowDownRight className="h-4 w-4 text-destructive" />
                          <div>
                            <span className="text-sm font-medium">Grootste daling</span>
                            <p className="text-xs text-muted-foreground">{statsData.grootsteDaling.from} → {statsData.grootsteDaling.to}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-destructive">{fmt(statsData.grootsteDaling.diff)}</p>
                          <p className="text-xs text-muted-foreground">{fmtPct(statsData.grootsteDaling.pct)}</p>
                        </div>
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

              {/* Monthly netto trend chart */}
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

        {/* Afdracht Tab */}
        <TabsContent value="afdracht" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="stat-card">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Bruto Ereloon</p>
                  <p className="text-2xl font-semibold">{fmt(brutoTotal)}</p>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <Landmark className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Totaal Afdracht</p>
                  <p className="text-2xl font-semibold">{fmt(totalAfdracht)}</p>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <Landmark className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Bouwfonds</p>
                  <p className="text-2xl font-semibold">{fmt(totalBouwfonds)}</p>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <Landmark className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">MIF</p>
                  <p className="text-2xl font-semibold">{fmt(totalMif)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-base">Verdeling Ereloon</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={afdrachtPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {afdrachtPieData.map((_, idx) => <Cell key={idx} fill={AFDRACHT_COLORS[idx]} />)}
                    </Pie>
                    <Tooltip formatter={(val: number) => fmt(val)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-base">Maandelijkse Afdracht</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyAfdrachtData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                    <Tooltip formatter={(val: number) => fmt(val)} />
                    <Legend />
                    <Bar dataKey="afdracht" name="Afdracht" stackId="a" fill="hsl(210, 60%, 35%)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="bouwfonds" name="Bouwfonds" stackId="a" fill="hsl(340, 55%, 45%)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="mif" name="MIF" stackId="a" fill="hsl(45, 70%, 45%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
