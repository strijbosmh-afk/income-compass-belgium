import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { bumpDataVersion } from '@/hooks/useDataVersion';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

type EmergencyShiftRecord = {
  id: string;
  month: number;
  year: number;
  netto: number;
  record_date: string;
  created_at: string;
};

const MONTH_NAMES = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
const EMERGENCY_SHIFT_CODE = 'SPOEDWACHT';

const fmt = (value: number) => `EUR ${value.toLocaleString('de-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function EmergencyShiftsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [records, setRecords] = useState<EmergencyShiftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

  const loadRecords = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('income_records')
      .select('id, month, year, netto, record_date, created_at')
      .eq('user_id', user.id)
      .eq('nomenclature_code', EMERGENCY_SHIFT_CODE)
      .order('record_date', { ascending: false })
      .order('created_at', { ascending: false });
    setLoading(false);

    if (error) {
      toast({ title: 'Fout', description: error.message, variant: 'destructive' });
      return;
    }
    setRecords((data || []) as EmergencyShiftRecord[]);
  };

  useEffect(() => {
    loadRecords();
  }, [user]);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, index) => current - 2 + index);
  }, []);

  const total = records.reduce((sum, record) => sum + Number(record.netto || 0), 0);
  const yearTotal = records
    .filter(record => record.year === Number(selectedYear))
    .reduce((sum, record) => sum + Number(record.netto || 0), 0);

  const parseAmount = () => {
    const normalized = amount.replace(/\s/g, '').replace(',', '.');
    const value = Number(normalized);
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : NaN;
  };

  const addShift = async () => {
    if (!user || saving) return;
    const value = parseAmount();
    if (!Number.isFinite(value) || value <= 0) {
      toast({ title: 'Ongeldig bedrag', description: 'Vul een positief bedrag in.', variant: 'destructive' });
      return;
    }

    const month = Number(selectedMonth);
    const year = Number(selectedYear);
    const recordDate = `${year}-${String(month).padStart(2, '0')}-01`;
    setSaving(true);

    const { data: existing, error: findError } = await supabase
      .from('income_records')
      .select('id, quantity, total_amount, aandeel_arts, netto')
      .eq('user_id', user.id)
      .eq('income_type', 'ambulatory')
      .eq('record_date', recordDate)
      .eq('nomenclature_code', EMERGENCY_SHIFT_CODE)
      .maybeSingle();

    let error = findError;
    if (!error && existing) {
      const nextTotal = Math.round((Number(existing.netto || 0) + value) * 100) / 100;
      const nextQuantity = Number(existing.quantity || 1) + 1;
      const updateResult = await supabase
        .from('income_records')
        .update({
          quantity: nextQuantity,
          unit_amount: Math.round((nextTotal / nextQuantity) * 100) / 100,
          total_amount: nextTotal,
          aandeel_arts: nextTotal,
          netto: nextTotal,
        })
        .eq('id', existing.id)
        .eq('user_id', user.id);
      error = updateResult.error;
    } else if (!error) {
      const insertResult = await supabase.from('income_records').insert({
        user_id: user.id,
        income_type: 'ambulatory',
        record_date: recordDate,
        month,
        year,
        nomenclature_code: EMERGENCY_SHIFT_CODE,
        description: 'Spoedwacht',
        quantity: 1,
        unit_amount: value,
        total_amount: value,
        aandeel_arts: value,
        bouwfonds: 0,
        mif: 0,
        netto: value,
      });
      error = insertResult.error;
    }
    setSaving(false);

    if (error) {
      toast({ title: 'Fout bij toevoegen', description: error.message, variant: 'destructive' });
      return;
    }

    setAmount('');
    toast({
      title: existing ? 'Spoedwacht bijgeteld' : 'Spoedwacht toegevoegd',
      description: `${MONTH_NAMES[month - 1]} ${year} - ${fmt(value)}`,
    });
    bumpDataVersion();
    loadRecords();
  };

  const deleteShift = async (id: string) => {
    if (!user) return;
    const { error } = await supabase
      .from('income_records')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('nomenclature_code', EMERGENCY_SHIFT_CODE);

    if (error) {
      toast({ title: 'Fout bij verwijderen', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Spoedwacht verwijderd' });
    bumpDataVersion();
    loadRecords();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Spoedwachten</h1>
          <p className="mt-1 text-muted-foreground">Voeg manuele zomerwachten toe aan je cumulatief netto overzicht.</p>
        </div>
        <div className="rounded-md border border-border bg-card px-4 py-3 text-sm">
          <p className="text-muted-foreground">Totaal geregistreerd</p>
          <p className="text-lg font-semibold">{fmt(total)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" />
              Nieuwe spoedwacht
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm text-muted-foreground">Maand</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((name, index) => (
                      <SelectItem key={name} value={String(index + 1)}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Jaar</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="shift-amount" className="text-sm text-muted-foreground">Bedrag</Label>
              <Input
                id="shift-amount"
                inputMode="decimal"
                placeholder="Bijv. 450,00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addShift();
                }}
                className="mt-1"
              />
            </div>
            <Button onClick={addShift} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Toevoegen
            </Button>
            <p className="text-xs text-muted-foreground">
              Spoedwachten worden opgeslagen als netto inkomsten met code {EMERGENCY_SHIFT_CODE} en tellen automatisch mee in dashboards en rapporten.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Overzicht</CardTitle>
            <p className="text-sm text-muted-foreground">{selectedYear}: {fmt(yearTotal)}</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : records.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Nog geen spoedwachten geregistreerd.
              </div>
            ) : (
              <div className="space-y-2">
                {records.map((record) => (
                  <div key={record.id} className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-card px-3 py-2">
                    <div>
                      <p className="font-medium">{MONTH_NAMES[record.month - 1]} {record.year}</p>
                      <p className="text-xs text-muted-foreground">Prestatiemaand</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-right font-semibold">{fmt(Number(record.netto || 0))}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Spoedwacht verwijderen"
                        onClick={() => deleteShift(record.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
