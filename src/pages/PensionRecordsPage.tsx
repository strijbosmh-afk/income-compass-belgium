import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Trash2, FileText, Loader2, PiggyBank, Shield, Wallet, Stethoscope, TrendingUp, TrendingDown, Calendar, Briefcase, ChevronDown, Plus, UploadCloud } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useDataVersion } from '@/hooks/useDataVersion';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface PensionRecord {
  id: string;
  snapshot_date: string;
  year: number;
  pensioenreserve: number;
  overlijdensdekking: number;
  pensioenreserve_vapz: number;
  vap_riziv_toelage: number;
  source_pdf_url: string | null;
  note: string | null;
}

const fmt = (v: number) => `€${(v || 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtShort = (v: number) => `€${(v || 0).toLocaleString('nl-BE', { notation: 'compact', maximumFractionDigits: 1 })}`;
const fmtDate = (date: string) => new Date(date).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' });

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
  source_pdf_url: string | null;
  note: string | null;
}

export default function PensionRecordsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const version = useDataVersion();
  const [records, setRecords] = useState<PensionRecord[]>([]);
  const [iptRecords, setIptRecords] = useState<IptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeProgress, setReanalyzeProgress] = useState<{ done: number; total: number; current?: string }>({ done: 0, total: 0 });

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data, error }, { data: iptData, error: iptErr }] = await Promise.all([
      supabase.from('pension_records').select('*').eq('user_id', user.id).order('snapshot_date', { ascending: false }),
      supabase.from('pension_ipt_records').select('*').eq('user_id', user.id).order('snapshot_date', { ascending: false }),
    ]);
    if (error) toast({ title: 'Fout', description: error.message, variant: 'destructive' });
    else setRecords((data as PensionRecord[]) || []);
    if (iptErr) toast({ title: 'Fout (IPT)', description: iptErr.message, variant: 'destructive' });
    else setIptRecords((iptData as IptRecord[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user, version]);

  const handleDelete = async (id: string, pdfPath: string | null) => {
    if (!confirm('Deze snapshot definitief verwijderen?')) return;
    const { error } = await supabase.from('pension_records').delete().eq('id', id);
    if (error) { toast({ title: 'Fout', description: error.message, variant: 'destructive' }); return; }
    if (pdfPath) await supabase.storage.from('pension-pdfs').remove([pdfPath]);
    toast({ title: 'Verwijderd' });
    load();
  };

  const handleDeleteIpt = async (id: string, pdfPath: string | null) => {
    if (!confirm('Deze IPT-snapshot definitief verwijderen?')) return;
    const { error } = await supabase.from('pension_ipt_records').delete().eq('id', id);
    if (error) { toast({ title: 'Fout', description: error.message, variant: 'destructive' }); return; }
    if (pdfPath) await supabase.storage.from('pension-ipt-pdfs').remove([pdfPath]);
    toast({ title: 'Verwijderd' });
    load();
  };

  const openIptPdf = async (path: string) => {
    const { data } = await supabase.storage.from('pension-ipt-pdfs').createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const reanalyzeAllIpt = async () => {
    const targets = iptRecords.filter(r => r.source_pdf_url);
    if (targets.length === 0) {
      toast({ title: 'Geen PDFs', description: 'Geen IPT-records met opgeslagen PDF gevonden.', variant: 'destructive' });
      return;
    }
    if (!confirm(`${targets.length} IPT-document(en) opnieuw analyseren en overschrijven?`)) return;
    setReanalyzing(true);
    setReanalyzeProgress({ done: 0, total: targets.length });
    let ok = 0; let fail = 0;
    for (const rec of targets) {
      setReanalyzeProgress({ done: ok + fail, total: targets.length, current: rec.source_pdf_url || '' });
      try {
        const { data: blob, error: dlErr } = await supabase.storage.from('pension-ipt-pdfs').download(rec.source_pdf_url!);
        if (dlErr || !blob) throw dlErr || new Error('Download mislukt');
        const base64 = await blobToBase64(blob);
        const { data, error } = await supabase.functions.invoke('extract-pension-ipt', {
          body: { pdf: base64, mimeType: 'application/pdf' },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const { error: upErr } = await supabase.from('pension_ipt_records').update({
          snapshot_date: data.snapshot_date || rec.snapshot_date,
          year: data.year || rec.year,
          beginkapitaal: Number(data.beginkapitaal) || 0,
          eindkapitaal: Number(data.eindkapitaal) || 0,
          opgebouwde_reserve: Number(data.opgebouwde_reserve) || 0,
          jaarpremie: Number(data.jaarpremie) || 0,
          overlijdenskapitaal: Number(data.overlijdenskapitaal) || 0,
          gewaarborgd_rendement: Number(data.gewaarborgd_rendement) || 0,
          winst_uit_beleggingen: Number(data.winst_uit_beleggingen) || 0,
          inkomende_bewegingen: Number(data.inkomende_bewegingen) || 0,
          uitgaande_bewegingen: Number(data.uitgaande_bewegingen) || 0,
          kosten_taksen: Number(data.kosten_taksen) || 0,
          kosten_overlijden: Number(data.kosten_overlijden) || 0,
        }).eq('id', rec.id);
        if (upErr) throw upErr;
        ok++;
      } catch (err: any) {
        console.error('Reanalyze failed for', rec.id, err);
        fail++;
      }
    }
    setReanalyzing(false);
    setReanalyzeProgress({ done: ok + fail, total: targets.length });
    toast({ title: 'Heranalyse klaar', description: `${ok} bijgewerkt, ${fail} mislukt.` });
    await load();
  };


  const openPdf = async (path: string) => {
    const { data } = await supabase.storage.from('pension-pdfs').createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };
  const { sorted, tiles, chartData, sortedIpt, iptYearly, iptStats } = useMemo(() => {
    const s = [...records].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    const si = [...iptRecords].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    const latest = s[s.length - 1];
    const prev = s[s.length - 2];
    const latestIpt = si[si.length - 1];
    const prevIpt = si[si.length - 2];
    const baseTiles = latest ? [
      { icon: PiggyBank, label: 'Pensioenreserve', value: latest.pensioenreserve, prev: prev?.pensioenreserve, spark: s.map(r => ({ v: r.pensioenreserve })) },
      { icon: Shield, label: 'Overlijdensdekking', value: latest.overlijdensdekking, prev: prev?.overlijdensdekking, spark: s.map(r => ({ v: r.overlijdensdekking })) },
      { icon: Wallet, label: 'VAPZ-reserve', value: latest.pensioenreserve_vapz, prev: prev?.pensioenreserve_vapz, spark: s.map(r => ({ v: r.pensioenreserve_vapz })) },
      { icon: Stethoscope, label: 'VAP RIZIV', value: latest.vap_riziv_toelage, prev: prev?.vap_riziv_toelage, spark: s.map(r => ({ v: r.vap_riziv_toelage })) },
    ] : [];
    if (latestIpt) {
      baseTiles.push({ icon: Briefcase, label: 'IPT-reserve', value: latestIpt.opgebouwde_reserve, prev: prevIpt?.opgebouwde_reserve, spark: si.map(r => ({ v: r.opgebouwde_reserve })) });
    }
    // Per-jaar IPT: pak laatste snapshot per jaar
    const byYear = new Map<number, IptRecord>();
    for (const r of si) byYear.set(r.year, r);
    const years = [...byYear.keys()].sort((a, b) => a - b);
    const iptYearly = years.map((y, idx) => {
      const cur = byYear.get(y)!;
      const prevYear = idx > 0 ? byYear.get(years[idx - 1]) : undefined;
      const basis = cur.beginkapitaal > 0 ? cur.beginkapitaal : (prevYear?.eindkapitaal || prevYear?.opgebouwde_reserve || 0);
      const rendement = basis > 0 ? (cur.winst_uit_beleggingen / basis) * 100 : null;
      const nettoStortingen = (cur.inkomende_bewegingen || 0) + (cur.uitgaande_bewegingen || 0);
      return {
        year: y,
        snapshot_date: cur.snapshot_date,
        beginkapitaal: cur.beginkapitaal,
        eindkapitaal: cur.eindkapitaal || cur.opgebouwde_reserve,
        opgebouwde_reserve: cur.opgebouwde_reserve,
        jaarpremie: cur.jaarpremie,
        overlijdenskapitaal: cur.overlijdenskapitaal,
        winst_uit_beleggingen: cur.winst_uit_beleggingen,
        gewaarborgd_rendement: cur.gewaarborgd_rendement,
        inkomende_bewegingen: cur.inkomende_bewegingen || 0,
        uitgaande_bewegingen: cur.uitgaande_bewegingen || 0,
        kosten_taksen: cur.kosten_taksen || 0,
        kosten_overlijden: cur.kosten_overlijden || 0,
        nettoStortingen,
        rendement,
      };
    });
    const totalWinst = iptYearly.reduce((acc, y) => acc + (y.winst_uit_beleggingen || 0), 0);
    const rendValues = iptYearly.map(y => y.rendement).filter((v): v is number => v !== null);
    const avgRend = rendValues.length ? rendValues.reduce((a, b) => a + b, 0) / rendValues.length : null;
    const bestYear = iptYearly.filter(y => y.rendement !== null).sort((a, b) => (b.rendement! - a.rendement!))[0] || null;
    const worstYear = iptYearly.filter(y => y.rendement !== null).sort((a, b) => (a.rendement! - b.rendement!))[0] || null;
    return {
      sorted: s,
      sortedIpt: si,
      tiles: baseTiles,
      chartData: s.map(r => ({ date: new Date(r.snapshot_date).toLocaleDateString('nl-BE', { year: 'numeric', month: 'short' }), v: r.pensioenreserve })),
      iptYearly,
      iptStats: { totalWinst, avgRend, bestYear, worstYear },
    };
  }, [records, iptRecords]);

  const latestPension = sorted[sorted.length - 1];
  const latestIpt = sortedIpt[sortedIpt.length - 1];
  const latestDates = [latestPension?.snapshot_date, latestIpt?.snapshot_date].filter(Boolean).sort();
  const latestSnapshotDate = latestDates[latestDates.length - 1];
  const totalTracked = (latestPension?.pensioenreserve || 0) + (latestIpt?.opgebouwde_reserve || 0);
  const hasAnyData = records.length > 0 || iptRecords.length > 0;

  return (

    <div className="max-w-6xl mx-auto space-y-5 md:space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-border/50 bg-gradient-to-br from-primary/15 via-card to-secondary/10 p-5 shadow-sm md:p-8">
        <div className="absolute -top-12 -right-12 w-64 h-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-secondary mb-2 font-semibold">
              <PiggyBank className="h-3.5 w-3.5" /> Pensioen
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Pensioenoverzicht</h1>
            <p className="text-muted-foreground mt-2 text-sm md:text-base">
              Eén rustig overzicht van je wettelijke pensioenreserves, VAPZ en IPT-evolutie.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px]">
            <div className="rounded-2xl border border-border/50 bg-card/75 p-4 backdrop-blur">
              <div className="text-xs text-muted-foreground">Totaal opgevolgd</div>
              <div className="mt-1 text-2xl font-semibold font-mono">{hasAnyData ? fmtShort(totalTracked) : '—'}</div>
              <div className="mt-1 text-xs text-muted-foreground">Pensioenreserve + IPT</div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card/75 p-4 backdrop-blur">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" /> Laatste update
              </div>
              <div className="mt-1 text-lg font-semibold">{latestSnapshotDate ? fmtDate(latestSnapshotDate) : 'Nog geen data'}</div>
              <div className="mt-1 text-xs text-muted-foreground">{records.length + iptRecords.length} snapshot{records.length + iptRecords.length === 1 ? '' : 's'}</div>
            </div>
          </div>
        </div>
        <div className="relative mt-5 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="h-auto min-h-12 rounded-2xl">
            <Link to="/pensioen/upload">
              <UploadCloud className="h-4 w-4 mr-2" />
              Pensioenoverzicht uploaden
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto min-h-12 rounded-2xl bg-card/70">
            <Link to="/pensioen/upload-ipt">
              <Plus className="h-4 w-4 mr-2" />
              IPT toevoegen
            </Link>
          </Button>
        </div>
      </div>

      {!hasAnyData && !loading && (
        <Card className="ios-card border-dashed border-primary/30 bg-primary/5">
          <CardContent className="pt-6 text-center">
            <PiggyBank className="mx-auto h-9 w-9 text-primary" />
            <h2 className="mt-3 text-lg font-semibold">Start met je eerste pensioen-PDF</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Upload je jaarlijks overzicht of IPT-document. Daarna bouwen we automatisch dit dashboard op.
            </p>
          </CardContent>
        </Card>
      )}

      {latestPension && (
        <Card className="ios-card overflow-hidden border-border/50 bg-card/90">
          <CardContent className="p-0">
            <div className="grid gap-0 md:grid-cols-[1.1fr_1fr]">
              <div className="border-b border-border/50 p-5 md:border-b-0 md:border-r md:p-6">
                <Badge variant="secondary" className="mb-4">Laatste wettelijk overzicht</Badge>
                <div className="text-sm text-muted-foreground">{fmtDate(latestPension.snapshot_date)}</div>
                <div className="mt-2 text-3xl font-semibold font-mono tracking-tight md:text-4xl">{fmt(latestPension.pensioenreserve)}</div>
                <p className="mt-2 text-sm text-muted-foreground">Cumulatieve pensioenreserve uit het meest recente overzicht.</p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-y divide-border/50 md:divide-y-0">
                <div className="p-4">
                  <Shield className="mb-3 h-4 w-4 text-primary" />
                  <div className="text-xs text-muted-foreground">Overlijdensdekking</div>
                  <div className="mt-1 font-semibold font-mono">{fmtShort(latestPension.overlijdensdekking)}</div>
                </div>
                <div className="p-4">
                  <Wallet className="mb-3 h-4 w-4 text-primary" />
                  <div className="text-xs text-muted-foreground">VAPZ-reserve</div>
                  <div className="mt-1 font-semibold font-mono">{fmtShort(latestPension.pensioenreserve_vapz)}</div>
                </div>
                <div className="p-4">
                  <Stethoscope className="mb-3 h-4 w-4 text-primary" />
                  <div className="text-xs text-muted-foreground">VAP RIZIV</div>
                  <div className="mt-1 font-semibold font-mono">{fmtShort(latestPension.vap_riziv_toelage)}</div>
                </div>
                <div className="p-4">
                  <FileText className="mb-3 h-4 w-4 text-primary" />
                  <div className="text-xs text-muted-foreground">Bronnen</div>
                  <div className="mt-1 font-semibold">{records.length} overzicht{records.length === 1 ? '' : 'en'}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {latestIpt && (
        <Card className="ios-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Badge variant="outline" className="mb-3">IPT</Badge>
                <h2 className="text-xl font-semibold">Individuele Pensioentoezegging</h2>
                <p className="mt-1 text-sm text-muted-foreground">Laatste reserve op {fmtDate(latestIpt.snapshot_date)}</p>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-2xl font-semibold font-mono">{fmt(latestIpt.opgebouwde_reserve)}</div>
                <div className="text-xs text-muted-foreground">opgebouwde reserve</div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">Jaarpremie</div>
                <div className="mt-1 font-semibold font-mono">{fmtShort(latestIpt.jaarpremie)}</div>
              </div>
              <div className="rounded-2xl bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">Beleggingswinst</div>
                <div className="mt-1 font-semibold font-mono text-emerald-600">{fmtShort(latestIpt.winst_uit_beleggingen)}</div>
              </div>
              <div className="rounded-2xl bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">Overlijdenskapitaal</div>
                <div className="mt-1 font-semibold font-mono">{fmtShort(latestIpt.overlijdenskapitaal)}</div>
              </div>
              <div className="rounded-2xl bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">Gew. rendement</div>
                <div className="mt-1 font-semibold font-mono">{(latestIpt.gewaarborgd_rendement || 0).toFixed(2)}%</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI tiles with sparklines */}
      {sorted.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
          {tiles.map((t, i) => {
            const d = t.prev !== undefined ? t.value - (t.prev || 0) : 0;
            const up = d >= 0;
            return (
              <Card key={t.label} className="border-border/50 relative overflow-hidden group hover:border-primary/40 transition-colors">
                <div className={`absolute top-0 left-0 right-0 h-1 ${up ? 'bg-emerald-500/60' : 'bg-red-500/60'}`} />
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <t.icon className="h-4 w-4 text-primary" />
                    </div>
                    {t.prev !== undefined && t.prev > 0 && (
                      <div className={`flex items-center gap-1 text-xs font-medium ${up ? 'text-emerald-600' : 'text-red-600'}`}>
                        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {up ? '+' : ''}{((d / t.prev) * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-3">{t.label}</div>
                  <div className="text-xl font-semibold font-mono mt-1">{fmt(t.value)}</div>
                  {t.spark.length >= 2 && (
                    <div className="h-12 -mx-2 -mb-2 mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={t.spark}>
                          <defs>
                            <linearGradient id={`sg-${i}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} fill={`url(#sg-${i})`} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Evolution mini-chart */}
      {chartData.length >= 2 && (
        <Card className="border-border/50 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Evolutie pensioenreserve
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="evo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    formatter={(v: number) => fmt(v)}
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                  />
                  <Area type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#evo)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}


      <Collapsible defaultOpen={false}>
        <Card className="border-border/50">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors [&[data-state=open]_svg.chevron]:rotate-180">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Snapshots ({records.length})</span>
                <ChevronDown className="chevron h-4 w-4 text-muted-foreground transition-transform" />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : records.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nog geen pensioendata. Upload een PDF om te beginnen.</p>
              ) : (
                <>
                  <div className="space-y-3 md:hidden">
                    {records.map((r) => (
                      <div key={r.id} className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">{fmtDate(r.snapshot_date)}</div>
                            <div className="mt-1 text-xl font-semibold font-mono">{fmt(r.pensioenreserve)}</div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {r.source_pdf_url && (
                              <Button size="icon" variant="ghost" onClick={() => openPdf(r.source_pdf_url!)}>
                                <FileText className="h-4 w-4" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" onClick={() => handleDelete(r.id, r.source_pdf_url)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                          <div className="rounded-xl bg-card p-3">
                            <div className="text-xs text-muted-foreground">Overlijdensdekking</div>
                            <div className="font-mono font-medium">{fmtShort(r.overlijdensdekking)}</div>
                          </div>
                          <div className="rounded-xl bg-card p-3">
                            <div className="text-xs text-muted-foreground">VAPZ</div>
                            <div className="font-mono font-medium">{fmtShort(r.pensioenreserve_vapz)}</div>
                          </div>
                          <div className="rounded-xl bg-card p-3">
                            <div className="text-xs text-muted-foreground">VAP RIZIV</div>
                            <div className="font-mono font-medium">{fmtShort(r.vap_riziv_toelage)}</div>
                          </div>
                          <div className="rounded-xl bg-card p-3">
                            <div className="text-xs text-muted-foreground">Jaar</div>
                            <div className="font-medium">{r.year}</div>
                          </div>
                        </div>
                        {r.note && <p className="mt-3 text-sm text-muted-foreground">{r.note}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Datum</TableHead>
                          <TableHead className="text-right">Pensioenreserve</TableHead>
                          <TableHead className="text-right">Overlijdensdekking</TableHead>
                          <TableHead className="text-right">VAPZ</TableHead>
                          <TableHead className="text-right">VAP RIZIV</TableHead>
                          <TableHead>Notitie</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {records.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-medium">{fmtDate(r.snapshot_date)}</TableCell>
                              <TableCell className="text-right font-mono font-semibold">{fmt(r.pensioenreserve)}</TableCell>
                              <TableCell className="text-right font-mono">{fmt(r.overlijdensdekking)}</TableCell>
                              <TableCell className="text-right font-mono">{fmt(r.pensioenreserve_vapz)}</TableCell>
                              <TableCell className="text-right font-mono">{fmt(r.vap_riziv_toelage)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">{r.note || '—'}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  {r.source_pdf_url && (
                                    <Button size="icon" variant="ghost" onClick={() => openPdf(r.source_pdf_url!)}>
                                      <FileText className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button size="icon" variant="ghost" onClick={() => handleDelete(r.id, r.source_pdf_url)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {iptRecords.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Totale winst uit beleggingen</div>
              <div className="text-2xl font-semibold font-mono mt-2">{fmt(iptStats.totalWinst)}</div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Gemiddeld rendement</div>
              <div className="text-2xl font-semibold font-mono mt-2">{iptStats.avgRend !== null ? `${iptStats.avgRend.toFixed(2)}%` : '—'}</div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Beste / slechtste jaar</div>
              <div className="text-sm font-mono mt-2">
                <span className="text-emerald-600 font-semibold">{iptStats.bestYear ? `${iptStats.bestYear.year}: ${iptStats.bestYear.rendement!.toFixed(2)}%` : '—'}</span>
                <span className="mx-2 text-muted-foreground">·</span>
                <span className="text-red-600 font-semibold">{iptStats.worstYear ? `${iptStats.worstYear.year}: ${iptStats.worstYear.rendement!.toFixed(2)}%` : '—'}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" /> IPT per jaar ({iptYearly.length})
            </CardTitle>
            {iptRecords.some(r => r.source_pdf_url) && (
              <Button size="sm" variant="outline" onClick={reanalyzeAllIpt} disabled={reanalyzing}>
                {reanalyzing
                  ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Heranalyseren {reanalyzeProgress.done}/{reanalyzeProgress.total}…</>
                  : <>Heranalyseer alle IPT</>}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {iptRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nog geen IPT-data. Upload een IPT-PDF om te beginnen.</p>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {iptYearly.slice().reverse().map((r) => (
                  <div key={r.year} className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-muted-foreground">IPT jaar</div>
                        <div className="text-2xl font-semibold">{r.year}</div>
                      </div>
                      <Badge variant={r.rendement !== null && r.rendement >= 0 ? 'secondary' : 'outline'}>
                        {r.rendement !== null ? `${r.rendement.toFixed(2)}%` : 'Geen rendement'}
                      </Badge>
                    </div>
                    <div className="mt-4 rounded-2xl bg-card p-4">
                      <div className="text-xs text-muted-foreground">Eindkapitaal</div>
                      <div className="mt-1 text-xl font-semibold font-mono">{fmt(r.eindkapitaal)}</div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl bg-card p-3">
                        <div className="text-xs text-muted-foreground">Beginkapitaal</div>
                        <div className="font-mono font-medium">{fmtShort(r.beginkapitaal)}</div>
                      </div>
                      <div className="rounded-xl bg-card p-3">
                        <div className="text-xs text-muted-foreground">Winst</div>
                        <div className="font-mono font-medium text-emerald-600">{fmtShort(r.winst_uit_beleggingen)}</div>
                      </div>
                      <div className="rounded-xl bg-card p-3">
                        <div className="text-xs text-muted-foreground">Netto stortingen</div>
                        <div className="font-mono font-medium">{fmtShort(r.nettoStortingen)}</div>
                      </div>
                      <div className="rounded-xl bg-card p-3">
                        <div className="text-xs text-muted-foreground">Kosten</div>
                        <div className="font-mono font-medium text-muted-foreground">{fmtShort((r.kosten_taksen || 0) + (r.kosten_overlijden || 0))}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jaar</TableHead>
                      <TableHead className="text-right">Beginkapitaal</TableHead>
                      <TableHead className="text-right">Eindkapitaal</TableHead>
                      <TableHead className="text-right">Beleggingswinst</TableHead>
                      <TableHead className="text-right">Benaderd rend.</TableHead>
                      <TableHead className="text-right">Inkomend</TableHead>
                      <TableHead className="text-right">Uitgaand</TableHead>
                      <TableHead className="text-right">Netto stortingen</TableHead>
                      <TableHead className="text-right">Kosten/taksen</TableHead>
                      <TableHead className="text-right">Kosten overlijden</TableHead>
                      <TableHead className="text-right">Overl.kapitaal</TableHead>
                      <TableHead className="text-right">Gew. rend.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {iptYearly.slice().reverse().map((r) => (
                      <TableRow key={r.year}>
                        <TableCell className="font-medium">{r.year}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.beginkapitaal)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{fmt(r.eindkapitaal)}</TableCell>
                        <TableCell className="text-right font-mono text-emerald-600">{fmt(r.winst_uit_beleggingen)}</TableCell>
                        <TableCell className={`text-right font-mono font-semibold ${r.rendement === null ? 'text-muted-foreground' : r.rendement >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {r.rendement !== null ? `${r.rendement.toFixed(2)}%` : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.inkomende_bewegingen)}</TableCell>
                        <TableCell className="text-right font-mono text-red-600">{fmt(r.uitgaande_bewegingen)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.nettoStortingen)}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{fmt(r.kosten_taksen)}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{fmt(r.kosten_overlijden)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.overlijdenskapitaal)}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{(r.gewaarborgd_rendement || 0).toFixed(2)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Collapsible defaultOpen={false}>
        <Card className="border-border/50">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors [&[data-state=open]_svg.chevron]:rotate-180">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" /> IPT Snapshots / Bronbestanden ({iptRecords.length})
                </span>
                <ChevronDown className="chevron h-4 w-4 text-muted-foreground transition-transform" />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {iptRecords.length > 0 && (
                <>
                  <div className="space-y-3 md:hidden">
                    {iptRecords.map((r) => (
                      <div key={r.id} className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">{fmtDate(r.snapshot_date)}</div>
                            <div className="mt-1 text-lg font-semibold font-mono">{fmt(r.opgebouwde_reserve)}</div>
                            <div className="mt-1 text-xs text-emerald-600">Winst: {fmt(r.winst_uit_beleggingen)}</div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {r.source_pdf_url && (
                              <Button size="icon" variant="ghost" onClick={() => openIptPdf(r.source_pdf_url!)}>
                                <FileText className="h-4 w-4" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" onClick={() => handleDeleteIpt(r.id, r.source_pdf_url)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        {r.note && <p className="mt-3 text-sm text-muted-foreground">{r.note}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Datum</TableHead>
                          <TableHead className="text-right">Reserve</TableHead>
                          <TableHead className="text-right">Winst</TableHead>
                          <TableHead>Notitie</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {iptRecords.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{fmtDate(r.snapshot_date)}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(r.opgebouwde_reserve)}</TableCell>
                            <TableCell className="text-right font-mono text-emerald-600">{fmt(r.winst_uit_beleggingen)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">{r.note || '—'}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {r.source_pdf_url && (
                                  <Button size="icon" variant="ghost" onClick={() => openIptPdf(r.source_pdf_url!)}>
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" onClick={() => handleDeleteIpt(r.id, r.source_pdf_url)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
