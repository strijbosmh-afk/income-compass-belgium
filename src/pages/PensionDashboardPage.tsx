import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PiggyBank, Shield, Wallet, Stethoscope, TrendingUp, TrendingDown, Loader2, Briefcase } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts';

interface PensionRecord {
  id: string;
  snapshot_date: string;
  year: number;
  pensioenreserve: number;
  overlijdensdekking: number;
  pensioenreserve_vapz: number;
  vap_riziv_toelage: number;
}

const fmt = (v: number) => `€${(v || 0).toLocaleString('nl-BE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtFull = (v: number) => `€${(v || 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PensionDashboardPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<PensionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('pension_records')
        .select('*')
        .order('snapshot_date', { ascending: true });
      setRecords((data as PensionRecord[]) || []);
      setLoading(false);
    })();
  }, [user]);

  const { latest, previous, chartData } = useMemo(() => {
    const sorted = [...records].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    return {
      latest: sorted[sorted.length - 1] || null,
      previous: sorted[sorted.length - 2] || null,
      chartData: sorted.map(r => ({
        date: new Date(r.snapshot_date).toLocaleDateString('nl-BE', { year: 'numeric', month: 'short' }),
        Pensioenreserve: r.pensioenreserve,
        Overlijdensdekking: r.overlijdensdekking,
        VAPZ: r.pensioenreserve_vapz,
        'VAP RIZIV': r.vap_riziv_toelage,
      })),
    };
  }, [records]);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  if (!latest) {
    return (
      <div className="max-w-4xl mx-auto animate-fade-in">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">Pensioen Dashboard</h1>
        <Card className="border-border/50">
          <CardContent className="py-12 text-center text-muted-foreground">
            Nog geen pensioendata. Upload je eerste jaarlijkse PDF om dit dashboard te vullen.
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalLatest = latest.pensioenreserve;
  const totalPrev = previous ? previous.pensioenreserve : 0;
  const diff = totalLatest - totalPrev;
  const diffPct = totalPrev > 0 ? (diff / totalPrev) * 100 : 0;

  const tiles = [
    { icon: PiggyBank, label: 'Pensioenreserve', value: latest.pensioenreserve, prev: previous?.pensioenreserve },
    { icon: Shield, label: 'Overlijdensdekking', value: latest.overlijdensdekking, prev: previous?.overlijdensdekking },
    { icon: Wallet, label: 'VAPZ-reserve', value: latest.pensioenreserve_vapz, prev: previous?.pensioenreserve_vapz },
    { icon: Stethoscope, label: 'VAP RIZIV-toelage', value: latest.vap_riziv_toelage, prev: previous?.vap_riziv_toelage },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pensioen Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Laatste snapshot: {new Date(latest.snapshot_date).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Hero totaal */}
      <Card className="border-border/50 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="pt-6">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Totale opgebouwde pensioenreserve</p>
              <p className="text-4xl font-bold tracking-tight mt-1">{fmtFull(totalLatest)}</p>
            </div>
            {previous && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${diff >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                {diff >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                <div className="text-sm">
                  <div className="font-semibold">{diff >= 0 ? '+' : ''}{fmt(diff)}</div>
                  <div className="text-xs opacity-80">{diffPct.toFixed(1)}% vs vorige snapshot</div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map(t => {
          const d = t.prev !== undefined ? t.value - (t.prev || 0) : 0;
          return (
            <Card key={t.label} className="border-border/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-xs"><t.icon className="h-4 w-4" />{t.label}</div>
                <p className="text-2xl font-semibold mt-2">{fmt(t.value)}</p>
                {t.prev !== undefined && (
                  <p className={`text-xs mt-1 ${d >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {d >= 0 ? '+' : ''}{fmt(d)} vs vorig
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Evolutie chart */}
      {chartData.length >= 2 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Evolutie reserves over de jaren</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} className="text-xs" />
                  <Tooltip formatter={(v: number) => fmtFull(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Legend />
                  <Line type="monotone" dataKey="Pensioenreserve" stroke="hsl(var(--primary))" strokeWidth={2} />
                  <Line type="monotone" dataKey="VAPZ" stroke="hsl(var(--secondary))" strokeWidth={2} />
                  <Line type="monotone" dataKey="VAP RIZIV" stroke="hsl(var(--accent))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overlijdensdekking chart */}
      {chartData.length >= 2 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Overlijdensdekking</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} className="text-xs" />
                  <Tooltip formatter={(v: number) => fmtFull(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Bar dataKey="Overlijdensdekking" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
