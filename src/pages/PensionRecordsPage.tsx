import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trash2, FileText, Loader2, UploadCloud, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useDataVersion, bumpDataVersion } from '@/hooks/useDataVersion';
import { SIMPLE_CATEGORIES, IPT_CONFIG, PENSION_BUCKETS, type PensionCategory } from '@/lib/pensionCategories';

interface Row {
  id: string;
  snapshot_date: string;
  year: number;
  pensioenreserve: number;
  overlijdensdekking: number;
  jaarpremie: number;
  source_pdf_url: string | null;
  note: string | null;
}

const fmt = (v: number) => `€${(v || 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' });

type CatMap = Record<PensionCategory, Row[]>;

export default function PensionRecordsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const version = useDataVersion();
  const [rows, setRows] = useState<CatMap>({ ipt: [], vapz: [], vapz_riziv: [], pensioensparen: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PensionCategory>('ipt');

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [iptRes, ...simpleResults] = await Promise.all([
      supabase.from('pension_ipt_records').select('id, snapshot_date, year, opgebouwde_reserve, overlijdenskapitaal, jaarpremie, source_pdf_url, note').eq('user_id', user.id).order('snapshot_date', { ascending: false }),
      ...SIMPLE_CATEGORIES.map(c => (supabase as any).from(c.table).select('*').eq('user_id', user.id).order('snapshot_date', { ascending: false })),
    ]);
    const next: CatMap = {
      ipt: ((iptRes.data as any[]) || []).map(r => ({
        id: r.id, snapshot_date: r.snapshot_date, year: r.year,
        pensioenreserve: Number(r.opgebouwde_reserve) || 0,
        overlijdensdekking: Number(r.overlijdenskapitaal) || 0,
        jaarpremie: Number(r.jaarpremie) || 0,
        source_pdf_url: r.source_pdf_url, note: r.note,
      })),
      vapz: [], vapz_riziv: [], pensioensparen: [],
    };
    SIMPLE_CATEGORIES.forEach((c, i) => {
      next[c.key] = ((simpleResults[i].data as any[]) || []).map(r => ({
        id: r.id, snapshot_date: r.snapshot_date, year: r.year,
        pensioenreserve: Number(r.pensioenreserve) || 0,
        overlijdensdekking: Number(r.overlijdensdekking) || 0,
        jaarpremie: Number(r.jaarpremie) || 0,
        source_pdf_url: r.source_pdf_url, note: r.note,
      }));
    });
    setRows(next);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user, version]);

  const totals = useMemo(() => {
    const cats = [
      { key: 'ipt' as const, label: IPT_CONFIG.label },
      ...SIMPLE_CATEGORIES.map(c => ({ key: c.key as PensionCategory, label: c.label })),
    ];
    let total = 0; let latest: string | undefined; let snapshots = 0;
    for (const c of cats) {
      const list = rows[c.key];
      snapshots += list.length;
      const sortedAsc = [...list].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
      const last = sortedAsc[sortedAsc.length - 1];
      if (last) {
        total += last.pensioenreserve;
        if (!latest || last.snapshot_date > latest) latest = last.snapshot_date;
      }
    }
    return { total, latest, snapshots };
  }, [rows]);

  const deleteRow = async (cat: PensionCategory, id: string, pdfPath: string | null) => {
    if (!confirm('Deze snapshot definitief verwijderen?')) return;
    const table = cat === 'ipt' ? IPT_CONFIG.table : SIMPLE_CATEGORIES.find(c => c.key === cat)!.table;
    const { error } = await (supabase as any).from(table).delete().eq('id', id);
    if (error) { toast({ title: 'Fout', description: error.message, variant: 'destructive' }); return; }
    if (pdfPath) await supabase.storage.from(PENSION_BUCKETS[cat]).remove([pdfPath]);
    toast({ title: 'Verwijderd' });
    bumpDataVersion();
    load();
  };

  const openPdf = async (cat: PensionCategory, path: string) => {
    const { data } = await supabase.storage.from(PENSION_BUCKETS[cat]).createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const catTabs: { key: PensionCategory; label: string; icon: any }[] = [
    { key: 'ipt', label: IPT_CONFIG.label, icon: IPT_CONFIG.icon },
    ...SIMPLE_CATEGORIES.map(c => ({ key: c.key as PensionCategory, label: c.label, icon: c.icon })),
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-5 md:space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-border/50 bg-gradient-to-br from-primary/15 via-card to-secondary/10 p-5 shadow-sm md:p-8">
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Pensioensnapshots</h1>
            <p className="text-muted-foreground mt-2 text-sm md:text-base">Alle snapshots per categorie: IPT, VAPZ, VAPZ RIZIV en Pensioensparen.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px]">
            <div className="rounded-2xl border border-border/50 bg-card/75 p-4 backdrop-blur">
              <div className="text-xs text-muted-foreground">Totaal opgevolgd</div>
              <div className="mt-1 text-2xl font-semibold font-mono">{fmt(totals.total)}</div>
              <div className="mt-1 text-xs text-muted-foreground">4 categorieën samen</div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card/75 p-4 backdrop-blur">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> Laatste update</div>
              <div className="mt-1 text-lg font-semibold">{totals.latest ? fmtDate(totals.latest) : 'Nog geen data'}</div>
              <div className="mt-1 text-xs text-muted-foreground">{totals.snapshots} snapshot{totals.snapshots === 1 ? '' : 's'}</div>
            </div>
          </div>
        </div>
        <div className="relative mt-5">
          <Button asChild className="h-auto min-h-12 rounded-2xl">
            <Link to="/pensioen/upload"><UploadCloud className="h-4 w-4 mr-2" />Nieuwe pensioen-PDF uploaden</Link>
          </Button>
        </div>
      </div>

      <Card className="border-border/50">
        <CardContent className="pt-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as PensionCategory)}>
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
              {catTabs.map(t => (
                <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
                  <t.icon className="h-3.5 w-3.5" /> {t.label} <span className="text-xs text-muted-foreground">({rows[t.key].length})</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {catTabs.map(t => (
              <TabsContent key={t.key} value={t.key} className="mt-4">
                {loading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : rows[t.key].length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-sm text-muted-foreground">Nog geen {t.label}-snapshots.</p>
                    <Button asChild size="sm" variant="outline" className="mt-3">
                      <Link to="/pensioen/upload"><UploadCloud className="h-4 w-4 mr-2" /> {t.label} uploaden</Link>
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 md:hidden">
                      {rows[t.key].map(r => (
                        <div key={r.id} className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold">{fmtDate(r.snapshot_date)}</div>
                              <div className="mt-1 text-xl font-semibold font-mono">{fmt(r.pensioenreserve)}</div>
                            </div>
                            <div className="flex shrink-0 gap-1">
                              {r.source_pdf_url && (
                                <Button size="icon" variant="ghost" onClick={() => openPdf(t.key, r.source_pdf_url!)}><FileText className="h-4 w-4" /></Button>
                              )}
                              <Button size="icon" variant="ghost" onClick={() => deleteRow(t.key, r.id, r.source_pdf_url)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                            <div className="rounded-xl bg-card p-3">
                              <div className="text-xs text-muted-foreground">Overlijdensdekking</div>
                              <div className="font-mono font-medium">{fmt(r.overlijdensdekking)}</div>
                            </div>
                            <div className="rounded-xl bg-card p-3">
                              <div className="text-xs text-muted-foreground">Jaarpremie</div>
                              <div className="font-mono font-medium">{fmt(r.jaarpremie)}</div>
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
                            <TableHead className="text-right">Overlijdensdekking</TableHead>
                            <TableHead className="text-right">Jaarpremie</TableHead>
                            <TableHead>Notitie</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows[t.key].map(r => (
                            <TableRow key={r.id}>
                              <TableCell className="font-medium">{fmtDate(r.snapshot_date)}</TableCell>
                              <TableCell className="text-right font-mono font-semibold">{fmt(r.pensioenreserve)}</TableCell>
                              <TableCell className="text-right font-mono">{fmt(r.overlijdensdekking)}</TableCell>
                              <TableCell className="text-right font-mono">{fmt(r.jaarpremie)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">{r.note || '—'}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  {r.source_pdf_url && (
                                    <Button size="icon" variant="ghost" onClick={() => openPdf(t.key, r.source_pdf_url!)}><FileText className="h-4 w-4" /></Button>
                                  )}
                                  <Button size="icon" variant="ghost" onClick={() => deleteRow(t.key, r.id, r.source_pdf_url)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
