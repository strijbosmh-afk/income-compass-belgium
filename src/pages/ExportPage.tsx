import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, FileSpreadsheet, FileText, Download } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type IncomeRecord = {
  id: string;
  month: number;
  year: number;
  income_type: string;
  nomenclature_code: string;
  description: string | null;
  total_amount: number;
  aandeel_arts: number;
  bouwfonds: number;
  mif: number;
  netto: number;
  quantity: number;
  unit_amount: number;
  record_date: string;
};

type NomenclatureCode = {
  code: string;
  category: string;
  description: string;
};

const MONTH_NAMES = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];

const ALL_COLUMNS = [
  { key: 'record_date', label: 'Datum' },
  { key: 'month', label: 'Maand' },
  { key: 'year', label: 'Jaar' },
  { key: 'income_type', label: 'Type' },
  { key: 'nomenclature_code', label: 'Nomenclatuur' },
  { key: 'description', label: 'Omschrijving' },
  { key: 'quantity', label: 'Aantal' },
  { key: 'unit_amount', label: 'Eenheidsprijs' },
  { key: 'total_amount', label: 'Bruto' },
  { key: 'aandeel_arts', label: 'Aandeel Arts' },
  { key: 'bouwfonds', label: 'Bouwfonds' },
  { key: 'mif', label: 'MIF' },
  { key: 'netto', label: 'Netto' },
] as const;

const fmt = (val: number) => val.toLocaleString('de-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ExportPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<IncomeRecord[]>([]);
  const [nomenclatureCodes, setNomenclatureCodes] = useState<NomenclatureCode[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [monthFrom, setMonthFrom] = useState<string>('1');
  const [monthTo, setMonthTo] = useState<string>('12');
  const [incomeType, setIncomeType] = useState<string>('all');

  // Columns
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    ALL_COLUMNS.map(c => c.key)
  );

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('income_records').select('*').eq('user_id', user.id),
      supabase.from('nomenclature_codes').select('code, category, description').eq('user_id', user.id),
    ]).then(([recRes, nomRes]) => {
      setRecords(recRes.data || []);
      setNomenclatureCodes(nomRes.data || []);
      setLoading(false);
    });
  }, [user]);

  const years = useMemo(() => [...new Set(records.map(r => r.year))].sort((a, b) => b - a), [records]);

  const codeToLabel = useMemo(() => {
    const map: Record<string, string> = {};
    nomenclatureCodes.forEach(n => { map[n.code] = n.description ? `${n.code} – ${n.description}` : n.code; });
    return map;
  }, [nomenclatureCodes]);

  const filtered = useMemo(() => {
    let f = records.filter(r => String(r.year) === selectedYear);
    f = f.filter(r => r.month >= parseInt(monthFrom) && r.month <= parseInt(monthTo));
    if (incomeType !== 'all') f = f.filter(r => r.income_type === incomeType);
    return f.sort((a, b) => a.month - b.month || a.record_date.localeCompare(b.record_date));
  }, [records, selectedYear, monthFrom, monthTo, incomeType]);

  const toggleColumn = (key: string) => {
    setSelectedColumns(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const getDisplayValue = (record: IncomeRecord, key: string): string => {
    switch (key) {
      case 'income_type': return record.income_type === 'ambulatory' ? 'Ambulant' : 'Gehospitaliseerd';
      case 'nomenclature_code': return codeToLabel[record.nomenclature_code] || record.nomenclature_code;
      case 'month': return MONTH_NAMES[record.month - 1];
      case 'total_amount': case 'aandeel_arts': case 'bouwfonds': case 'mif': case 'netto': case 'unit_amount':
        return fmt(record[key as keyof IncomeRecord] as number);
      case 'description': return record.description || '';
      default: return String(record[key as keyof IncomeRecord] ?? '');
    }
  };

  const getRawValue = (record: IncomeRecord, key: string): string | number => {
    switch (key) {
      case 'income_type': return record.income_type === 'ambulatory' ? 'Ambulant' : 'Gehospitaliseerd';
      case 'nomenclature_code': return codeToLabel[record.nomenclature_code] || record.nomenclature_code;
      case 'month': return MONTH_NAMES[record.month - 1];
      case 'description': return record.description || '';
      case 'total_amount': case 'aandeel_arts': case 'bouwfonds': case 'mif': case 'netto': case 'unit_amount': case 'quantity':
        return record[key as keyof IncomeRecord] as number;
      default: return String(record[key as keyof IncomeRecord] ?? '');
    }
  };

  const periodLabel = `${MONTH_NAMES[parseInt(monthFrom) - 1]} – ${MONTH_NAMES[parseInt(monthTo) - 1]} ${selectedYear}`;
  const cols = ALL_COLUMNS.filter(c => selectedColumns.includes(c.key));

  const exportToExcel = () => {
    if (filtered.length === 0) { toast.error('Geen data om te exporteren'); return; }

    const headers = cols.map(c => c.label);
    const rows = filtered.map(r => cols.map(c => getRawValue(r, c.key)));

    // Add totals row for numeric columns
    const totalsRow = cols.map(c => {
      if (['total_amount', 'aandeel_arts', 'bouwfonds', 'mif', 'netto'].includes(c.key)) {
        return filtered.reduce((s, r) => s + (r[c.key as keyof IncomeRecord] as number), 0);
      }
      if (c.key === cols[0].key) return 'TOTAAL';
      return '';
    });

    const wsData = [headers, ...rows, [], totalsRow];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths
    ws['!cols'] = cols.map(c => ({
      wch: Math.max(c.label.length + 2, c.key.includes('amount') || c.key === 'netto' ? 14 : 12)
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inkomsten');
    XLSX.writeFile(wb, `inkomsten_${selectedYear}_${monthFrom}-${monthTo}.xlsx`);
    toast.success('Excel bestand gedownload');
  };

  const exportToPDF = () => {
    if (filtered.length === 0) { toast.error('Geen data om te exporteren'); return; }

    const doc = new jsPDF({ orientation: cols.length > 8 ? 'landscape' : 'portrait' });

    // Title
    doc.setFontSize(16);
    doc.text('Inkomstenrapport', 14, 20);
    doc.setFontSize(10);
    doc.text(periodLabel, 14, 28);
    doc.text(`Type: ${incomeType === 'all' ? 'Alle' : incomeType === 'ambulatory' ? 'Ambulant' : 'Gehospitaliseerd'}`, 14, 34);

    const headers = cols.map(c => c.label);
    const rows = filtered.map(r => cols.map(c => getDisplayValue(r, c.key)));

    // Totals
    const totalsRow = cols.map(c => {
      if (['total_amount', 'aandeel_arts', 'bouwfonds', 'mif', 'netto'].includes(c.key)) {
        return fmt(filtered.reduce((s, r) => s + (r[c.key as keyof IncomeRecord] as number), 0));
      }
      if (c.key === cols[0].key) return 'TOTAAL';
      return '';
    });
    rows.push(totalsRow);

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: 40,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [45, 100, 100], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      foot: [],
      didParseCell: (data) => {
        // Bold totals row
        if (data.row.index === rows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [230, 230, 230];
        }
      },
    });

    doc.save(`inkomsten_${selectedYear}_${monthFrom}-${monthTo}.pdf`);
    toast.success('PDF bestand gedownload');
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Exporteren</h1>
        <p className="text-muted-foreground mt-1">Exporteer je inkomsten als Excel of PDF.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Filters */}
        <Card className="border-border/50 lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Periode & Filters</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">Jaar</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  {years.length === 0 && <SelectItem value={selectedYear}>{selectedYear}</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm text-muted-foreground">Van maand</Label>
                <Select value={monthFrom} onValueChange={setMonthFrom}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((name, idx) => <SelectItem key={idx} value={String(idx + 1)}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Tot maand</Label>
                <Select value={monthTo} onValueChange={setMonthTo}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((name, idx) => <SelectItem key={idx} value={String(idx + 1)}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-sm text-muted-foreground">Type</Label>
              <Select value={incomeType} onValueChange={setIncomeType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle types</SelectItem>
                  <SelectItem value="ambulatory">Ambulant</SelectItem>
                  <SelectItem value="hospitalized">Gehospitaliseerd</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-2 border-t border-border/50">
              <Label className="text-sm text-muted-foreground mb-3 block">Kolommen</Label>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {ALL_COLUMNS.map(col => (
                  <div key={col.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`col-${col.key}`}
                      checked={selectedColumns.includes(col.key)}
                      onCheckedChange={() => toggleColumn(col.key)}
                    />
                    <label htmlFor={`col-${col.key}`} className="text-sm cursor-pointer">{col.label}</label>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preview + Actions */}
        <Card className="border-border/50 lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Voorbeeld ({filtered.length} records)
              </CardTitle>
              <div className="flex gap-2">
                <Button onClick={exportToExcel} variant="outline" size="sm" className="gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel
                </Button>
                <Button onClick={exportToPDF} variant="outline" size="sm" className="gap-2">
                  <FileText className="h-4 w-4" />
                  PDF
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{periodLabel}</p>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">Geen records gevonden voor de geselecteerde periode.</div>
            ) : (
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b border-border/50">
                      {cols.map(c => (
                        <th key={c.key} className="text-left py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 50).map(r => (
                      <tr key={r.id} className="border-b border-border/20 hover:bg-muted/30">
                        {cols.map(c => (
                          <td key={c.key} className="py-1.5 px-2 whitespace-nowrap">{getDisplayValue(r, c.key)}</td>
                        ))}
                      </tr>
                    ))}
                    {filtered.length > 50 && (
                      <tr><td colSpan={cols.length} className="py-3 text-center text-muted-foreground text-xs">... en {filtered.length - 50} meer records (alles wordt geëxporteerd)</td></tr>
                    )}
                  </tbody>
                  <tfoot className="border-t-2 border-border/50 font-semibold">
                    <tr>
                      {cols.map((c, idx) => (
                        <td key={c.key} className="py-2 px-2 whitespace-nowrap">
                          {['total_amount', 'aandeel_arts', 'bouwfonds', 'mif', 'netto'].includes(c.key)
                            ? `€${fmt(filtered.reduce((s, r) => s + (r[c.key as keyof IncomeRecord] as number), 0))}`
                            : idx === 0 ? 'TOTAAL' : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
