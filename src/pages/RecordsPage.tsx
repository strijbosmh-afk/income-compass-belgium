import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type IncomeRecord = {
  id: string;
  record_date: string;
  month: number;
  year: number;
  income_type: string;
  nomenclature_code: string;
  description: string | null;
  quantity: number;
  unit_amount: number;
  total_amount: number;
  aandeel_arts: number;
  bouwfonds: number;
  mif: number;
  netto: number;
};

export default function RecordsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [records, setRecords] = useState<IncomeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  const fetchRecords = async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase.from('income_records').select('*').eq('user_id', user.id).order('record_date', { ascending: false });
    if (filterYear !== 'all') query = query.eq('year', parseInt(filterYear));
    if (filterType !== 'all') query = query.eq('income_type', filterType);
    const { data, error } = await query;
    if (error) toast({ title: 'Fout', description: error.message, variant: 'destructive' });
    else setRecords(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchRecords(); }, [user, filterYear, filterType]);

  const deleteRecord = async (id: string) => {
    const { error } = await supabase.from('income_records').delete().eq('id', id);
    if (error) toast({ title: 'Fout', description: error.message, variant: 'destructive' });
    else {
      setRecords(prev => prev.filter(r => r.id !== id));
      toast({ title: 'Verwijderd' });
    }
  };

  const years = [...new Set(records.map(r => r.year))].sort((a, b) => b - a);
  const netto = records.reduce((sum, r) => sum + r.netto, 0);
  const bruto = records.reduce((sum, r) => sum + r.total_amount, 0);
  const totalBouwfonds = records.reduce((sum, r) => sum + r.bouwfonds, 0);
  const totalMif = records.reduce((sum, r) => sum + r.mif, 0);
  const totalAfdracht = bruto - netto;
  const fmt = (v: number) => `€${v.toLocaleString('de-BE', { minimumFractionDigits: 2 })}`;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inkomstenoverzicht</h1>
          <p className="text-muted-foreground mt-1">Bekijk en beheer je inkomsten.</p>
        </div>
        <div className="text-right space-y-0.5">
          <p className="text-sm text-muted-foreground">Netto (aandeel arts)</p>
          <p className="text-2xl font-semibold text-foreground">{fmt(netto)}</p>
        </div>
      </div>

      <div className="flex gap-3">
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Jaar" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle jaren</SelectItem>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle types</SelectItem>
            <SelectItem value="ambulatory">Ambulant</SelectItem>
            <SelectItem value="hospitalized">Gehospitaliseerd</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="netto">
        <TabsList>
          <TabsTrigger value="netto">Netto Inkomsten</TabsTrigger>
          <TabsTrigger value="afdracht">Afdracht</TabsTrigger>
        </TabsList>

        {/* Netto tab */}
        <TabsContent value="netto" className="mt-4">
          <Card className="border-border/50">
            <CardContent className="pt-4">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : records.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">Geen records gevonden. Upload een screenshot om te beginnen.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Datum</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Type</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">RIZIV</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Omschrijving</th>
                        <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Aantal</th>
                        <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Bruto €</th>
                        <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Netto €</th>
                        <th className="py-2.5 px-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map(r => (
                        <tr key={r.id} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 px-3">{new Date(r.record_date).toLocaleDateString('nl-BE')}</td>
                          <td className="py-2.5 px-3">
                            <Badge variant={r.income_type === 'ambulatory' ? 'default' : 'secondary'} className="text-xs font-normal">
                              {r.income_type === 'ambulatory' ? 'Amb' : 'Hosp'}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-xs">{r.nomenclature_code}</td>
                          <td className="py-2.5 px-3 text-muted-foreground">{r.description || '—'}</td>
                          <td className="py-2.5 px-3 text-right">{r.quantity}</td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground">€{r.total_amount.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-medium">€{r.aandeel_arts.toFixed(2)}</td>
                          <td className="py-2.5 px-3">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteRecord(r.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border/50">
                        <td colSpan={5} className="py-2.5 px-3 font-medium text-right">Totaal</td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground font-medium">{fmt(bruto)}</td>
                        <td className="py-2.5 px-3 text-right font-semibold">{fmt(netto)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Afdracht tab */}
        <TabsContent value="afdracht" className="mt-4 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-border/50">
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Totaal Afdracht</p>
                <p className="text-2xl font-semibold">{fmt(totalAfdracht)}</p>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Bouwfonds</p>
                <p className="text-2xl font-semibold">{fmt(totalBouwfonds)}</p>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">MIF</p>
                <p className="text-2xl font-semibold">{fmt(totalMif)}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50">
            <CardContent className="pt-4">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : records.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">Geen records gevonden.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Datum</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Type</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">RIZIV</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Omschrijving</th>
                        <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Ereloon €</th>
                        <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Bouwfonds €</th>
                        <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">MIF €</th>
                        <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Netto €</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map(r => (
                        <tr key={r.id} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 px-3">{new Date(r.record_date).toLocaleDateString('nl-BE')}</td>
                          <td className="py-2.5 px-3">
                            <Badge variant={r.income_type === 'ambulatory' ? 'default' : 'secondary'} className="text-xs font-normal">
                              {r.income_type === 'ambulatory' ? 'Amb' : 'Hosp'}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-xs">{r.nomenclature_code}</td>
                          <td className="py-2.5 px-3 text-muted-foreground">{r.description || '—'}</td>
                          <td className="py-2.5 px-3 text-right">€{r.total_amount.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right text-destructive/80">€{r.bouwfonds.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right text-destructive/80">€{r.mif.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-medium">€{r.aandeel_arts.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border/50">
                        <td colSpan={4} className="py-2.5 px-3 font-medium text-right">Totaal</td>
                        <td className="py-2.5 px-3 text-right font-medium">{fmt(bruto)}</td>
                        <td className="py-2.5 px-3 text-right text-destructive/80 font-medium">{fmt(totalBouwfonds)}</td>
                        <td className="py-2.5 px-3 text-right text-destructive/80 font-medium">{fmt(totalMif)}</td>
                        <td className="py-2.5 px-3 text-right font-semibold">{fmt(netto)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}