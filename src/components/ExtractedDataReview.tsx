import { useState, useMemo, useEffect, useRef } from 'react';
import type { ExtractedRecord } from '@/pages/UploadPage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, X, Trash2, AlertTriangle, Copy } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  records: ExtractedRecord[];
  unitNettoByCode?: Record<string, number>;
  onSave: (records: ExtractedRecord[]) => void;
  onCancel: () => void;
}

// Tolerantie voor afrondingsverschillen (€0,02 cent).
const TOLERANCE = 0.02;

export function ExtractedDataReview({ records: initialRecords, unitNettoByCode = {}, onSave, onCancel }: Props) {
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
  const flags = useMemo(() => records.map((r, idx) => {
    const computed = Math.round(((r.aandeel_arts || 0) - (r.bouwfonds || 0) - (r.mif || 0)) * 100) / 100;
    const diff = Math.round(((r.netto || 0) - computed) * 100) / 100;
    const expectedTotal = Math.round((r.quantity || 0) * (r.unit_amount || 0) * 100) / 100;
    const qtyDiff = Math.round(((r.total_amount || 0) - expectedTotal) * 100) / 100;
    const tol = Math.max(0.05, (r.total_amount || 0) * 0.02);

    const code = String(r.nomenclature_code || '').trim();
    const knownUnit = unitNettoByCode[code]; // unit-netto uit nomenclatuurbeheer

    // PRIMAIRE check (autoritatief): netto / known_unit_netto moet integer ≥ 1 geven.
    let nomenclatureExpectedQty: number | null = null;
    let nomenclatureOk = true;
    if (knownUnit && knownUnit > 0 && r.netto > 0) {
      const derived = Math.round(r.netto / knownUnit);
      const expectedNetto = derived * knownUnit;
      const nettoTol = Math.max(0.05 * Math.max(derived, 1), r.netto * 0.02);
      if (derived >= 1 && Math.abs(expectedNetto - r.netto) <= nettoTol) {
        nomenclatureExpectedQty = derived;
        nomenclatureOk = derived === r.quantity;
      } else {
        // netto deelt niet netjes door known unit → markeren als verdacht
        nomenclatureOk = false;
      }
    }

    // SECUNDAIRE check (fallback wanneer geen known unit): qty × unit_amount ≈ total_amount.
    const localQtyOk = !(r.unit_amount > 0 && r.total_amount > 0) || Math.abs(qtyDiff) <= tol;
    const qtyOk = knownUnit ? nomenclatureOk : localQtyOk;

    // Suggestie opbouwen
    let suggestion: { qty: number; unit: number } | null = null;
    if (!qtyOk) {
      // 1) Voorkeur: gebruik nomenclatuur unit-netto.
      if (nomenclatureExpectedQty !== null && knownUnit) {
        suggestion = { qty: nomenclatureExpectedQty, unit: knownUnit };
      } else if (r.total_amount > 0) {
        // 2) Fallback: zoek gedeelde-unit met peers.
        const peers = records
          .map((p, i) => ({ p, i }))
          .filter(({ p, i }) => i !== idx && String(p.nomenclature_code || '').trim() === code);
        for (let k = 2; k <= 10; k++) {
          const candidateUnit = Math.round((r.total_amount / k) * 100) / 100;
          if (candidateUnit <= 0) continue;
          const matches = peers.some(({ p }) => {
            const ptol = Math.max(0.05, (p.total_amount || 0) * 0.02);
            if (p.unit_amount > 0 && Math.abs(p.unit_amount - candidateUnit) <= Math.max(0.05, p.unit_amount * 0.02)) return true;
            if (p.total_amount > 0) {
              const di = Math.round(p.total_amount / candidateUnit);
              return di >= 1 && Math.abs(di * candidateUnit - p.total_amount) <= ptol;
            }
            return false;
          });
          if (matches) { suggestion = { qty: k, unit: candidateUnit }; break; }
        }
        // 3) Laatste fallback: enkel qty herberekenen via huidige unit.
        if (!suggestion && r.unit_amount > 0) {
          const di = Math.round(r.total_amount / r.unit_amount);
          if (di >= 1 && di !== r.quantity && Math.abs(di * r.unit_amount - r.total_amount) <= tol) {
            suggestion = { qty: di, unit: r.unit_amount };
          }
        }
      }
    }

    return {
      computed, diff, ok: Math.abs(diff) <= TOLERANCE,
      qtyOk, expectedTotal, qtyDiff,
      suggestion,
      nomenclatureExpectedQty,
      knownUnit: knownUnit ?? null,
    };
  }), [records, unitNettoByCode]);

  const applySuggestion = (idx: number) => {
    const s = flags[idx]?.suggestion;
    if (!s) return;
    setRecords(prev => prev.map((r, i) => i === idx ? { ...r, quantity: s.qty, unit_amount: s.unit } : r));
  };

  // Detecteer dubbel-geschatte rijen: binnen dezelfde nomenclatuurcode (en zelfde maand)
  // — typisch bij associatie — bestaat soms een "Totaal"-rij plus individuele arts-rijen
  // die samen exact dat totaal vormen. De individuele rijen zijn dan dubbel geteld.
  // Heuristiek: voor elke code-groep, zoek een rij R waarvan total_amount ≈ som van
  // (één of meer) andere rijen in dezelfde groep. Die andere rijen worden als duplicate
  // gemarkeerd (R blijft als waarheid van de Totaal-rij).
  const duplicateIdx = useMemo(() => {
    const dups = new Set<number>();
    const groups = new Map<string, number[]>();
    records.forEach((r, i) => {
      const key = `${String(r.nomenclature_code || '').trim()}|${r.year}-${r.month}|${r.income_type}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(i);
    });
    for (const idxs of groups.values()) {
      if (idxs.length < 2) continue;
      // Sorteer aflopend op total_amount — grootste is kandidaat-Totaal.
      const sorted = [...idxs].sort((a, b) => (records[b].total_amount || 0) - (records[a].total_amount || 0));
      for (const parent of sorted) {
        const parentTotal = records[parent].total_amount || 0;
        if (parentTotal <= 0) continue;
        const others = idxs.filter(i => i !== parent && !dups.has(i));
        if (others.length === 0) continue;
        const sumOthers = others.reduce((s, i) => s + (records[i].total_amount || 0), 0);
        const tol = Math.max(0.05, parentTotal * 0.02);
        // Volledige som matcht → alle andere rijen zijn dubbels.
        if (Math.abs(sumOthers - parentTotal) <= tol) {
          others.forEach(i => dups.add(i));
          continue;
        }
        // Of: één losse rij heeft exact dezelfde total → ook dubbel.
        for (const o of others) {
          const ot = records[o].total_amount || 0;
          if (ot > 0 && Math.abs(ot - parentTotal) <= tol) dups.add(o);
        }
      }
    }
    return dups;
  }, [records]);

  const removeAllDuplicates = () => {
    setRecords(prev => prev.filter((_, i) => !duplicateIdx.has(i)));
  };

  const totalIssues = flags.filter(f => !f.ok).length;
  const totalQtyIssues = flags.filter(f => !f.qtyOk).length;
  const totals = useMemo(() => ({
    bruto: records.reduce((s, r, i) => s + (duplicateIdx.has(i) ? 0 : (Number(r.total_amount) || 0)), 0),
    netto: records.reduce((s, r, i) => s + (duplicateIdx.has(i) ? 0 : (Number(r.netto) || 0)), 0),
  }), [records, duplicateIdx]);

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
        {duplicateIdx.size > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            <Copy className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{duplicateIdx.size} vermoedelijk dubbel-geschatte rij(en) gedetecteerd.</p>
              <p className="mt-0.5 opacity-80">
                Eén rij per code bevat het Totaal-bedrag, en de overige rijen met dezelfde code tellen samen exact tot dat totaal — typisch wanneer per ongeluk individuele arts-rijen én een Totaal-rij geëxtraheerd worden. De gemarkeerde rijen zijn al uit de bruto/netto-totalen gehaald; verwijder ze vóór opslaan.
              </p>
              <button
                type="button"
                onClick={removeAllDuplicates}
                className="mt-2 inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/20 px-2 py-1 font-medium hover:bg-amber-500/30"
              >
                <Trash2 className="h-3 w-3" /> Verwijder alle dubbele rijen ({duplicateIdx.size})
              </button>
            </div>
          </div>
        )}
        {records.some(r => r.income_type === 'associatie') && (
          <div className="rounded-md border border-accent/40 bg-accent/5 p-3 text-xs">
            <p className="font-medium">Associatie-regel(s) gedetecteerd</p>
            <p className="mt-0.5 text-muted-foreground">
              Bedragen hieronder zijn nog de volledige pool-bedragen uit de screenshot. Bij opslaan worden ze automatisch gehalveerd — alleen het eigen aandeel (50%) komt in de database terecht.
            </p>
          </div>
        )}
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
                const isDup = duplicateIdx.has(idx);
                return (
                  <tr key={idx} className={`border-b border-border/30 hover:bg-muted/30 transition-colors ${isDup ? 'bg-amber-500/10 line-through opacity-60' : (!f.ok ? 'bg-destructive/5' : '')}`}>
                    <td className="py-2 px-2 text-center">
                      {isDup ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Copy className="h-3.5 w-3.5 text-amber-600 inline" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs max-w-xs">
                                Vermoedelijk dubbel-geschatte rij: deze code heeft al een Totaal-rij
                                waarvan het bedrag overeenkomt met de som van deze + andere rijen.
                                Wordt niet meegerekend in de totalen — verwijder vóór opslaan.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : f.ok ? (
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
                          <SelectItem value="associatie">Associatie</SelectItem>
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
                                  {f.knownUnit ? (
                                    <>Netto ({fmt(r.netto)}) ÷ unit-netto nomenclatuur ({fmt(f.knownUnit)}) = <span className="font-mono">{f.nomenclatureExpectedQty ?? '?'}</span>, niet {r.quantity}.<br /></>
                                  ) : (
                                    <>Aantal × eenheid ({fmt(f.expectedTotal)}) ≠ totaal ({fmt(r.total_amount)}).<br /></>
                                  )}
                                  {f.suggestion ? (
                                    <>Voorstel: <span className="font-mono">{f.suggestion.qty} × {fmt(f.suggestion.unit)}</span> = {fmt(f.suggestion.qty * f.suggestion.unit)}.<br /></>
                                  ) : null}
                                  Controleer tegen de screenshot.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <Input type="number" value={r.quantity} onChange={e => updateRecord(idx, 'quantity', parseInt(e.target.value) || 0)} className={`h-8 text-xs w-14 text-right ${!f.qtyOk ? 'border-amber-500' : ''}`} />
                      </div>
                      {!f.qtyOk && f.suggestion && (
                        <button
                          type="button"
                          onClick={() => applySuggestion(idx)}
                          className="mt-1 text-[10px] text-amber-700 dark:text-amber-400 underline hover:no-underline whitespace-nowrap"
                          title={`Pas ${f.suggestion.qty} × ${fmt(f.suggestion.unit)} toe`}
                        >
                          → {f.suggestion.qty}×{fmt(f.suggestion.unit)}
                        </button>
                      )}
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
        {totalQtyIssues > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{totalQtyIssues} regel(s) met verdacht aantal.</p>
              <p className="mt-0.5 opacity-80">
                Bij deze regels matcht <span className="font-mono">aantal × eenheid</span> niet met het totaal. Controleer het aantal tegen de screenshot — dit blokkeert opslaan niet, maar foute aantallen vertekenen de statistieken per nomenclatuur.
              </p>
              {flags.some(f => !f.qtyOk && f.suggestion) && (
                <button
                  type="button"
                  onClick={() => {
                    setRecords(prev => prev.map((r, i) => {
                      const s = flags[i]?.suggestion;
                      return (!flags[i]?.qtyOk && s) ? { ...r, quantity: s.qty, unit_amount: s.unit } : r;
                    }));
                  }}
                  className="mt-2 inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-medium hover:bg-amber-500/20"
                >
                  Pas alle voorstellen toe ({flags.filter(f => !f.qtyOk && f.suggestion).length})
                </button>
              )}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel}><X className="h-4 w-4 mr-1" />Verwijderen</Button>
          <Button
            onClick={() => onSave(records)}
            disabled={records.length === 0 || totalIssues > 0 || duplicateIdx.size > 0}
            title={duplicateIdx.size > 0 ? 'Verwijder eerst de gemarkeerde dubbele rijen' : (totalIssues > 0 ? 'Corrigeer eerst de afwijkende regels' : undefined)}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Opslaan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
