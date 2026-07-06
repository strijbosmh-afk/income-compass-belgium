import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, FileText, Loader2, PiggyBank, Shield, TrendingDown, TrendingUp, Upload } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useDataVersion } from '@/hooks/useDataVersion';
import { supabase } from '@/integrations/supabase/client';
import { SIMPLE_CATEGORIES, IPT_CONFIG, type PensionCategory } from '@/lib/pensionCategories';

interface SnapshotRow {
  id: string;
  snapshot_date: string;
  year: number;
  pensioenreserve: number;
  overlijdensdekking: number;
  jaarpremie: number;
}

type CategoryData = { key: PensionCategory; label: string; icon: any; description: string; rows: SnapshotRow[] };

const fmt = (v: number) => `€${(v || 0).toLocaleString('nl-BE', { maximumFractionDigits: 0 })}`;
const fmtDate = (v?: string) => v ? new Date(v).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Geen snapshot';

export default function PensionOverviewPage() {
  const { user } = useAuth();
  const version = useDataVersion();
  const [data, setData] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const queries = await Promise.all([
        supabase.from('pension_ipt_records').select('id, snapshot_date, year, opgebouwde_reserve, overlijdenskapitaal, jaarpremie').eq('user_id', user.id).order('snapshot_date', { ascending: true }),
        ...SIMPLE_CATEGORIES.map(c => (supabase as any).from(c.table).select('id, snapshot_date, year, pensioenreserve, overlijdensdekking, jaarpremie').eq('user_id', user.id).order('snapshot_date', { ascending: true })),
      ]);
      const iptRows: SnapshotRow[] = ((queries[0].data as any[]) || []).map(r => ({
        id: r.id, snapshot_date: r.snapshot_date, year: r.year,
        pensioenreserve: Number(r.opgebouwde_reserve) || 0,
        overlijdensdekking: Number(r.overlijdenskapitaal) || 0,
        jaarpremie: Number(r.jaarpremie) || 0,
      }));
      const cats: CategoryData[] = [
        { key: 'ipt', label: IPT_CONFIG.label, icon: IPT_CONFIG.icon, description: IPT_CONFIG.description, rows: iptRows },
        ...SIMPLE_CATEGORIES.map((c, i) => ({
          key: c.key as PensionCategory, label: c.label, icon: c.icon, description: c.description,
          rows: (((queries[i + 1].data as any[]) || []).map(r => ({
            id: r.id, snapshot_date: r.snapshot_date, year: r.year,
            pensioenreserve: Number(r.pensioenreserve) || 0,
            overlijdensdekking: Number(r.overlijdensdekking) || 0,
            jaarpremie: Number(r.jaarpremie) || 0,
          }))) as SnapshotRow[],
        })),
      ];
      setData(cats);
      setLoading(false);
    })();
  }, [user, version]);

  const overview = useMemo(() => {
    const perCat = data.map(c => {
      const sorted = [...c.rows].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
      return { ...c, latest: sorted[sorted.length - 1] || null, previous: sorted[sorted.length - 2] || null, sorted };
    });
    const totalReserve = perCat.reduce((s, c) => s + (c.latest?.pensioenreserve || 0), 0);
    const previousTotalReserve = perCat.reduce((s, c) => s + (c.previous?.pensioenreserve || 0), 0);
    const totalDekking = perCat.reduce((s, c) => s + (c.latest?.overlijdensdekking || 0), 0);

    const years = new Map<number, Record<string, number>>();
    for (const c of perCat) {
      const byYear = new Map<number, number>();
      for (const r of c.sorted) byYear.set(r.year, r.pensioenreserve);
      for (const [y, v] of byYear.entries()) {
        const row = years.get(y) || { year: y };
        row[c.key] = v;
        years.set(y, row);
      }
    }
    const chartData = [...years.entries()].sort((a, b) => a[0] - b[0]).map(([y, row]) => {
      const totaal = perCat.reduce((s, c) => s + (Number(row[c.key]) || 0), 0);
      return { year: String(y), totaal, ...row };
    });

    const latestDate = perCat.map(c => c.latest?.snapshot_date).filter(Boolean).sort().pop();
    const snapshotCount = perCat.reduce((s, c) => s + c.rows.length, 0);
    return { perCat, totalReserve, previousTotalReserve, totalDekking, chartData, latestDate, snapshotCount };
  }, [data]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const hasData = overview.snapshotCount > 0;
  const totalDelta = hasData && overview.previousTotalReserve > 0 ? overview.totalReserve - overview.previousTotalReserve : null;
  const totalDeltaPct = totalDelta !== null ? (totalDelta / overview.previousTotalReserve) * 100 : null;

  return (
    <div className="dashboard-shell mx-auto max-w-7xl space-y-4 animate-fade-in md:space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="hidden text-xs font-semibold uppercase tracking-[0.25em] text-secondary md:block">Pensioen cockpit</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Pensioenoverzicht</h1>
          <p className="mt-1 text-muted-foreground">IPT + VAPZ + VAPZ RIZIV + Pensioensparen samen in één rustig overzicht.</p>
        </div>
        <Button asChild size="sm">
          <Link to="/pensioen/upload"><Upload className="h-4 w-4" /> Pensioen uploaden</Link>
        </Button>
      </div>

      {!hasData ? (
        <Card className="data-card">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <PiggyBank className="h-10 w-10 text-muted-foreground" />
            <div>
              <h2 className="text-lg font-semibold">Nog geen pensioendata</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">Upload een IPT-, VAPZ-, VAPZ RIZIV- of pensioensparen-document om je pensioenreserve en dekking op te volgen.</p>
            </div>
            <Button asChild><Link to="/pensioen/upload"><Upload className="h-4 w-4" /> Uploaden</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="dashboard-hero">
            <div className="dashboard-hero-main pension-hero">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-primary-foreground/75">Totale pensioenreserve</p>
                  <p className="mt-2 text-4xl font-semibold tracking-tight text-primary-foreground md:text-5xl">{fmt(overview.totalReserve)}</p>
                  <p className="mt-2 text-sm text-primary-foreground/70">Laatste update: {fmtDate(overview.latestDate)}</p>
                </div>
                <div className="hidden rounded-2xl bg-white/10 p-3 text-primary-foreground shadow-inner md:block">
                  <PiggyBank className="h-7 w-7" />
                </div>
              </div>
              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {overview.perCat.map(c => (
                  <div key={c.key} className="dashboard-hero-pill">
                    <span>{c.label}</span>
                    <strong>{fmt(c.latest?.pensioenreserve || 0)}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="dashboard-hero-side">
              <div className="dashboard-insight-card">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Shield className="h-4 w-4 text-secondary" /> Overlijdensdekking (totaal)
                </div>
                <p className="mt-2 text-2xl font-semibold">{fmt(overview.totalDekking)}</p>
                <p className="text-xs text-muted-foreground">Alle categorieën samen</p>
              </div>
              <div className="dashboard-insight-card">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <FileText className="h-4 w-4 text-secondary" /> Snapshots
                </div>
                <p className="mt-2 text-2xl font-semibold">{overview.snapshotCount}</p>
                <p className="text-xs text-muted-foreground">Over {overview.perCat.filter(c => c.rows.length > 0).length} categorie(ën)</p>
              </div>
              <div className="dashboard-insight-card md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Evolutie sinds vorige snapshot</p>
                    <p className={`mt-1 text-2xl font-semibold ${totalDelta === null || totalDelta >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                      {totalDelta !== null ? `${totalDelta >= 0 ? '+' : ''}${fmt(totalDelta)}` : 'Nog geen vergelijking'}
                    </p>
                    <p className="text-xs text-muted-foreground">{totalDeltaPct !== null ? `${totalDeltaPct.toFixed(1)}% verschil` : 'Upload nog een snapshot voor trend'}</p>
                  </div>
                  {totalDelta !== null && (
                    <div className={`rounded-xl px-3 py-2 ${totalDelta >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                      {totalDelta >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {overview.perCat.map(c => {
              const delta = c.previous ? (c.latest?.pensioenreserve || 0) - c.previous.pensioenreserve : null;
              const pct = delta !== null && c.previous && c.previous.pensioenreserve > 0 ? (delta / c.previous.pensioenreserve) * 100 : null;
              const positive = (delta || 0) >= 0;
              return (
                <Card key={c.key} className="data-card transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <CardContent className="pt-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <c.icon className="h-4 w-4" /><span>{c.label}</span>
                        </div>
                        <div className="text-2xl font-semibold tracking-tight">{fmt(c.latest?.pensioenreserve || 0)}</div>
                      </div>
                      {delta !== null && (
                        <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${positive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                          {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          <span>{positive ? '+' : ''}{pct !== null ? `${pct.toFixed(1)}%` : fmt(delta)}</span>
                        </div>
                      )}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {c.rows.length === 0 ? 'Nog geen snapshot' : `${c.rows.length} snapshot${c.rows.length === 1 ? '' : 's'} · dekking ${fmt(c.latest?.overlijdensdekking || 0)}`}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {overview.chartData.length >= 2 && (
            <Card className="data-card">
              <CardHeader><CardTitle className="text-base">Evolutie totale pensioenwaarde</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={overview.chartData} margin={{ top: 8, right: 18, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="pension-total" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="year" className="text-xs" />
                      <YAxis tickFormatter={(v) => `€${(Number(v) / 1000).toFixed(0)}k`} className="text-xs" />
                      <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                      <Area type="monotone" dataKey="totaal" name="Totaal" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#pension-total)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Button asChild variant="outline" className="polished-action-card">
          <Link to="/pensioen/overzicht">
            <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Alle snapshots</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="polished-action-card">
          <Link to="/pensioen/dashboard">
            <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Detailanalyse</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="polished-action-card">
          <Link to="/pensioen/upload">
            <span className="flex items-center gap-2"><Upload className="h-4 w-4" /> Nieuwe upload</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
