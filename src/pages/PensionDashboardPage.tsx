import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useDataVersion } from '@/hooks/useDataVersion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PiggyBank, Shield, Wallet, Stethoscope, TrendingUp, TrendingDown, Loader2, Briefcase } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, ComposedChart } from 'recharts';

interface PensionRecord {
  id: string;
  snapshot_date: string;
  year: number;
  pensioenreserve: number;
  overlijdensdekking: number;
  pensioenreserve_vapz: number;
  vap_riziv_toelage: number;
}
interface IptRecord {
  id: string;
  snapshot_date: string;
  year: number;
  beginkapitaal: number;
  eindkapitaal: number;
  opgebouwde_reserve: number;
  jaarpremie: number;
  overlijdenskapitaal: number;
  gewaarborgd_rendement: number;
  winst_uit_beleggingen: number;
  inkomende_bewegingen: number;
  uitgaande_bewegingen: number;
  kosten_taksen: number;
  kosten_overlijden: number;
}


const fmt = (v: number) => `€${(v || 0).toLocaleString('nl-BE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtFull = (v: number) => `€${(v || 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PensionDashboardPage() {
  const { user } = useAuth();
  const version = useDataVersion();
  const [records, setRecords] = useState<PensionRecord[]>([]);
  const [iptRecords, setIptRecords] = useState<IptRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data }, { data: iptData }] = await Promise.all([
        supabase.from('pension_records').select('*').order('snapshot_date', { ascending: true }),
        supabase.from('pension_ipt_records').select('*').order('snapshot_date', { ascending: true }),
      ]);
      setRecords((data as PensionRecord[]) || []);
      setIptRecords((iptData as IptRecord[]) || []);
      setLoading(false);
    })();
  }, [user, version]);

  const { latest, previous, chartData, latestIpt, previousIpt, iptYearly, iptStats } = useMemo(() => {
    const sorted = [...records].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    const sortedIpt = [...iptRecords].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    const byYear = new Map<number, IptRecord>();
    for (const r of sortedIpt) byYear.set(r.year, r);
    const years = [...byYear.keys()].sort((a, b) => a - b);
    const iptYearly = years.map((y, idx) => {
      const cur = byYear.get(y)!;
      const prevYear = idx > 0 ? byYear.get(years[idx - 1]) : undefined;
      const basis = cur.beginkapitaal > 0 ? cur.beginkapitaal : (prevYear?.eindkapitaal || prevYear?.opgebouwde_reserve || 0);
      const rendement = basis > 0 ? (cur.winst_uit_beleggingen / basis) * 100 : null;
      return {
        year: y,
        label: String(y),
        Reserve: cur.eindkapitaal || cur.opgebouwde_reserve,
        Winst: cur.winst_uit_beleggingen,
        Overlijdenskapitaal: cur.overlijdenskapitaal,
        Rendement: rendement,
        NettoStortingen: (cur.inkomende_bewegingen || 0) + (cur.uitgaande_bewegingen || 0),
      };
    });
    const totalWinst = iptYearly.reduce((acc, y) => acc + (y.Winst || 0), 0);
    const rendValues = iptYearly.map(y => y.Rendement).filter((v): v is number => v !== null);
    const avgRend = rendValues.length ? rendValues.reduce((a, b) => a + b, 0) / rendValues.length : null;
    return {
      latest: sorted[sorted.length - 1] || null,
      previous: sorted[sorted.length - 2] || null,
      latestIpt: sortedIpt[sortedIpt.length - 1] || null,
      previousIpt: sortedIpt[sortedIpt.length - 2] || null,
      chartData: sorted.map(r => ({
        date: new Date(r.snapshot_date).toLocaleDateString('nl-BE', { year: 'numeric', month: 'short' }),
        Pensioenreserve: r.pensioenreserve,
        Overlijdensdekking: r.overlijdensdekking,
        VAPZ: r.pensioenreserve_vapz,
        'VAP RIZIV': r.vap_riziv_toelage,
      })),
      iptYearly,
      iptStats: { totalWinst, avgRend },
    };
  }, [records, iptRecords]);

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

  const tiles: Array<{ icon: any; label: string; value: number; prev?: number }> = [
    { icon: PiggyBank, label: 'Pensioenreserve', value: latest.pensioenreserve, prev: previous?.pensioenreserve },
    { icon: Shield, label: 'Overlijdensdekking', value: latest.overlijdensdekking, prev: previous?.overlijdensdekking },
    { icon: Wallet, label: 'VAPZ-reserve', value: latest.pensioenreserve_vapz, prev: previous?.pensioenreserve_vapz },
    { icon: Stethoscope, label: 'VAP RIZIV-toelage', value: latest.vap_riziv_toelage, prev: previous?.vap_riziv_toelage },
  ];
  if (latestIpt) {
    tiles.push({ icon: Briefcase, label: 'IPT-reserve', value: latestIpt.opgebouwde_reserve, prev: previousIpt?.opgebouwde_reserve });
  }

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

      {/* IPT stats */}
      {iptYearly.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" /> IPT-reserve</div>
              <p className="text-2xl font-semibold mt-2">{fmt(latestIpt?.opgebouwde_reserve || 0)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Totale winst beleggingen</div>
              <p className="text-2xl font-semibold mt-2 text-emerald-600">{fmt(iptStats.totalWinst)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Gemiddeld rendement</div>
              <p className="text-2xl font-semibold mt-2">{iptStats.avgRend !== null ? `${iptStats.avgRend.toFixed(2)}%` : '—'}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* IPT yearly winst + rendement */}
      {iptYearly.length >= 1 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" /> IPT — winst & rendement per jaar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={iptYearly}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" className="text-xs" />
                  <YAxis yAxisId="left" tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} className="text-xs" />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v.toFixed(1)}%`} className="text-xs" />
                  <Tooltip
                    formatter={(v: number, name: string) => name === 'Rendement' ? `${(v ?? 0).toFixed(2)}%` : fmtFull(v)}
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="Winst" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="Rendement" stroke="hsl(var(--accent))" strokeWidth={2.5} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* IPT reserve evolutie */}
      {iptYearly.length >= 2 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" /> Evolutie IPT-reserve</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={iptYearly}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" className="text-xs" />
                  <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} className="text-xs" />
                  <Tooltip formatter={(v: number) => fmtFull(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Legend />
                  <Line type="monotone" dataKey="Reserve" stroke="hsl(var(--primary))" strokeWidth={2} />
                  <Line type="monotone" dataKey="Overlijdenskapitaal" stroke="hsl(var(--accent))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
