import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useDataVersion } from '@/hooks/useDataVersion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MonthlyReport } from '@/components/MonthlyReport';

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

  // Columns & summary
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    ALL_COLUMNS.map(c => c.key)
  );
  const [includeSummary, setIncludeSummary] = useState(true);
  const dataVersion = useDataVersion();

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      supabase.from('income_records').select('*').eq('user_id', user.id),
      supabase.from('nomenclature_codes').select('code, category, description').eq('user_id', user.id),
    ]).then(([recRes, nomRes]) => {
      setRecords(recRes.data || []);
      setNomenclatureCodes(nomRes.data || []);
      setLoading(false);
    });
  }, [user, dataVersion]);

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

  const incomeTypeLabel = (t: string) =>
    t === 'ambulatory' ? 'Ambulant' : t === 'hospitalized' ? 'Gehospitaliseerd' : t === 'associatie' ? 'Associatie' : t;

  const getDisplayValue = (record: IncomeRecord, key: string): string => {
    switch (key) {
      case 'income_type': return incomeTypeLabel(record.income_type);
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
      case 'income_type': return incomeTypeLabel(record.income_type);
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
    XLSX.utils.book_append_sheet(wb, ws, 'Detail');

    // Monthly summary sheet
    const mFrom = parseInt(monthFrom);
    const mTo = parseInt(monthTo);
    const summaryHeaders = ['Maand', 'Bruto', 'Aandeel Arts', 'Bouwfonds', 'MIF', 'Netto', 'Aantal prestaties'];
    const summaryRows: (string | number)[][] = [];
    let totBruto = 0, totAandeel = 0, totBouwfonds = 0, totMif = 0, totNetto = 0, totQty = 0;

    for (let m = mFrom; m <= mTo; m++) {
      const monthRecs = filtered.filter(r => r.month === m);
      const bruto = monthRecs.reduce((s, r) => s + r.total_amount, 0);
      const aandeel = monthRecs.reduce((s, r) => s + r.aandeel_arts, 0);
      const bouwf = monthRecs.reduce((s, r) => s + r.bouwfonds, 0);
      const mif = monthRecs.reduce((s, r) => s + r.mif, 0);
      const netto = monthRecs.reduce((s, r) => s + r.netto, 0);
      const qty = monthRecs.reduce((s, r) => s + r.quantity, 0);
      totBruto += bruto; totAandeel += aandeel; totBouwfonds += bouwf; totMif += mif; totNetto += netto; totQty += qty;
      summaryRows.push([MONTH_NAMES[m - 1], bruto, aandeel, bouwf, mif, netto, qty]);
    }
    summaryRows.push([]);
    summaryRows.push(['TOTAAL', totBruto, totAandeel, totBouwfonds, totMif, totNetto, totQty]);

    const wsSummary = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
    wsSummary['!cols'] = summaryHeaders.map(h => ({ wch: Math.max(h.length + 2, 14) }));
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Maandoverzicht');

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
    doc.text(`Type: ${incomeType === 'all' ? 'Alle' : incomeTypeLabel(incomeType)}`, 14, 34);

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
      didParseCell: (data) => {
        if (data.row.index === rows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [230, 230, 230];
        }
      },
    });

    // Monthly summary report
    if (includeSummary) {
      const mFrom = parseInt(monthFrom);
      const mTo = parseInt(monthTo);
      const monthlyTotals: { month: string; netto: number; bruto: number; aandeel: number; bouwfonds: number; mif: number }[] = [];

      for (let m = mFrom; m <= mTo; m++) {
        const monthRecs = filtered.filter(r => r.month === m);
        monthlyTotals.push({
          month: MONTH_NAMES[m - 1].substring(0, 3),
          netto: monthRecs.reduce((s, r) => s + r.netto, 0),
          bruto: monthRecs.reduce((s, r) => s + r.total_amount, 0),
          aandeel: monthRecs.reduce((s, r) => s + r.aandeel_arts, 0),
          bouwfonds: monthRecs.reduce((s, r) => s + r.bouwfonds, 0),
          mif: monthRecs.reduce((s, r) => s + r.mif, 0),
        });
      }

      // --- Summary page ---
      doc.addPage('landscape');
      doc.setFontSize(14);
      doc.text('Maandelijks Samenvattingsrapport', 14, 18);
      doc.setFontSize(9);
      doc.text(periodLabel, 14, 25);

      // Summary table
      autoTable(doc, {
        head: [['Maand', 'Bruto (€)', 'Aandeel Arts (€)', 'Bouwfonds (€)', 'MIF (€)', 'Netto (€)']],
        body: monthlyTotals.map(m => [m.month, fmt(m.bruto), fmt(m.aandeel), fmt(m.bouwfonds), fmt(m.mif), fmt(m.netto)]),
        foot: [['TOTAAL',
          fmt(monthlyTotals.reduce((s, m) => s + m.bruto, 0)),
          fmt(monthlyTotals.reduce((s, m) => s + m.aandeel, 0)),
          fmt(monthlyTotals.reduce((s, m) => s + m.bouwfonds, 0)),
          fmt(monthlyTotals.reduce((s, m) => s + m.mif, 0)),
          fmt(monthlyTotals.reduce((s, m) => s + m.netto, 0)),
        ]],
        startY: 30,
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [45, 100, 100], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [230, 230, 230], fontStyle: 'bold', textColor: [0, 0, 0] },
        alternateRowStyles: { fillColor: [248, 248, 248] },
      });

      // --- Bar chart: Netto per maand ---
      const chartY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 12 : 90;
      const chartX = 14;
      const chartW = 260;
      const chartH = 80;
      const maxVal = Math.max(...monthlyTotals.map(m => m.netto), 1);
      const barCount = monthlyTotals.length;
      const barGap = 4;
      const barW = Math.min(20, (chartW - barGap * (barCount + 1)) / barCount);
      const totalBarsW = barCount * barW + (barCount - 1) * barGap;
      const startX = chartX + (chartW - totalBarsW) / 2;

      doc.setFontSize(10);
      doc.text('Netto per maand', chartX, chartY);

      // Axes
      const axisY = chartY + 6;
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      doc.line(chartX, axisY + chartH, chartX + chartW, axisY + chartH); // x-axis

      // Grid lines
      for (let i = 0; i <= 4; i++) {
        const y = axisY + chartH - (chartH * i) / 4;
        doc.setDrawColor(230, 230, 230);
        doc.line(chartX, y, chartX + chartW, y);
        doc.setFontSize(6);
        doc.setTextColor(130, 130, 130);
        doc.text(fmt(maxVal * i / 4), chartX - 1, y + 1, { align: 'right' });
      }

      // Bars
      monthlyTotals.forEach((m, i) => {
        const bh = (m.netto / maxVal) * chartH;
        const bx = startX + i * (barW + barGap);
        const by = axisY + chartH - bh;

        // Gradient effect with two rects
        doc.setFillColor(45, 100, 130);
        doc.rect(bx, by, barW, bh, 'F');
        doc.setFillColor(60, 130, 170);
        doc.rect(bx, by, barW, Math.min(bh, 3), 'F');

        // Label
        doc.setFontSize(6);
        doc.setTextColor(80, 80, 80);
        doc.text(m.month, bx + barW / 2, axisY + chartH + 5, { align: 'center' });

        // Value on top
        if (bh > 8) {
          doc.setFontSize(5);
          doc.setTextColor(255, 255, 255);
          doc.text(fmt(m.netto), bx + barW / 2, by + 5, { align: 'center' });
        }
      });

      // --- Stacked bar chart: Afdrachten per maand ---
      const chart2Y = axisY + chartH + 20;
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text('Verdeling per maand (Aandeel Arts, Bouwfonds, MIF)', chartX, chart2Y);

      const chart2AxisY = chart2Y + 6;
      const maxStacked = Math.max(...monthlyTotals.map(m => m.aandeel + m.bouwfonds + m.mif), 1);

      // Grid
      doc.setDrawColor(180, 180, 180);
      doc.line(chartX, chart2AxisY + chartH, chartX + chartW, chart2AxisY + chartH);
      for (let i = 0; i <= 4; i++) {
        const y = chart2AxisY + chartH - (chartH * i) / 4;
        doc.setDrawColor(230, 230, 230);
        doc.line(chartX, y, chartX + chartW, y);
        doc.setFontSize(6);
        doc.setTextColor(130, 130, 130);
        doc.text(fmt(maxStacked * i / 4), chartX - 1, y + 1, { align: 'right' });
      }

      const colors = {
        aandeel: [70, 140, 90] as [number, number, number],
        bouwfonds: [200, 140, 50] as [number, number, number],
        mif: [180, 70, 70] as [number, number, number],
      };

      monthlyTotals.forEach((m, i) => {
        const bx = startX + i * (barW + barGap);
        let cumulH = 0;

        // Stack: aandeel, bouwfonds, mif
        ([
          { val: m.aandeel, color: colors.aandeel },
          { val: m.bouwfonds, color: colors.bouwfonds },
          { val: m.mif, color: colors.mif },
        ] as const).forEach(({ val, color }) => {
          const segH = (val / maxStacked) * chartH;
          doc.setFillColor(color[0], color[1], color[2]);
          doc.rect(bx, chart2AxisY + chartH - cumulH - segH, barW, segH, 'F');
          cumulH += segH;
        });

        doc.setFontSize(6);
        doc.setTextColor(80, 80, 80);
        doc.text(m.month, bx + barW / 2, chart2AxisY + chartH + 5, { align: 'center' });
      });

      // Legend
      const legendY = chart2AxisY + chartH + 12;
      const legendItems = [
        { label: 'Aandeel Arts', color: colors.aandeel },
        { label: 'Bouwfonds', color: colors.bouwfonds },
        { label: 'MIF', color: colors.mif },
      ];
      legendItems.forEach((item, i) => {
        const lx = chartX + i * 50;
        doc.setFillColor(item.color[0], item.color[1], item.color[2]);
        doc.rect(lx, legendY, 4, 4, 'F');
        doc.setFontSize(7);
        doc.setTextColor(80, 80, 80);
        doc.text(item.label, lx + 6, legendY + 3.5);
      });
    }

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

      <MonthlyReport />

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

            <div className="pt-2 border-t border-border/50 flex items-center justify-between">
              <Label htmlFor="include-summary" className="text-sm">Samenvattingsrapport met grafieken</Label>
              <Switch id="include-summary" checked={includeSummary} onCheckedChange={setIncludeSummary} />
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
