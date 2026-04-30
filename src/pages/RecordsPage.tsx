import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useDataVersion, bumpDataVersion } from '@/hooks/useDataVersion';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2, ChevronDown, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScreenshotsDialog } from '@/components/ScreenshotsDialog';

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
  source_image_url: string | null;
};

type NomenclatureCode = {
  code: string;
  description: string;
  netto_amount: number;
};

type GroupedRecord = {
  nomenclature_code: string;
  label: string;
  income_type: string;
  totalQuantity: number;
  totalBruto: number;
  totalNetto: number;
  totalBouwfonds: number;
  totalMif: number;
  totalAandeelArts: number;
  records: IncomeRecord[];
};

export default function RecordsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [records, setRecords] = useState<IncomeRecord[]>([]);
  const [nomenclatureCodes, setNomenclatureCodes] = useState<NomenclatureCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [screenshotDialog, setScreenshotDialog] = useState<{ open: boolean; title: string; paths: string[] }>({ open: false, title: '', paths: [] });
  const dataVersion = useDataVersion();

  const fetchRecords = async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase.from('income_records').select('*').eq('user_id', user.id).order('record_date', { ascending: false });
    if (filterYear !== 'all') query = query.eq('year', parseInt(filterYear));
    if (filterType !== 'all') query = query.eq('income_type', filterType);
    if (filterMonth !== 'all') query = query.eq('month', parseInt(filterMonth));
    const [recordsRes, nomenclatureRes] = await Promise.all([
      query,
      supabase.from('nomenclature_codes').select('code, description, netto_amount').eq('user_id', user.id),
    ]);
    if (recordsRes.error) toast({ title: 'Fout', description: recordsRes.error.message, variant: 'destructive' });
    else setRecords(recordsRes.data || []);
    setNomenclatureCodes(nomenclatureRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchRecords(); }, [user, filterYear, filterType, filterMonth, dataVersion]);

  const codeToLabel = useMemo(() => {
    const map: Record<string, string> = {};
    nomenclatureCodes.forEach(nc => { map[nc.code] = nc.description || nc.code; });
    return map;
  }, [nomenclatureCodes]);

  const codeToNetto = useMemo(() => {
    const map: Record<string, number> = {};
    nomenclatureCodes.forEach(nc => { map[nc.code] = Number(nc.netto_amount) || 0; });
    return map;
  }, [nomenclatureCodes]);

  const grouped = useMemo((): GroupedRecord[] => {
    const map = new Map<string, GroupedRecord>();
    records.forEach(r => {
      const key = `${r.nomenclature_code}_${r.income_type}`;
      if (!map.has(key)) {
        map.set(key, {
          nomenclature_code: r.nomenclature_code,
          label: codeToLabel[r.nomenclature_code] || r.description || r.nomenclature_code,
          income_type: r.income_type,
          totalQuantity: 0,
          totalBruto: 0,
          totalNetto: 0,
          totalBouwfonds: 0,
          totalMif: 0,
          totalAandeelArts: 0,
          records: [],
        });
      }
      const g = map.get(key)!;
      // Bereken aantal: gebruik opgeslagen quantity, of leid af uit netto / unit netto bedrag
      const unitNetto = codeToNetto[r.nomenclature_code] || 0;
      let qty = r.quantity;
      if ((!qty || qty === 0) && unitNetto > 0 && r.netto > 0) {
        qty = Math.round(r.netto / unitNetto);
      }
      g.totalQuantity += qty;
      g.totalBruto += r.total_amount;
      g.totalNetto += r.netto;
      g.totalBouwfonds += r.bouwfonds;
      g.totalMif += r.mif;
      g.totalAandeelArts += r.aandeel_arts;
      g.records.push({ ...r, quantity: qty });
    });
    return Array.from(map.values()).sort((a, b) => b.totalNetto - a.totalNetto);
  }, [records, codeToLabel, codeToNetto]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const deleteRecord = async (id: string) => {
    const { error } = await supabase.from('income_records').delete().eq('id', id);
    if (error) toast({ title: 'Fout', description: error.message, variant: 'destructive' });
    else {
      setRecords(prev => prev.filter(r => r.id !== id));
      toast({ title: 'Verwijderd' });
      bumpDataVersion();
    }
  };

  const years = [...new Set(records.map(r => r.year))].sort((a, b) => b - a);
  const netto = records.reduce((sum, r) => sum + r.netto, 0);
  const bruto = records.reduce((sum, r) => sum + r.total_amount, 0);
  const totalAandeelArts = records.reduce((sum, r) => sum + r.aandeel_arts, 0);
  const totalBouwfonds = records.reduce((sum, r) => sum + r.bouwfonds, 0);
  const totalMif = records.reduce((sum, r) => sum + r.mif, 0);
  const totalAfdracht = bruto - totalAandeelArts;
  const fmt = (v: number) => `€${v.toLocaleString('de-BE', { minimumFractionDigits: 2 })}`;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inkomstenoverzicht</h1>
          <p className="text-muted-foreground mt-1">Bekijk en beheer je inkomsten.</p>
        </div>
        <div className="text-right space-y-0.5">
          <p className="text-sm text-muted-foreground">Netto loon</p>
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
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Maand" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle maanden</SelectItem>
            {['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'].map((m, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
            ))}
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
              ) : grouped.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">Geen records gevonden. Upload een screenshot om te beginnen.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground w-8"></th>
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
                      {grouped.map(g => {
                        const key = `${g.nomenclature_code}_${g.income_type}`;
                        const isExpanded = expandedGroups.has(key);
                        return (
                          <>
                            <tr key={key} className="border-b border-border/20 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => toggleGroup(key)}>
                              <td className="py-2.5 px-3">
                                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                              </td>
                              <td className="py-2.5 px-3">
                                <Badge variant={g.income_type === 'ambulatory' ? 'default' : 'secondary'} className="text-xs font-normal">
                                  {g.income_type === 'ambulatory' ? 'Amb' : 'Hosp'}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-xs">{g.nomenclature_code}</td>
                              <td className="py-2.5 px-3 font-medium">{g.label}</td>
                              <td className="py-2.5 px-3 text-right font-medium">{g.totalQuantity}</td>
                              <td className="py-2.5 px-3 text-right text-muted-foreground font-medium">{fmt(g.totalBruto)}</td>
                              <td className="py-2.5 px-3 text-right font-semibold">{fmt(g.totalNetto)}</td>
                              <td className="py-2.5 px-3 text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title="Bekijk originele screenshots"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const paths = g.records.map(r => r.source_image_url).filter((p): p is string => !!p);
                                    setScreenshotDialog({
                                      open: true,
                                      title: `${g.label} (${g.income_type === 'ambulatory' ? 'Amb' : 'Hosp'}) — ${g.nomenclature_code}`,
                                      paths,
                                    });
                                  }}
                                >
                                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </td>
                            </tr>
                            {isExpanded && g.records.map(r => (
                              <tr key={r.id} className="border-b border-border/10 bg-muted/10 hover:bg-muted/20 transition-colors">
                                <td className="py-2 px-3"></td>
                                <td className="py-2 px-3"></td>
                                <td className="py-2 px-3"></td>
                                <td className="py-2 px-3 text-muted-foreground text-xs">{new Date(r.record_date).toLocaleDateString('nl-BE')}</td>
                                <td className="py-2 px-3 text-right text-xs">{r.quantity}</td>
                                <td className="py-2 px-3 text-right text-muted-foreground text-xs">€{r.total_amount.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right text-xs">€{r.netto.toFixed(2)}</td>
                                <td className="py-2 px-3">
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); deleteRecord(r.id); }}>
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </>
                        );
                      })}
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
              ) : grouped.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">Geen records gevonden.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground w-8"></th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Type</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">RIZIV</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Omschrijving</th>
                        <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Ereloon €</th>
                        <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Bouwfonds €</th>
                        <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">MIF €</th>
                        <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Netto €</th>
                        <th className="py-2.5 px-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.map(g => {
                        const key = `${g.nomenclature_code}_${g.income_type}`;
                        const isExpanded = expandedGroups.has(key);
                        return (
                          <>
                            <tr key={`afd-${key}`} className="border-b border-border/20 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => toggleGroup(key)}>
                              <td className="py-2.5 px-3">
                                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                              </td>
                              <td className="py-2.5 px-3">
                                <Badge variant={g.income_type === 'ambulatory' ? 'default' : 'secondary'} className="text-xs font-normal">
                                  {g.income_type === 'ambulatory' ? 'Amb' : 'Hosp'}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-xs">{g.nomenclature_code}</td>
                              <td className="py-2.5 px-3 font-medium">{g.label}</td>
                              <td className="py-2.5 px-3 text-right font-medium">{fmt(g.totalBruto)}</td>
                              <td className="py-2.5 px-3 text-right text-destructive/80 font-medium">{fmt(g.totalBouwfonds)}</td>
                              <td className="py-2.5 px-3 text-right text-destructive/80 font-medium">{fmt(g.totalMif)}</td>
                              <td className="py-2.5 px-3 text-right font-semibold">{fmt(g.totalNetto)}</td>
                              <td className="py-2.5 px-3 text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title="Bekijk originele screenshots"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const paths = g.records.map(r => r.source_image_url).filter((p): p is string => !!p);
                                    setScreenshotDialog({
                                      open: true,
                                      title: `${g.label} (${g.income_type === 'ambulatory' ? 'Amb' : 'Hosp'}) — ${g.nomenclature_code}`,
                                      paths,
                                    });
                                  }}
                                >
                                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </td>
                            </tr>
                            {isExpanded && g.records.map(r => (
                              <tr key={r.id} className="border-b border-border/10 bg-muted/10 hover:bg-muted/20 transition-colors">
                                <td className="py-2 px-3"></td>
                                <td className="py-2 px-3"></td>
                                <td className="py-2 px-3"></td>
                                <td className="py-2 px-3 text-muted-foreground text-xs">{new Date(r.record_date).toLocaleDateString('nl-BE')}</td>
                                <td className="py-2 px-3 text-right text-xs">€{r.total_amount.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right text-destructive/80 text-xs">€{r.bouwfonds.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right text-destructive/80 text-xs">€{r.mif.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right text-xs">€{r.netto.toFixed(2)}</td>
                                <td className="py-2 px-3"></td>
                              </tr>
                            ))}
                          </>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border/50">
                        <td colSpan={4} className="py-2.5 px-3 font-medium text-right">Totaal</td>
                        <td className="py-2.5 px-3 text-right font-medium">{fmt(bruto)}</td>
                        <td className="py-2.5 px-3 text-right text-destructive/80 font-medium">{fmt(totalBouwfonds)}</td>
                        <td className="py-2.5 px-3 text-right text-destructive/80 font-medium">{fmt(totalMif)}</td>
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
      </Tabs>

      <ScreenshotsDialog
        open={screenshotDialog.open}
        onOpenChange={(v) => setScreenshotDialog(s => ({ ...s, open: v }))}
        title={screenshotDialog.title}
        description="Originele screenshots gekoppeld aan deze prestatie + type."
        paths={screenshotDialog.paths}
      />
    </div>
  );
}
