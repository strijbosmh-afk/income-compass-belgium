import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

export default function PensionRecordsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [records, setRecords] = useState<PensionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('pension_records')
      .select('*')
      .order('snapshot_date', { ascending: false });
    if (error) toast({ title: 'Fout', description: error.message, variant: 'destructive' });
    else setRecords((data as PensionRecord[]) || []);
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

  const openPdf = async (path: string) => {
    const { data } = await supabase.storage.from('pension-pdfs').createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pensioen Overzicht</h1>
        <p className="text-muted-foreground mt-1">Jaarlijkse snapshots van je pensioenreserves.</p>
      </div>

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
