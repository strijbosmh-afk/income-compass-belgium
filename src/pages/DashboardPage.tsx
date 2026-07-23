import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useDataVersion } from '@/hooks/useDataVersion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, TrendingUp, Activity, Building2, Landmark, Wallet, Users, ChevronLeft, ChevronRight, CalendarDays, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { GoalsWidget } from '@/components/GoalsWidget';
import { MissingMonthsWidget } from '@/components/MissingMonthsWidget';
import { MonthlyReport } from '@/components/MonthlyReport';
import { applyShare } from '@/lib/incomeTypes';
import { YearForecastWidget } from '@/components/YearForecastWidget';
import { SmartActionItemsWidget } from '@/components/SmartActionItemsWidget';
import { FinancialFutureScoreWidget } from '@/components/FinancialFutureScoreWidget';

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



export default function DashboardPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<IncomeEntry[]>([]);
  const [nomenclatureCodes, setNomenclatureCodes] = useState<NomenclatureCode[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [viewMode, setViewMode] = useState('overview');
  const dataVersion = useDataVersion();

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      supabase.from('income_records')
        .select('id, month, year, income_type, nomenclature_code, total_amount, aandeel_arts, bouwfonds, mif, netto, description')
        .eq('user_id', user.id)
        .in('year', [parseInt(selectedYear), parseInt(selectedYear) - 1]),
      supabase.from('nomenclature_codes').select('code, category, description').eq('user_id', user.id),
      supabase.from('income_records').select('year').eq('user_id', user.id),
    ]).then(([recRes, nomRes, yearsRes]) => {
      // Associatie-records zijn bij bewaren al genormaliseerd naar 50% eigen aandeel.
      setRecords((recRes.data || []).map((r: any) => applyShare(r)));
      setNomenclatureCodes(nomRes.data || []);
      setAvailableYears([...new Set((yearsRes.data || []).map((r) => r.year))].sort((a, b) => b - a));
      setLoading(false);
    });
  }, [user, dataVersion, selectedYear]);

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

  const years = useMemo(() => [...new Set([...availableYears, parseInt(selectedYear)])].filter(Boolean).sort((a, b) => b - a), [availableYears, selectedYear]);
  
  // Year-filtered (for charts that need full year)
  const yearFiltered = useMemo(() => records.filter(r => String(r.year) === selectedYear), [records, selectedYear]);
  const previousYearFiltered = useMemo(() => records.filter(r => r.year === parseInt(selectedYear) - 1), [records, selectedYear]);
  
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
  const nettoAssoc = filtered.filter(r => r.income_type === 'associatie').reduce((s, r) => s + r.netto, 0);

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
        associatie: mr.filter(r => r.income_type === 'associatie').reduce((s, r) => s + r.netto, 0),
        netto: mr.reduce((s, r) => s + r.netto, 0),
      };
    });
  }, [yearFiltered]);

  const activeMonthCount = monthlyData.filter((m) => m.netto > 0).length;
  const monthlyAverage = activeMonthCount > 0 ? monthlyData.reduce((sum, m) => sum + m.netto, 0) / activeMonthCount : 0;
  const bestMonth = monthlyData.reduce((best, month) => (month.netto > best.netto ? month : best), monthlyData[0] || { month: '-', netto: 0 });
  const bestMonthIndex = monthlyData.findIndex((m) => m.month === bestMonth.month);
  const collectionRatio = brutoTotal > 0 ? (nettoTotal / brutoTotal) * 100 : 0;
  const selectedMonthData = selectedMonth === 'all' ? null : monthlyData[parseInt(selectedMonth) - 1];

  const cumulativeData = useMemo(() => {
    let cumAmb = 0, cumHosp = 0, cumAssoc = 0;
    return MONTHS.map((name, idx) => {
      const mr = yearFiltered.filter(r => r.month === idx + 1);
      cumAmb += mr.filter(r => r.income_type === 'ambulatory').reduce((s, r) => s + r.netto, 0);
      cumHosp += mr.filter(r => r.income_type === 'hospitalized').reduce((s, r) => s + r.netto, 0);
      cumAssoc += mr.filter(r => r.income_type === 'associatie').reduce((s, r) => s + r.netto, 0);
      return { month: name, cumulatief: cumAmb + cumHosp + cumAssoc, ambulant: cumAmb, gehospitaliseerd: cumHosp, associatie: cumAssoc };
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

  const previousYearNettoTotal = useMemo(() => previousYearFiltered.reduce((sum, record) => sum + record.netto, 0), [previousYearFiltered]);



  const pieData = [
    { name: 'Ambulant', value: nettoAmbulant },
    { name: 'Gehospitaliseerd', value: nettoHosp },
    { name: 'Hospitalisatie associatie', value: nettoAssoc },
  ].filter(d => d.value > 0);

  const afdrachtPieData = [
    { name: 'Netto loon', value: nettoTotal },
    { name: 'Afdracht', value: totalAfdracht },
    { name: 'Bouwfonds', value: totalBouwfonds },
    { name: 'MIF', value: totalMif },
  ].filter(d => d.value > 0);

  const PIE_COLORS = ['hsl(174, 50%, 40%)', 'hsl(210, 60%, 35%)', 'hsl(280, 45%, 50%)'];
  const AFDRACHT_COLORS = ['hsl(174, 50%, 40%)', 'hsl(210, 60%, 35%)', 'hsl(340, 55%, 45%)', 'hsl(45, 70%, 45%)'];
  const fmt = (val: number) => `€${val.toLocaleString('de-BE', { minimumFractionDigits: 2 })}`;
  const fmtCompact = (val: number) => `€${val.toLocaleString('de-BE', { maximumFractionDigits: 0 })}`;
  

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="dashboard-shell max-w-7xl mx-auto space-y-4 animate-fade-in md:space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="hidden text-xs font-semibold uppercase tracking-[0.25em] text-secondary md:block">Inkomen</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Je belangrijkste cijfers voor {filterLabel}, zonder zoeken.</p>
        </div>
        <div className="flex gap-2 items-center overflow-x-auto pb-1 md:pb-0">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => {
              if (selectedMonth === 'all') {
                setSelectedYear(String(parseInt(selectedYear) - 1));
                setSelectedMonth('12');
              } else {
                const m = parseInt(selectedMonth);
                if (m === 1) {
                  setSelectedYear(String(parseInt(selectedYear) - 1));
                  setSelectedMonth('12');
                } else {
                  setSelectedMonth(String(m - 1));
                }
              }
            }}
            aria-label="Vorige maand"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-36 shrink-0"><SelectValue placeholder="Maand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle maanden</SelectItem>
              {MONTH_NAMES.map((name, idx) => <SelectItem key={idx} value={String(idx + 1)}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => {
              if (selectedMonth === 'all') {
                setSelectedYear(String(parseInt(selectedYear) + 1));
                setSelectedMonth('1');
              } else {
                const m = parseInt(selectedMonth);
                if (m === 12) {
                  setSelectedYear(String(parseInt(selectedYear) + 1));
                  setSelectedMonth('1');
                } else {
                  setSelectedMonth(String(m + 1));
                }
              }
            }}
            aria-label="Volgende maand"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-28 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              {years.length === 0 && <SelectItem value={selectedYear}>{selectedYear}</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      </div>

      <section className="dashboard-hero">
        <div className="dashboard-hero-main">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary-foreground/75">Netto inkomen</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight text-primary-foreground md:text-5xl">{fmt(nettoTotal)}</p>
              <p className="mt-2 text-sm text-primary-foreground/70">
                {filtered.length} record{filtered.length === 1 ? '' : 's'} in {filterLabel}
              </p>
            </div>
            <div className="hidden rounded-2xl bg-white/10 p-3 text-primary-foreground shadow-inner md:block">
              <Wallet className="h-7 w-7" />
            </div>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-3">
            <div className="dashboard-hero-pill">
              <span>Gem. maand</span>
              <strong>{fmtCompact(monthlyAverage)}</strong>
            </div>
            <div className="dashboard-hero-pill">
              <span>Records</span>
              <strong>{filtered.length}</strong>
            </div>
          </div>
        </div>

        <div className="dashboard-hero-side">
          <div className="dashboard-insight-card">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CalendarDays className="h-4 w-4 text-secondary" />
              Gemiddelde maand
            </div>
            <p className="mt-2 text-2xl font-semibold">{fmt(monthlyAverage)}</p>
            <p className="text-xs text-muted-foreground">{activeMonthCount || 0} actieve maand{activeMonthCount === 1 ? '' : 'en'} in {selectedYear}</p>
          </div>
          <div className="dashboard-insight-card">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Trophy className="h-4 w-4 text-amber-500" />
              Beste maand
            </div>
            <p className="mt-2 text-2xl font-semibold">{bestMonthIndex >= 0 ? MONTH_NAMES[bestMonthIndex] : '-'}</p>
            <p className="text-xs text-muted-foreground">{fmt(bestMonth?.netto || 0)}</p>
          </div>
          <div className="dashboard-insight-card md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Netto t.o.v. bruto</p>
                <p className="mt-1 text-2xl font-semibold">{collectionRatio.toFixed(1)}%</p>
              </div>
              {selectedMonthData && (
                <div className="rounded-xl bg-secondary/10 px-3 py-2 text-right">
                  <p className="text-xs text-muted-foreground">Geselecteerd</p>
                  <p className="font-semibold">{fmtCompact(selectedMonthData.netto)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Kort maandoverzicht: 12 blokken per maand */}
      <Card className="ios-card border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Maandoverzicht {selectedYear}</CardTitle>
            <span className="hidden text-xs text-muted-foreground md:inline">Klik een maand om te filteren</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-3 md:grid-cols-4 md:gap-2 lg:grid-cols-6 xl:grid-cols-12">
            {monthlyData.map((m, idx) => {
              const total = m.netto;
              const isSelected = selectedMonth === String(idx + 1);
              const isEmpty = total === 0;
              const intensity = bestMonth.netto > 0 ? Math.max(8, Math.round((total / bestMonth.netto) * 100)) : 0;
              return (
                <button
                  key={m.month}
                  type="button"
                  onClick={() => setSelectedMonth(isSelected ? 'all' : String(idx + 1))}
                  className={`month-tile rounded-lg border px-2 py-2 text-left transition-colors hover:bg-accent/40 ${
                    isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/50'
                  } ${isEmpty ? 'opacity-60' : ''}`}
                  title={`${MONTH_NAMES[idx]} ${selectedYear}`}
                >
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{m.month}</div>
                  <div className="text-sm font-semibold tabular-nums truncate" title={fmt(total)}>
                    €{total.toLocaleString('de-BE', { maximumFractionDigits: 0 })}
                  </div>
                  <div className="mt-2 hidden h-1.5 overflow-hidden rounded-full bg-muted md:block">
                    <div className="h-full rounded-full bg-secondary" style={{ width: `${intensity}%` }} />
                  </div>
                  <div className="mt-1 hidden space-y-0.5 text-[10px] tabular-nums text-muted-foreground sm:block">
                    <div className="flex justify-between gap-1"><span>Amb</span><span>€{m.ambulant.toLocaleString('de-BE', { maximumFractionDigits: 0 })}</span></div>
                    <div className="flex justify-between gap-1"><span>Hosp</span><span>€{m.gehospitaliseerd.toLocaleString('de-BE', { maximumFractionDigits: 0 })}</span></div>
                    <div className="flex justify-between gap-1"><span>Assoc</span><span>€{m.associatie.toLocaleString('de-BE', { maximumFractionDigits: 0 })}</span></div>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Statistieken */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Netto inkomen</p>
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
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-accent/30 flex items-center justify-center">
              <Users className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Associatie <span className="text-xs">(50%)</span></p>
              <p className="text-2xl font-semibold">{fmt(nettoAssoc)}</p>
            </div>
          </div>
        </div>
      </div>

      <FinancialFutureScoreWidget />

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <YearForecastWidget year={parseInt(selectedYear)} monthlyData={monthlyData} previousYearTotal={previousYearNettoTotal} />
        <SmartActionItemsWidget year={parseInt(selectedYear)} />
      </div>

      {/* Doelstellingen & Forecast */}
      <GoalsWidget year={parseInt(selectedYear)} />

      {/* Maandcontrole: ontbrekende / lage maanden */}
      <MissingMonthsWidget year={parseInt(selectedYear)} />

      {/* Maandafsluiting */}
      <MonthlyReport />

      {/* Tabbladen */}
      <Tabs value={viewMode} onValueChange={setViewMode}>
        <TabsList>
          <TabsTrigger value="overview">Per Type</TabsTrigger>
          <TabsTrigger value="category">Per Categorie</TabsTrigger>
          <TabsTrigger value="nomenclature">Per Nomenclatuur</TabsTrigger>
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
                    <Bar dataKey="associatie" name="Hospitalisatie associatie" fill="hsl(280, 45%, 50%)" radius={[4, 4, 0, 0]} />
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
                    <Line type="monotone" dataKey="associatie" name="Hospitalisatie associatie" stroke="hsl(280, 45%, 50%)" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
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
