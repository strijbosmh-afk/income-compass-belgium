import { useState, useMemo } from 'react';
import type { ExtractedRecord } from '@/pages/UploadPage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, X, Trash2, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  records: ExtractedRecord[];
  onSave: (records: ExtractedRecord[]) => void;
  onCancel: () => void;
}

// Tolerantie voor afrondingsverschillen (€0,02 cent).
const TOLERANCE = 0.02;

export function ExtractedDataReview({ records: initialRecords, onSave, onCancel }: Props) {
  // Bewaar bedragen EXACT zoals door de AI uit de screenshot gehaald — niet herberekenen.
  const [records, setRecords] = useState<ExtractedRecord[]>(initialRecords);

  const updateRecord = (idx: number, field: keyof ExtractedRecord, value: any) => {
    setRecords((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const removeRecord = (idx: number) => {
    setRecords(prev => prev.filter((_, i) => i !== idx));
  };

  // Bereken per record de verificatie: netto moet = aandeel - bouwfonds - mif zijn.
  // Daarnaast: quantity × unit_amount moet ≈ total_amount zijn (sanity-check).
  const flags = useMemo(() => records.map(r => {
    const computed = Math.round(((r.aandeel_arts || 0) - (r.bouwfonds || 0) - (r.mif || 0)) * 100) / 100;
    const diff = Math.round(((r.netto || 0) - computed) * 100) / 100;
    const expectedTotal = Math.round((r.quantity || 0) * (r.unit_amount || 0) * 100) / 100;
    const qtyDiff = Math.round(((r.total_amount || 0) - expectedTotal) * 100) / 100;
    const qtyOk = !(r.unit_amount > 0 && r.total_amount > 0) || Math.abs(qtyDiff) <= Math.max(0.05, (r.total_amount || 0) * 0.02);
    return { computed, diff, ok: Math.abs(diff) <= TOLERANCE, qtyOk, expectedTotal, qtyDiff };
  }), [records]);

  const totalIssues = flags.filter(f => !f.ok).length;
  const totalQtyIssues = flags.filter(f => !f.qtyOk).length;
  const totals = useMemo(() => ({
    bruto: records.reduce((s, r) => s + (Number(r.total_amount) || 0), 0),
    netto: records.reduce((s, r) => s + (Number(r.netto) || 0), 0),
  }), [records]);

  const fmt = (v: number) => `€${v.toLocaleString('de-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Card className="border-border/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Geëxtraheerde Data Controleren</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Bedragen komen 1‑op‑1 uit de screenshot. Vergelijk netto/bruto met het origineel vóór opslaan.
          </p>
        </div>
        <div className="text-right space-y-0.5">
          <p className="text-xs text-muted-foreground">{records.length} record(s) — Bruto {fmt(totals.bruto)} · Netto {fmt(totals.netto)}</p>
          {totalIssues > 0 && (
            <p className="text-xs text-destructive flex items-center gap-1 justify-end">
              <AlertTriangle className="h-3 w-3" /> {totalIssues} regel(s) met netto‑verschil
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="py-2 px-2 w-6"></th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Datum</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Type</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">RIZIV</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Omschrijving</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Aantal</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Eenheid €</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Totaal €</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Arts €</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Bouwf. €</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">MIF €</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Netto €</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, idx) => {
                const f = flags[idx];
                return (
                  <tr key={idx} className={`border-b border-border/30 hover:bg-muted/30 transition-colors ${!f.ok ? 'bg-destructive/5' : ''}`}>
                    <td className="py-2 px-2 text-center">
                      {f.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                      ) : (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle className="h-3.5 w-3.5 text-destructive inline" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">
                                Netto ({fmt(r.netto)}) ≠ arts − bouwfonds − MIF ({fmt(f.computed)})<br />
                                Verschil: {fmt(f.diff)}<br />
                                Controleer tegen de screenshot.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      <Input type="date" value={r.record_date} onChange={e => updateRecord(idx, 'record_date', e.target.value)} className="h-8 text-xs w-32" />
                    </td>
                    <td className="py-2 px-2">
                      <Select value={r.income_type} onValueChange={v => updateRecord(idx, 'income_type', v)}>
                        <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ambulatory">Ambulant</SelectItem>
                          <SelectItem value="hospitalized">Gehospitaliseerd</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-2">
                      <Input value={r.nomenclature_code} onChange={e => updateRecord(idx, 'nomenclature_code', e.target.value)} className="h-8 text-xs font-mono w-24" />
                    </td>
                    <td className="py-2 px-2">
                      <Input value={r.description} onChange={e => updateRecord(idx, 'description', e.target.value)} className="h-8 text-xs w-36" />
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1 justify-end">
                        {!f.qtyOk && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">
                                  Aantal × eenheid ({fmt(f.expectedTotal)}) ≠ totaal ({fmt(r.total_amount)}).<br />
                                  Verwacht aantal: {r.unit_amount > 0 ? Math.round(r.total_amount / r.unit_amount) : '?'}.<br />
                                  Controleer tegen de screenshot.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <Input type="number" value={r.quantity} onChange={e => updateRecord(idx, 'quantity', parseInt(e.target.value) || 0)} className={`h-8 text-xs w-14 text-right ${!f.qtyOk ? 'border-amber-500' : ''}`} />
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <Input type="number" step="0.01" value={r.unit_amount} onChange={e => updateRecord(idx, 'unit_amount', parseFloat(e.target.value) || 0)} className="h-8 text-xs w-20 text-right" />
                    </td>
                    <td className="py-2 px-2">
                      <Input type="number" step="0.01" value={r.total_amount} onChange={e => updateRecord(idx, 'total_amount', parseFloat(e.target.value) || 0)} className="h-8 text-xs w-20 text-right font-medium" />
                    </td>
                    <td className="py-2 px-2">
                      <Input type="number" step="0.01" value={r.aandeel_arts} onChange={e => updateRecord(idx, 'aandeel_arts', parseFloat(e.target.value) || 0)} className="h-8 text-xs w-20 text-right" />
                    </td>
                    <td className="py-2 px-2">
                      <Input type="number" step="0.01" value={r.bouwfonds} onChange={e => updateRecord(idx, 'bouwfonds', parseFloat(e.target.value) || 0)} className="h-8 text-xs w-20 text-right" />
                    </td>
                    <td className="py-2 px-2">
                      <Input type="number" step="0.01" value={r.mif} onChange={e => updateRecord(idx, 'mif', parseFloat(e.target.value) || 0)} className="h-8 text-xs w-20 text-right" />
                    </td>
                    <td className="py-2 px-2">
                      <Input type="number" step="0.01" value={r.netto} onChange={e => updateRecord(idx, 'netto', parseFloat(e.target.value) || 0)} className={`h-8 text-xs w-20 text-right font-medium ${!f.ok ? 'border-destructive' : ''}`} />
                    </td>
                    <td className="py-2 px-2">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRecord(idx)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalIssues > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Opslaan geblokkeerd — {totalIssues} regel(s) wijken af.</p>
              <p className="mt-0.5 text-destructive/80">
                Voor elke regel moet netto gelijk zijn aan <span className="font-mono">aandeel arts − bouwfonds − MIF</span> (tolerantie €0,02). Corrigeer de afwijkende waarden tegen de screenshot of verwijder de regel(s) vóór je kan opslaan.
              </p>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel}><X className="h-4 w-4 mr-1" />Verwijderen</Button>
          <Button
            onClick={() => onSave(records)}
            disabled={records.length === 0 || totalIssues > 0}
            title={totalIssues > 0 ? 'Corrigeer eerst de afwijkende regels' : undefined}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Opslaan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
