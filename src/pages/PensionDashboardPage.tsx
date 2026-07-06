import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useDataVersion } from '@/hooks/useDataVersion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, TrendingUp, TrendingDown, Briefcase, Shield } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, ComposedChart } from 'recharts';
import { SIMPLE_CATEGORIES, IPT_CONFIG, type PensionCategory } from '@/lib/pensionCategories';

interface SimpleRow {
  id: string; snapshot_date: string; year: number;
  pensioenreserve: number; overlijdensdekking: number; jaarpremie: number;
}
interface IptRow {
  id: string; snapshot_date: string; year: number;
  beginkapitaal: number; eindkapitaal: number; opgebouwde_reserve: number;
  jaarpremie: number; overlijdenskapitaal: number; gewaarborgd_rendement: number;
  winst_uit_beleggingen: number; inkomende_bewegingen: number; uitgaande_bewegingen: number;
  kosten_taksen: number; kosten_overlijden: number;
}

const fmt = (v: number) => `€${(v || 0).toLocaleString('nl-BE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtFull = (v: number) => `€${(v || 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PensionDashboardPage() {
  const { user } = useAuth();
  const version = useDataVersion();
  const [iptRecords, setIptRecords] = useState<IptRow[]>([]);
  const [simpleData, setSimpleData] = useState<Record<string, SimpleRow[]>>({ vapz: [], vapz_riziv: [], pensioensparen: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [iptRes, ...simple] = await Promise.all([
        supabase.from('pension_ipt_records').select('*').eq('user_id', user.id).order('snapshot_date', { ascending: true }),
        ...SIMPLE_CATEGORIES.map(c => (supabase as any).from(c.table).select('*').eq('user_id', user.id).order('snapshot_date', { ascending: true })),
      ]);
      setIptRecords((iptRes.data as IptRow[]) || []);
      const next: Record<string, SimpleRow[]> = { vapz: [], vapz_riziv: [], pensioensparen: [] };
      SIMPLE_CATEGORIES.forEach((c, i) => { next[c.key] = (simple[i].data as SimpleRow[]) || []; });
      setSimpleData(next);
      setLoading(false);
    })();
  }, [user, version]);

  const { catTotals, iptLatest, iptYearly, iptStats, evolution } = useMemo(() => {
    const cats: { key: PensionCategory; rows: (SimpleRow | IptRow)[] }[] = [
      { key: 'ipt', rows: iptRecords },
      ...SIMPLE_CATEGORIES.map(c => ({ key: c.key as PensionCategory, rows: simpleData[c.key] as (SimpleRow | IptRow)[] })),
    ];
    const getReserve = (r: any) => 'opgebouwde_reserve' in r ? (r.opgebouwde_reserve || 0) : (r.pensioenreserve || 0);
    const getDekking = (r: any) => 'overlijdenskapitaal' in r ? (r.overlijdenskapitaal || 0) : (r.overlijdensdekking || 0);
    const policyKey = (r: any) => (r.note || '__default__') as string;

    // Per categorie: sommeer laatste snapshot per polis (note).
    const catTotals: Record<string, { reserve: number; prevReserve: number; dekking: number; policyCount: number }> = {};
    for (const c of cats) {
      const sorted = [...c.rows].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
      const byPolicy = new Map<string, any[]>();
      for (const r of sorted) {
        const k = policyKey(r);
        const arr = byPolicy.get(k) || [];
        arr.push(r); byPolicy.set(k, arr);
      }
      let reserve = 0, dekking = 0, prevReserve = 0;
      for (const arr of byPolicy.values()) {
        const latest = arr[arr.length - 1];
        const prev = arr.length >= 2 ? arr[arr.length - 2] : null;
        reserve += getReserve(latest);
        dekking += getDekking(latest);
        if (prev) prevReserve += getReserve(prev);
      }
      catTotals[c.key] = { reserve, prevReserve, dekking, policyCount: byPolicy.size };
    }

    const iptSorted = [...iptRecords].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    const iptLatest = iptSorted[iptSorted.length - 1] || null;

    const byYear = new Map<number, IptRow>();
    for (const r of iptRecords) byYear.set(r.year, r);
    const years = [...byYear.keys()].sort((a, b) => a - b);
    const iptYearly = years.map((y, idx) => {
      const cur = byYear.get(y)!;
      const prev = idx > 0 ? byYear.get(years[idx - 1]) : undefined;
      const basis = cur.beginkapitaal > 0 ? cur.beginkapitaal : (prev?.eindkapitaal || prev?.opgebouwde_reserve || 0);
      const rendement = basis > 0 ? (cur.winst_uit_beleggingen / basis) * 100 : null;
      return { year: y, label: String(y), Reserve: cur.eindkapitaal || cur.opgebouwde_reserve, Winst: cur.winst_uit_beleggingen, Overlijdenskapitaal: cur.overlijdenskapitaal, Rendement: rendement };
    });
    const totalWinst = iptYearly.reduce((a, y) => a + (y.Winst || 0), 0);
    const rends = iptYearly.map(y => y.Rendement).filter((v): v is number => v !== null);
    const avgRend = rends.length ? rends.reduce((a, b) => a + b, 0) / rends.length : null;

    // Evolutie: per jaar de som van (laatste snapshot per polis t/m dat jaar) per categorie.
    const allYears = new Set<number>();
    cats.forEach(c => c.rows.forEach(r => allYears.add(r.year)));
    const evolution = [...allYears].sort((a, b) => a - b).map(y => {
      const row: any = { year: String(y) };
      let totaal = 0;
      cats.forEach(c => {
        const sorted = [...c.rows].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
        const latestPerPolicy = new Map<string, number>();
        for (const r of sorted) {
          if (r.year <= y) latestPerPolicy.set(policyKey(r), getReserve(r));
        }
        const v = [...latestPerPolicy.values()].reduce((s, x) => s + x, 0);
        row[c.key] = v;
        totaal += v;
      });
      row.Totaal = totaal;
      return row;
    });

    return { catTotals, iptLatest, iptYearly, iptStats: { totalWinst, avgRend }, evolution };
  }, [iptRecords, simpleData]);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const cats: { key: PensionCategory; label: string; icon: any }[] = [
    { key: 'ipt', label: IPT_CONFIG.label, icon: IPT_CONFIG.icon },
    ...SIMPLE_CATEGORIES.map(c => ({ key: c.key as PensionCategory, label: c.label, icon: c.icon })),
  ];

  const totalLatest = cats.reduce((s, c) => s + (catTotals[c.key]?.reserve || 0), 0);
  const totalPrev = cats.reduce((s, c) => s + (catTotals[c.key]?.prevReserve || 0), 0);
  const diff = totalLatest - totalPrev;
  const diffPct = totalPrev > 0 ? (diff / totalPrev) * 100 : 0;
  const totalDekking = cats.reduce((s, c) => s + (catTotals[c.key]?.dekking || 0), 0);

  const anyData = cats.some(c => (catTotals[c.key]?.policyCount || 0) > 0);
  if (!anyData) {
    return (
      <div className="max-w-4xl mx-auto animate-fade-in">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">Pensioendashboard</h1>
        <Card className="border-border/50"><CardContent className="py-12 text-center text-muted-foreground">Nog geen pensioendata. Upload je eerste PDF om dit dashboard te vullen.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pensioendashboard</h1>
        <p className="text-muted-foreground mt-1">IPT + VAPZ + VAPZ RIZIV + Pensioensparen in detail.</p>
      </div>

      <Card className="border-border/50 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="pt-6">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Totale opgebouwde pensioenreserve</p>
              <p className="text-4xl font-bold tracking-tight mt-1">{fmtFull(totalLatest)}</p>
            </div>
            {totalPrev > 0 && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${diff >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                {diff >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                <div className="text-sm">
                  <div className="font-semibold">{diff >= 0 ? '+' : ''}{fmt(diff)}</div>
                  <div className="text-xs opacity-80">{diffPct.toFixed(1)}% vs vorige snapshot</div>
                </div>
              </div>
            )}
            {totalDekking > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary">
                <Shield className="h-4 w-4" />
                <div className="text-sm">
                  <div className="font-semibold">{fmt(totalDekking)}</div>
                  <div className="text-xs opacity-80">Totale overlijdensdekking</div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cats.map(c => {
          const t = catTotals[c.key] || { reserve: 0, prevReserve: 0, dekking: 0, policyCount: 0 };
          const d = t.reserve - t.prevReserve;
          return (
            <Card key={c.key} className="border-border/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-xs"><c.icon className="h-4 w-4" />{c.label}</div>
                <p className="text-2xl font-semibold mt-2">{fmt(t.reserve)}</p>
                {t.prevReserve > 0 && <p className={`text-xs mt-1 ${d >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{d >= 0 ? '+' : ''}{fmt(d)} vs vorig</p>}
                {t.policyCount > 1 && <p className="text-[10px] text-muted-foreground mt-0.5">{t.policyCount} polissen</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {evolution.length >= 2 && (
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-base">Evolutie reserves per categorie</CardTitle></CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolution}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="year" className="text-xs" />
                  <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} className="text-xs" />
                  <Tooltip formatter={(v: number) => fmtFull(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Legend />
                  <Line type="monotone" dataKey="ipt" name="IPT" stroke="hsl(var(--primary))" strokeWidth={2} />
                  <Line type="monotone" dataKey="vapz" name="VAPZ" stroke="hsl(var(--secondary))" strokeWidth={2} />
                  <Line type="monotone" dataKey="vapz_riziv" name="VAPZ RIZIV" stroke="hsl(var(--accent))" strokeWidth={2} />
                  <Line type="monotone" dataKey="pensioensparen" name="Pensioensparen" stroke="#10b981" strokeWidth={2} />
                  <Line type="monotone" dataKey="Totaal" stroke="#0f172a" strokeWidth={2.5} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {iptYearly.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-border/50"><CardContent className="pt-6">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" /> IPT-reserve</div>
              <p className="text-2xl font-semibold mt-2">{fmt(latestByCat.ipt?.opgebouwde_reserve || 0)}</p>
            </CardContent></Card>
            <Card className="border-border/50"><CardContent className="pt-6">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> IPT-overlijdensdekking</div>
              <p className="text-2xl font-semibold mt-2">{fmt(latestByCat.ipt?.overlijdenskapitaal || 0)}</p>
            </CardContent></Card>
            <Card className="border-border/50"><CardContent className="pt-6">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Totale winst beleggingen</div>
              <p className="text-2xl font-semibold mt-2 text-emerald-600">{fmt(iptStats.totalWinst)}</p>
            </CardContent></Card>
            <Card className="border-border/50"><CardContent className="pt-6">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Gemiddeld rendement IPT</div>
              <p className="text-2xl font-semibold mt-2">{iptStats.avgRend !== null ? `${iptStats.avgRend.toFixed(2)}%` : '—'}</p>
            </CardContent></Card>
          </div>

          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" /> IPT — winst, rendement & overlijdensdekking per jaar</CardTitle></CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={iptYearly}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" className="text-xs" />
                    <YAxis yAxisId="left" tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} className="text-xs" />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v.toFixed(1)}%`} className="text-xs" />
                    <Tooltip formatter={(v: number, name: string) => name === 'Rendement' ? `${(v ?? 0).toFixed(2)}%` : fmtFull(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="Winst" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    <Line yAxisId="left" type="monotone" dataKey="Overlijdenskapitaal" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                    <Line yAxisId="right" type="monotone" dataKey="Rendement" stroke="hsl(var(--accent))" strokeWidth={2.5} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
