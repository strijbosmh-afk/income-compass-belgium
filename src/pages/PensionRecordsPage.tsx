import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, FileText, Loader2, PiggyBank, Shield, Wallet, Stethoscope, TrendingUp, TrendingDown, Calendar, Briefcase } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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

interface IptRecord {
  id: string;
  snapshot_date: string;
  year: number;
  opgebouwde_reserve: number;
  jaarpremie: number;
  overlijdenskapitaal: number;
  gewaarborgd_rendement: number;
  source_pdf_url: string | null;
  note: string | null;
}

export default function PensionRecordsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [records, setRecords] = useState<PensionRecord[]>([]);
  const [iptRecords, setIptRecords] = useState<IptRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data, error }, { data: iptData, error: iptErr }] = await Promise.all([
      supabase.from('pension_records').select('*').order('snapshot_date', { ascending: false }),
      supabase.from('pension_ipt_records').select('*').order('snapshot_date', { ascending: false }),
    ]);
    if (error) toast({ title: 'Fout', description: error.message, variant: 'destructive' });
    else setRecords((data as PensionRecord[]) || []);
    if (iptErr) toast({ title: 'Fout (IPT)', description: iptErr.message, variant: 'destructive' });
    else setIptRecords((iptData as IptRecord[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

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

  const openPdf = async (path: string) => {
    const { data } = await supabase.storage.from('pension-pdfs').createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };
  const { sorted, tiles, chartData, sortedIpt } = useMemo(() => {
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
    return {
      sorted: s,
      sortedIpt: si,
      tiles: baseTiles,
      chartData: s.map(r => ({ date: new Date(r.snapshot_date).toLocaleDateString('nl-BE', { year: 'numeric', month: 'short' }), v: r.pensioenreserve })),
    };
  }, [records, iptRecords]);

  return (

    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Hero header with decorative gradient */}
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8">
        <div className="absolute -top-12 -right-12 w-64 h-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
              <PiggyBank className="h-3.5 w-3.5" /> Pensioen
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Pensioen Overzicht</h1>
            <p className="text-muted-foreground mt-1">Jaarlijkse snapshots van je pensioenreserves.</p>
          </div>
          {sorted.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card/60 backdrop-blur border border-border/50">
              <div className="p-2 rounded-lg bg-primary/10">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Laatste snapshot</div>
                <div className="font-semibold">{new Date(sorted[sorted.length - 1].snapshot_date).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPI tiles with sparklines */}
      {sorted.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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


      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Snapshots ({records.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : records.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nog geen pensioendata. Upload een PDF om te beginnen.</p>
          ) : (
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
                      <TableCell className="font-medium">{new Date(r.snapshot_date).toLocaleDateString('nl-BE')}</TableCell>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
