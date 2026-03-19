import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, TrendingUp, Activity, Building2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';

type IncomeEntry = {
  id: string;
  month: number;
  year: number;
  income_type: string;
  nomenclature_code: string;
  total_amount: number;
  description: string | null;
};

type NomenclatureCode = {
  code: string;
  category: string;
  description: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
  const [viewMode, setViewMode] = useState('overview');

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('income_records').select('id, month, year, income_type, nomenclature_code, total_amount, description').eq('user_id', user.id),
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
  const filtered = useMemo(() => records.filter(r => String(r.year) === selectedYear), [records, selectedYear]);

  const totalIncome = filtered.reduce((s, r) => s + r.total_amount, 0);
  const ambulatoryTotal = filtered.filter(r => r.income_type === 'ambulatory').reduce((s, r) => s + r.total_amount, 0);
  const hospitalizedTotal = filtered.filter(r => r.income_type === 'hospitalized').reduce((s, r) => s + r.total_amount, 0);

  const monthlyData = useMemo(() => {
    return MONTHS.map((name, idx) => {
      const monthRecords = filtered.filter(r => r.month === idx + 1);
      return {
        month: name,
        ambulatory: monthRecords.filter(r => r.income_type === 'ambulatory').reduce((s, r) => s + r.total_amount, 0),
        hospitalized: monthRecords.filter(r => r.income_type === 'hospitalized').reduce((s, r) => s + r.total_amount, 0),
      };
    });
  }, [filtered]);

  const cumulativeData = useMemo(() => {
    let cumAmbulatory = 0;
    let cumHospitalized = 0;
    return MONTHS.map((name, idx) => {
      const monthRecords = filtered.filter(r => r.month === idx + 1);
      cumAmbulatory += monthRecords.filter(r => r.income_type === 'ambulatory').reduce((s, r) => s + r.total_amount, 0);
      cumHospitalized += monthRecords.filter(r => r.income_type === 'hospitalized').reduce((s, r) => s + r.total_amount, 0);
      return { month: name, cumulative: cumAmbulatory + cumHospitalized, ambulatory: cumAmbulatory, hospitalized: cumHospitalized };
    });
  }, [filtered]);

  const nomenclatureData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => { map[r.nomenclature_code] = (map[r.nomenclature_code] || 0) + r.total_amount; });
    return Object.entries(map).map(([code, amount]) => ({
      code,
      label: codeToLabel[code] || code,
      amount,
    })).sort((a, b) => b.amount - a.amount).slice(0, 10);
  }, [filtered, codeToLabel]);

  // Category-based data
  const categories = useMemo(() => [...new Set(nomenclatureCodes.map(n => n.category))], [nomenclatureCodes]);

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => {
      const cat = codeToCategory[r.nomenclature_code] || 'uncategorized';
      map[cat] = (map[cat] || 0) + r.total_amount;
    });
    return Object.entries(map).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  }, [filtered, codeToCategory]);

  const monthlyCategoryData = useMemo(() => {
    const cats = categoryTotals.map(c => c.category);
    return MONTHS.map((name, idx) => {
      const monthRecords = filtered.filter(r => r.month === idx + 1);
      const entry: Record<string, any> = { month: name };
      cats.forEach(cat => {
        entry[cat] = monthRecords
          .filter(r => (codeToCategory[r.nomenclature_code] || 'uncategorized') === cat)
          .reduce((s, r) => s + r.total_amount, 0);
      });
      return entry;
    });
  }, [filtered, categoryTotals, codeToCategory]);

  const pieData = [
    { name: 'Ambulatory', value: ambulatoryTotal },
    { name: 'Hospitalized', value: hospitalizedTotal },
  ].filter(d => d.value > 0);

  const PIE_COLORS = ['hsl(174, 50%, 40%)', 'hsl(210, 60%, 35%)'];
  const fmt = (val: number) => `€${val.toLocaleString('de-BE', { minimumFractionDigits: 2 })}`;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your income for {selectedYear}.</p>
        </div>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            {years.length === 0 && <SelectItem value={selectedYear}>{selectedYear}</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Income</p>
              <p className="text-2xl font-semibold">{fmt(totalIncome)}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center">
              <Activity className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ambulatory</p>
              <p className="text-2xl font-semibold">{fmt(ambulatoryTotal)}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Hospitalized</p>
              <p className="text-2xl font-semibold">{fmt(hospitalizedTotal)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* View Mode Tabs */}
      <Tabs value={viewMode} onValueChange={setViewMode}>
        <TabsList>
          <TabsTrigger value="overview">By Income Type</TabsTrigger>
          <TabsTrigger value="category">By Category</TabsTrigger>
          <TabsTrigger value="nomenclature">By Nomenclature</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-base">Monthly Income by Type</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                    <Tooltip formatter={(val: number) => fmt(val)} />
                    <Legend />
                    <Bar dataKey="ambulatory" name="Ambulatory" fill="hsl(174, 50%, 40%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="hospitalized" name="Hospitalized" fill="hsl(210, 60%, 35%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-base">Income Distribution</CardTitle></CardHeader>
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
              <CardHeader><CardTitle className="text-base">Cumulative Income</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={cumulativeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                    <Tooltip formatter={(val: number) => fmt(val)} />
                    <Legend />
                    <Line type="monotone" dataKey="cumulative" name="Total" stroke="hsl(210, 60%, 25%)" strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="ambulatory" name="Ambulatory" stroke="hsl(174, 50%, 40%)" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                    <Line type="monotone" dataKey="hospitalized" name="Hospitalized" stroke="hsl(210, 60%, 35%)" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Category Tab */}
        <TabsContent value="category" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-base">Income by Category</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={categoryTotals} cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={3} dataKey="amount" nameKey="category" label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}>
                      {categoryTotals.map((_, idx) => <Cell key={idx} fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(val: number) => fmt(val)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-base">Category Totals</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={categoryTotals} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                    <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                    <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={100} stroke="hsl(220, 10%, 46%)" />
                    <Tooltip formatter={(val: number) => fmt(val)} />
                    <Bar dataKey="amount" name="Amount" radius={[0, 4, 4, 0]}>
                      {categoryTotals.map((_, idx) => <Cell key={idx} fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border/50 lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Monthly Income by Category</CardTitle></CardHeader>
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

        {/* Nomenclature Tab */}
        <TabsContent value="nomenclature" className="space-y-6 mt-4">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-base">Top Nomenclature Codes</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={nomenclatureData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                  <YAxis type="category" dataKey="code" tick={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} width={90} stroke="hsl(220, 10%, 46%)" />
                  <Tooltip formatter={(val: number) => fmt(val)} />
                  <Bar dataKey="amount" name="Amount" fill="hsl(174, 50%, 40%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}