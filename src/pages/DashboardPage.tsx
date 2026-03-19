import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, TrendingUp, Activity, Building2, Stethoscope } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';

type IncomeEntry = {
  id: string;
  month: number;
  year: number;
  income_type: string;
  nomenclature_code: string;
  total_amount: number;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function DashboardPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<IncomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));

  useEffect(() => {
    if (!user) return;
    supabase.from('income_records').select('id, month, year, income_type, nomenclature_code, total_amount').eq('user_id', user.id)
      .then(({ data }) => { setRecords(data || []); setLoading(false); });
  }, [user]);

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
    let cumulative = 0;
    return MONTHS.map((name, idx) => {
      const monthTotal = filtered.filter(r => r.month === idx + 1).reduce((s, r) => s + r.total_amount, 0);
      cumulative += monthTotal;
      return { month: name, cumulative };
    });
  }, [filtered]);

  const nomenclatureData = useMemo(() => {
    const map: Record<string, number> = {} as any;
    filtered.forEach(r => { map[r.nomenclature_code] = (map[r.nomenclature_code] || 0) + r.total_amount; });
    return Object.entries(map).map(([code, amount]) => ({ code, amount: amount as number })).sort((a, b) => b.amount - a.amount).slice(0, 8);
  }, [filtered]);

  const pieData = [
    { name: 'Ambulatory', value: ambulatoryTotal },
    { name: 'Hospitalized', value: hospitalizedTotal },
  ].filter(d => d.value > 0);

  const PIE_COLORS = ['hsl(174, 50%, 40%)', 'hsl(210, 60%, 35%)'];

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
              <p className="text-2xl font-semibold">€{totalIncome.toLocaleString('de-BE', { minimumFractionDigits: 2 })}</p>
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
              <p className="text-2xl font-semibold">€{ambulatoryTotal.toLocaleString('de-BE', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Hospitalized</p>
              <p className="text-2xl font-semibold">€{hospitalizedTotal.toLocaleString('de-BE', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-base">Monthly Income by Type</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                <Tooltip formatter={(val: number) => `€${val.toFixed(2)}`} />
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
                <Tooltip formatter={(val: number) => `€${val.toFixed(2)}`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-base">Cumulative Income</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={cumulativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                <Tooltip formatter={(val: number) => `€${val.toFixed(2)}`} />
                <Line type="monotone" dataKey="cumulative" name="Cumulative" stroke="hsl(210, 60%, 25%)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-base">Top Nomenclature Codes</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={nomenclatureData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                <YAxis type="category" dataKey="code" tick={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} width={80} stroke="hsl(220, 10%, 46%)" />
                <Tooltip formatter={(val: number) => `€${val.toFixed(2)}`} />
                <Bar dataKey="amount" name="Amount" fill="hsl(174, 50%, 40%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
