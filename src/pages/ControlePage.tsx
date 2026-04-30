import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ShieldCheck, AlertTriangle, Plus, Trash2, X, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useDataVersion, bumpDataVersion } from '@/hooks/useDataVersion';

type IncomeRow = {
  nomenclature_code: string;
  description: string | null;
  income_type: string;
  quantity: number;
  netto: number;
  total_amount: number;
};

type NomenclatureCode = {
  id: string;
  code: string;
  description: string;
  category: string;
  netto_amount: number;
};

type UnknownCode = {
  code: string;
  description: string;
  income_type: string;
  occurrences: number;
  totalQuantity: number;
  totalNetto: number;
  totalBruto: number;
  unitNetto: number;
  unitBruto: number;
  unitDerivation: 'gemeten' | 'geschat' | 'onbekend';
};

const fmt = (val: number) => `€${val.toLocaleString('de-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default function ControlePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const dataVersion = useDataVersion();

  const [records, setRecords] = useState<IncomeRow[]>([]);
  const [codes, setCodes] = useState<NomenclatureCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [editAmounts, setEditAmounts] = useState<Record<string, string>>({});
  const [editDescriptions, setEditDescriptions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      supabase.from('income_records')
        .select('nomenclature_code, description, income_type, quantity, netto, total_amount')
        .eq('user_id', user.id),
      supabase.from('nomenclature_codes')
        .select('id, code, description, category, netto_amount')
        .eq('user_id', user.id),
    ]).then(([r1, r2]) => {
      setRecords((r1.data as any) || []);
      setCodes((r2.data as any) || []);
      setLoading(false);
    });
  }, [user, dataVersion]);

  const usedCodes = useMemo(() => new Set(records.map(r => r.nomenclature_code)), [records]);
  const knownCodes = useMemo(() => new Set(codes.map(c => c.code)), [codes]);

  const ongebruikt = useMemo(
    () => codes.filter(c => !usedCodes.has(c.code)).sort((a, b) => a.code.localeCompare(b.code)),
    [codes, usedCodes]
  );

  const onbekend = useMemo<UnknownCode[]>(() => {
    const groups: Record<string, IncomeRow[]> = {};
    records.forEach(r => {
      if (knownCodes.has(r.nomenclature_code)) return;
      (groups[r.nomenclature_code] ??= []).push(r);
    });
    return Object.entries(groups).map(([code, rows]) => {
      const totalQuantity = rows.reduce((s, r) => s + (r.quantity || 0), 0);
      const totalNetto = rows.reduce((s, r) => s + (r.netto || 0), 0);
      const totalBruto = rows.reduce((s, r) => s + (r.total_amount || 0), 0);

      // Bereken eenheidsbedrag via mediaan van netto/quantity voor records met quantity > 0
      const unitNettos = rows.filter(r => r.quantity > 0).map(r => r.netto / r.quantity);
      const unitBrutos = rows.filter(r => r.quantity > 0).map(r => r.total_amount / r.quantity);

      let unitNetto = 0;
      let unitBruto = 0;
      let derivation: UnknownCode['unitDerivation'] = 'onbekend';

      if (unitNettos.length > 0) {
        unitNetto = median(unitNettos);
        unitBruto = median(unitBrutos);
        derivation = 'gemeten';
      } else if (rows.length === 1) {
        // Maar één record met quantity=0: ga ervan uit dat het 1 prestatie betreft
        unitNetto = rows[0].netto;
        unitBruto = rows[0].total_amount;
        derivation = 'geschat';
      }

      const description = rows.map(r => r.description).find(d => d && d.trim().length > 0) || '';
      const incomeType = rows[0].income_type;

      return {
        code,
        description,
        income_type: incomeType,
        occurrences: rows.length,
        totalQuantity,
        totalNetto,
        totalBruto,
        unitNetto: Math.round(unitNetto * 100) / 100,
        unitBruto: Math.round(unitBruto * 100) / 100,
        unitDerivation: derivation,
      };
    }).sort((a, b) => b.occurrences - a.occurrences);
  }, [records, knownCodes]);

  const ontbrekendBedrag = useMemo(
    () => codes.filter(c => usedCodes.has(c.code) && (!c.netto_amount || c.netto_amount === 0)).sort((a, b) => a.code.localeCompare(b.code)),
    [codes, usedCodes]
  );

  const visibleOnbekend = onbekend.filter(c => !skipped.has(c.code));
  const visibleOngebruikt = ongebruikt.filter(c => !skipped.has(c.code));
  const visibleOntbrekend = ontbrekendBedrag.filter(c => !skipped.has(c.code));

  const skip = (code: string) => {
    setSkipped(prev => { const s = new Set(prev); s.add(code); return s; });
    toast({ title: 'Overgeslagen', description: `Code ${code} blijft staan.` });
  };

  const addUnknownCode = async (item: UnknownCode) => {
    if (!user) return;
    const amountStr = editAmounts[item.code] ?? String(item.unitNetto);
    const descStr = editDescriptions[item.code] ?? item.description;
    const amount = parseFloat(amountStr.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Ongeldig bedrag', description: 'Vul een geldig netto-eenheidsbedrag in.', variant: 'destructive' });
      return;
    }
    setBusy(item.code);
    const { error } = await supabase.from('nomenclature_codes').insert({
      user_id: user.id,
      code: item.code,
      description: descStr || item.code,
      category: item.income_type === 'hospitalized' ? 'hospitalisatie' : 'ambulant',
      netto_amount: amount,
    } as any);
    setBusy(null);
    if (error) {
      toast({ title: 'Fout', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Toegevoegd', description: `Code ${item.code} aan nomenclatuurbeheer toegevoegd.` });
      bumpDataVersion();
    }
  };

  const updateAmount = async (code: NomenclatureCode, fallbackUnit?: number) => {
    const amountStr = editAmounts[code.code] ?? String(fallbackUnit ?? code.netto_amount);
    const amount = parseFloat(amountStr.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Ongeldig bedrag', description: 'Vul een geldig netto-eenheidsbedrag in.', variant: 'destructive' });
      return;
    }
    setBusy(code.code);
    const { error } = await supabase.from('nomenclature_codes')
      .update({ netto_amount: amount } as any)
      .eq('id', code.id);
    setBusy(null);
    if (error) {
      toast({ title: 'Fout', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Bedrag bijgewerkt', description: `${code.code}: ${fmt(amount)}` });
      bumpDataVersion();
    }
  };

  const deleteUnusedCode = async (code: NomenclatureCode) => {
    setBusy(code.code);
    const { error } = await supabase.from('nomenclature_codes').delete().eq('id', code.id);
    setBusy(null);
    if (error) {
      toast({ title: 'Fout', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Verwijderd', description: `Code ${code.code} verwijderd uit nomenclatuurbeheer.` });
      bumpDataVersion();
    }
  };

  // Auto-extract netto for ontbrekendBedrag (read-only computation per code)
  const ontbrekendUnitMap = useMemo(() => {
    const map: Record<string, { unit: number; derivation: 'gemeten' | 'geschat' | 'onbekend' }> = {};
    ontbrekendBedrag.forEach(c => {
      const rows = records.filter(r => r.nomenclature_code === c.code);
      const unitNettos = rows.filter(r => r.quantity > 0).map(r => r.netto / r.quantity);
      if (unitNettos.length > 0) {
        map[c.code] = { unit: Math.round(median(unitNettos) * 100) / 100, derivation: 'gemeten' };
      } else if (rows.length === 1 && rows[0].netto > 0) {
        map[c.code] = { unit: Math.round(rows[0].netto * 100) / 100, derivation: 'geschat' };
      } else {
        map[c.code] = { unit: 0, derivation: 'onbekend' };
      }
    });
    return map;
  }, [ontbrekendBedrag, records]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const totalIssues = visibleOnbekend.length + visibleOngebruikt.length + visibleOntbrekend.length;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Controle
          </h1>
          <p className="text-muted-foreground mt-1">Vergelijk nomenclatuurbeheer met de aangerekende codes in de records.</p>
        </div>
        {totalIssues === 0 ? (
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Alles in orde
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-destructive/10 text-destructive border-destructive/20">
            <AlertTriangle className="h-3.5 w-3.5 mr-1" /> {totalIssues} aandachtspunt{totalIssues === 1 ? '' : 'en'}
          </Badge>
        )}
      </div>

      <Tabs defaultValue="onbekend">
        <TabsList>
          <TabsTrigger value="onbekend">
            Onbekende codes {visibleOnbekend.length > 0 && <Badge variant="secondary" className="ml-2">{visibleOnbekend.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="ontbrekend">
            Ontbrekend bedrag {visibleOntbrekend.length > 0 && <Badge variant="secondary" className="ml-2">{visibleOntbrekend.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="ongebruikt">
            Ongebruikte codes {visibleOngebruikt.length > 0 && <Badge variant="secondary" className="ml-2">{visibleOngebruikt.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ONBEKEND */}
        <TabsContent value="onbekend" className="space-y-3 mt-4">
          {visibleOnbekend.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Geen onbekende codes — elke aangerekende code staat in nomenclatuurbeheer.</div>
          ) : (
            visibleOnbekend.map(item => (
              <Card key={item.code} className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-base">{item.code}</span>
                        <Badge variant="outline" className="text-xs">
                          {item.income_type === 'hospitalized' ? 'Hospitalisatie' : 'Ambulant'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {item.occurrences}× in records
                        </Badge>
                        <Badge variant="outline" className={`text-xs ${item.unitDerivation === 'gemeten' ? 'border-primary/30 text-primary' : item.unitDerivation === 'geschat' ? 'border-amber-500/30 text-amber-700' : 'border-destructive/30 text-destructive'}`}>
                          Bedrag: {item.unitDerivation}
                        </Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
                        <div>Bruto totaal: <span className="text-foreground font-medium">{fmt(item.totalBruto)}</span></div>
                        <div>Netto totaal: <span className="text-foreground font-medium">{fmt(item.totalNetto)}</span></div>
                        <div>Aantal: <span className="text-foreground font-medium">{item.totalQuantity || '—'}</span></div>
                        <div>Eenheid bruto: <span className="text-foreground font-medium">{fmt(item.unitBruto)}</span></div>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-2 md:items-center">
                      <Input
                        placeholder="Omschrijving"
                        defaultValue={item.description}
                        onChange={(e) => setEditDescriptions(prev => ({ ...prev, [item.code]: e.target.value }))}
                        className="md:w-44"
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">€</span>
                        <Input
                          type="number"
                          step="0.01"
                          defaultValue={item.unitNetto || ''}
                          onChange={(e) => setEditAmounts(prev => ({ ...prev, [item.code]: e.target.value }))}
                          className="w-28"
                          placeholder="Netto/stuk"
                        />
                      </div>
                      <Button size="sm" onClick={() => addUnknownCode(item)} disabled={busy === item.code}>
                        {busy === item.code ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Toevoegen
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => skip(item.code)}>
                        <X className="h-4 w-4" /> Overslaan
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ONTBREKEND BEDRAG */}
        <TabsContent value="ontbrekend" className="space-y-3 mt-4">
          {visibleOntbrekend.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Alle gebruikte codes hebben een netto-eenheidsbedrag.</div>
          ) : (
            visibleOntbrekend.map(c => {
              const auto = ontbrekendUnitMap[c.code];
              return (
                <Card key={c.code} className="border-border/50">
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-base">{c.code}</span>
                          <span className="text-sm text-muted-foreground">{c.description || '(geen omschrijving)'}</span>
                          <Badge variant="outline" className="text-xs capitalize">{c.category}</Badge>
                          <Badge variant="outline" className={`text-xs ${auto?.derivation === 'gemeten' ? 'border-primary/30 text-primary' : auto?.derivation === 'geschat' ? 'border-amber-500/30 text-amber-700' : 'border-destructive/30 text-destructive'}`}>
                            Voorstel: {auto?.derivation ?? 'onbekend'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Huidige eenheidsbedrag: <span className="text-foreground">{fmt(c.netto_amount || 0)}</span>
                          {auto && auto.unit > 0 && <> · Voorgesteld: <span className="text-foreground font-medium">{fmt(auto.unit)}</span></>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">€</span>
                        <Input
                          type="number"
                          step="0.01"
                          defaultValue={auto?.unit || ''}
                          onChange={(e) => setEditAmounts(prev => ({ ...prev, [c.code]: e.target.value }))}
                          className="w-28"
                          placeholder="Netto/stuk"
                        />
                        <Button size="sm" onClick={() => updateAmount(c, auto?.unit)} disabled={busy === c.code || !auto || auto.unit === 0}>
                          {busy === c.code ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Invullen
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => skip(c.code)}>
                          <X className="h-4 w-4" /> Overslaan
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ONGEBRUIKT */}
        <TabsContent value="ongebruikt" className="space-y-3 mt-4">
          {visibleOngebruikt.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Elke code in nomenclatuurbeheer wordt minstens één keer aangerekend.</div>
          ) : (
            visibleOngebruikt.map(c => (
              <Card key={c.code} className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-base">{c.code}</span>
                        <span className="text-sm text-muted-foreground">{c.description || '(geen omschrijving)'}</span>
                        <Badge variant="outline" className="text-xs capitalize">{c.category}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Eenheidsbedrag: {fmt(c.netto_amount || 0)} · Komt nergens voor in records.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="destructive" onClick={() => deleteUnusedCode(c)} disabled={busy === c.code}>
                        {busy === c.code ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Verwijderen
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => skip(c.code)}>
                        <X className="h-4 w-4" /> Behouden
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
