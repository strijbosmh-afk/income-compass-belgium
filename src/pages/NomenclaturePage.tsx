import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Loader2, Pencil, Tag, X, Download, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { bumpDataVersion } from '@/hooks/useDataVersion';


type NomenclatureCode = {
  id: string;
  code: string;
  description: string;
  category: string;
  netto_amount: number;
};

type QueryResult = {
  code: string;
  description: string;
  recordCount: number;
  totalQuantity: number;
  totalNetto: number;
  totalAmount: number;
  firstDate: string;
  lastDate: string;
  rows: Array<{
    id: string;
    record_date: string;
    income_type: string;
    quantity: number;
    netto: number;
    total_amount: number;
    description: string | null;
  }>;
};

const DEFAULT_CATEGORIES = ['algemeen', 'raadpleging', 'behandeling', 'procedure', 'overig'];

export default function NomenclaturePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [codes, setCodes] = useState<NomenclatureCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('algemeen');
  const [newNettoAmount, setNewNettoAmount] = useState('');
  const [adding, setAdding] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCustomCategory, setNewCustomCategory] = useState('');
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<NomenclatureCode | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editCode, setEditCode] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editNettoAmount, setEditNettoAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [queryCode, setQueryCode] = useState('');
  const [queryStart, setQueryStart] = useState(`${new Date().getFullYear()}-01-01`);
  const [queryEnd, setQueryEnd] = useState(new Date().toISOString().slice(0, 10));
  const [queryType, setQueryType] = useState('all');
  const [querying, setQuerying] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);

  const allCategories = [...DEFAULT_CATEGORIES, ...customCategories];

  const fetchCodes = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('nomenclature_codes').select('*').eq('user_id', user.id).order('code');
    if (!error && data) {
      setCodes(data.map(d => ({ ...d, netto_amount: (d as any).netto_amount ?? 0 })));
      const existingCats = [...new Set(data.map(c => c.category))];
      const custom = existingCats.filter(c => !DEFAULT_CATEGORIES.includes(c));
      setCustomCategories(prev => [...new Set([...prev, ...custom])]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchCodes(); }, [user]);

  useEffect(() => {
    if (!queryCode && codes.length > 0) setQueryCode(codes[0].code);
  }, [codes, queryCode]);

  const addCode = async () => {
    if (!user || !newCode.trim()) return;
    setAdding(true);
    const { error } = await supabase.from('nomenclature_codes').insert({
      user_id: user.id,
      code: newCode.trim(),
      description: newDesc.trim(),
      category: newCategory,
      netto_amount: parseFloat(newNettoAmount) || 0,
    } as any);
    if (error) {
      toast({ title: 'Fout', description: error.message.includes('duplicate') ? 'Deze code bestaat al.' : error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Code toegevoegd' });
      setNewCode(''); setNewDesc(''); setNewCategory('algemeen'); setNewNettoAmount('');
      fetchCodes();
      bumpDataVersion();
    }
    setAdding(false);
  };

  const deleteCode = async (id: string) => {
    const { error } = await supabase.from('nomenclature_codes').delete().eq('id', id);
    if (!error) { setCodes(prev => prev.filter(c => c.id !== id)); toast({ title: 'Code verwijderd' }); bumpDataVersion(); }
  };

  const openEditDialog = (code: NomenclatureCode) => {
    setEditingCode(code);
    setEditCode(code.code);
    setEditDesc(code.description);
    setEditCategory(code.category);
    setEditNettoAmount(String(code.netto_amount || ''));
    setEditDialogOpen(true);
  };

  const saveEdit = async () => {
    if (!editingCode || !editCode.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('nomenclature_codes').update({
      code: editCode.trim(),
      description: editDesc.trim(),
      category: editCategory,
      netto_amount: parseFloat(editNettoAmount) || 0,
    } as any).eq('id', editingCode.id);
    if (error) {
      toast({ title: 'Fout', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Code bijgewerkt' });
      setEditDialogOpen(false);
      fetchCodes();
      bumpDataVersion();
    }
    setSaving(false);
  };

  const addCustomCategory = () => {
    const cat = newCustomCategory.trim().toLowerCase();
    if (!cat || allCategories.includes(cat)) {
      toast({ title: 'Fout', description: cat ? 'Categorie bestaat al.' : 'Voer een naam in.', variant: 'destructive' });
      return;
    }
    setCustomCategories(prev => [...prev, cat]);
    setNewCustomCategory('');
    toast({ title: 'Categorie toegevoegd' });
  };

  const removeCustomCategory = (cat: string) => {
    const usedBy = codes.filter(c => c.category === cat);
    if (usedBy.length > 0) {
      toast({ title: 'Kan niet verwijderen', description: `Categorie "${cat}" wordt gebruikt door ${usedBy.length} code(s).`, variant: 'destructive' });
      return;
    }
    setCustomCategories(prev => prev.filter(c => c !== cat));
    toast({ title: 'Categorie verwijderd' });
  };

  const runNomenclatureQuery = async () => {
    if (!user || !queryCode || !queryStart || !queryEnd) return;
    if (queryStart > queryEnd) {
      toast({ title: 'Periode ongeldig', description: 'De startdatum moet voor de einddatum liggen.', variant: 'destructive' });
      return;
    }

    setQuerying(true);
    let query = supabase.from('income_records')
      .select('id, record_date, income_type, quantity, netto, total_amount, description')
      .eq('user_id', user.id)
      .eq('nomenclature_code', queryCode)
      .gte('record_date', queryStart)
      .lte('record_date', queryEnd)
      .order('record_date', { ascending: true });

    if (queryType !== 'all') query = query.eq('income_type', queryType);
    const { data, error } = await query;
    setQuerying(false);

    if (error) {
      toast({ title: 'Query mislukt', description: error.message, variant: 'destructive' });
      return;
    }

    const rows = ((data as QueryResult['rows']) || []).map((row) => ({
      ...row,
      quantity: Number(row.quantity || 0),
      netto: Number(row.netto || 0),
      total_amount: Number(row.total_amount || 0),
    }));
    const codeInfo = codes.find((item) => item.code === queryCode);
    setQueryResult({
      code: queryCode,
      description: codeInfo?.description || rows[0]?.description || queryCode,
      recordCount: rows.length,
      totalQuantity: rows.reduce((sum, row) => sum + (row.quantity || 0), 0),
      totalNetto: rows.reduce((sum, row) => sum + row.netto, 0),
      totalAmount: rows.reduce((sum, row) => sum + row.total_amount, 0),
      firstDate: rows[0]?.record_date || '',
      lastDate: rows[rows.length - 1]?.record_date || '',
      rows,
    });
  };

  const groupedCodes = allCategories.reduce((acc, cat) => {
    const items = codes.filter(c => c.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {} as Record<string, NomenclatureCode[]>);

  const fmt = (v: number) => v.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR' });

  const exportCSV = () => {
    const esc = (v: string) => /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const fmtNum = (v: number) =>
      (v ?? 0).toLocaleString('de-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sorted = [...codes].sort((a, b) =>
      a.category.localeCompare(b.category) || a.code.localeCompare(b.code),
    );
    const header = ['Code', 'Omschrijving', 'Categorie', 'Netto bedrag (EUR)'];
    const lines = [
      `# Nomenclatuur export`,
      `# Geëxporteerd: ${new Date().toLocaleString('nl-BE')}`,
      `# Aantal codes: ${sorted.length}`,
      header.map(esc).join(';'),
      ...sorted.map(c => [c.code, c.description || '', c.category, fmtNum(c.netto_amount)].map(esc).join(';')),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nomenclatuur_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'CSV geëxporteerd', description: `${sorted.length} codes` });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nomenclatuurbeheer</h1>
          <p className="text-muted-foreground mt-1">Beheer je RIZIV nomenclatuurcodes en categorieën.</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button variant="outline" className="w-full sm:w-auto" onClick={exportCSV} disabled={codes.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setCategoryDialogOpen(true)}>
            <Tag className="h-4 w-4 mr-2" />
            Categorieën Beheren
          </Button>
        </div>
      </div>

      

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-base">Nieuwe Code Toevoegen</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs">RIZIV Code</Label>
              <Input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="bv. 350372" className="w-32 font-mono" />
            </div>
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <Label className="text-xs">Omschrijving</Label>
              <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="bv. Raadpleging oncologie" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categorie</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allCategories.map(cat => (
                    <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Netto Bedrag (€)</Label>
              <Input type="number" step="0.01" value={newNettoAmount} onChange={e => setNewNettoAmount(e.target.value)} placeholder="0,00" className="w-28" />
            </div>
            <Button onClick={addCode} disabled={adding || !newCode.trim()}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Toevoegen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" /> Prestatie-query</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_0.8fr_0.8fr_0.8fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Nomenclatuurcode</Label>
              <Select value={queryCode} onValueChange={setQueryCode}>
                <SelectTrigger><SelectValue placeholder="Kies code" /></SelectTrigger>
                <SelectContent>
                  {codes.map(code => (
                    <SelectItem key={code.id} value={code.code}>{code.code} · {code.description || 'Geen omschrijving'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Van</Label>
              <Input type="date" value={queryStart} onChange={e => setQueryStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tot</Label>
              <Input type="date" value={queryEnd} onChange={e => setQueryEnd(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={queryType} onValueChange={setQueryType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle types</SelectItem>
                  <SelectItem value="ambulatory">Ambulant</SelectItem>
                  <SelectItem value="hospitalized">Hospitalisatie</SelectItem>
                  <SelectItem value="associatie">Associatie</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={runNomenclatureQuery} disabled={querying || codes.length === 0 || !queryCode}>
              {querying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Query
            </Button>
          </div>

          {queryResult && (
            <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{queryResult.code} · {queryResult.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {queryResult.firstDate && queryResult.lastDate ? `${queryResult.firstDate} tot ${queryResult.lastDate}` : 'Geen prestaties gevonden in deze periode'}
                  </p>
                </div>
                <Badge variant="secondary">{queryResult.totalQuantity.toLocaleString('nl-BE')} prestaties</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <MiniMetric label="Aantal prestaties" value={queryResult.totalQuantity.toLocaleString('nl-BE')} />
                <MiniMetric label="Records" value={String(queryResult.recordCount)} />
                <MiniMetric label="Netto" value={fmt(queryResult.totalNetto)} />
                <MiniMetric label="Bruto" value={fmt(queryResult.totalAmount)} />
              </div>
              {queryResult.rows.length > 0 && (
                <div className="max-h-72 overflow-auto rounded-md border border-border/60 bg-background">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Datum</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Type</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Aantal</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Netto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queryResult.rows.map(row => (
                        <tr key={row.id} className="border-b border-border/20">
                          <td className="py-2 px-3">{row.record_date}</td>
                          <td className="py-2 px-3 capitalize">{typeLabel(row.income_type)}</td>
                          <td className="py-2 px-3 text-right font-mono">{row.quantity.toLocaleString('nl-BE')}</td>
                          <td className="py-2 px-3 text-right font-mono">{fmt(row.netto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-base">Jouw Codes ({codes.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : codes.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Nog geen nomenclatuurcodes. Voeg er hierboven een toe of upload een screenshot.</p>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedCodes).map(([category, items]) => (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="capitalize text-xs">{category}</Badge>
                    <span className="text-xs text-muted-foreground">{items.length} code{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Code</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Omschrijving</th>
                          <th className="text-right py-2 px-3 font-medium text-muted-foreground">Netto</th>
                          <th className="py-2 px-3 w-20"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(c => (
                          <tr key={c.id} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                            <td className="py-2.5 px-3 font-mono text-xs">{c.code}</td>
                            <td className="py-2.5 px-3">{c.description || '—'}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs">{c.netto_amount ? fmt(c.netto_amount) : '—'}</td>
                            <td className="py-2.5 px-3">
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(c)}>
                                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteCode(c.id)}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Code Bewerken</DialogTitle>
            <DialogDescription>Pas de code, omschrijving, categorie en het netto bedrag aan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>RIZIV Code</Label>
              <Input value={editCode} onChange={e => setEditCode(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Omschrijving</Label>
              <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Categorie</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allCategories.map(cat => (
                    <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Netto Bedrag (€)</Label>
              <Input type="number" step="0.01" value={editNettoAmount} onChange={e => setEditNettoAmount(e.target.value)} placeholder="0,00" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Annuleren</Button>
            <Button onClick={saveEdit} disabled={saving || !editCode.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Opslaan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Categorieën Beheren</DialogTitle>
            <DialogDescription>Bekijk standaardcategorieën en voeg eigen categorieën toe.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Standaard categorieën</Label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_CATEGORIES.map(cat => (
                  <Badge key={cat} variant="secondary" className="capitalize">{cat}</Badge>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Aangepaste categorieën</Label>
              {customCategories.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen aangepaste categorieën.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {customCategories.map(cat => (
                    <Badge key={cat} variant="outline" className="capitalize gap-1 pr-1">
                      {cat}
                      <button onClick={() => removeCustomCategory(cat)} className="ml-1 hover:text-destructive transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newCustomCategory}
                onChange={e => setNewCustomCategory(e.target.value)}
                placeholder="Nieuwe categorienaam"
                onKeyDown={e => e.key === 'Enter' && addCustomCategory()}
              />
              <Button onClick={addCustomCategory} size="sm">
                <Plus className="h-4 w-4 mr-1" /> Toevoegen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function typeLabel(type: string) {
  if (type === 'ambulatory') return 'Ambulant';
  if (type === 'hospitalized') return 'Hospitalisatie';
  if (type === 'associatie') return 'Associatie';
  return type || '-';
}
