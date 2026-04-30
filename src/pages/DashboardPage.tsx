import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useDataVersion } from '@/hooks/useDataVersion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, TrendingUp, Activity, Building2, Landmark, Wallet } from 'lucide-react';
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



export default function DashboardPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<IncomeEntry[]>([]);
  const [nomenclatureCodes, setNomenclatureCodes] = useState<NomenclatureCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
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
