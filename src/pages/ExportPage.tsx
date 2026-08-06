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
import { Loader2, FileSpreadsheet, FileText, ListFilter } from 'lucide-react';
import { toast } from 'sonner';
import writeXlsxFile from 'write-excel-file/browser';
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

type ReportTemplateKey = 'doctor' | 'head_nurse';

const MONTH_NAMES = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
const MONEY_COLUMNS = ['total_amount', 'aandeel_arts', 'bouwfonds', 'mif', 'netto'] as const;
const RESTRICTED_AMOUNT_COLUMNS = [...MONEY_COLUMNS, 'unit_amount'] as const;
const TOTAL_COLUMNS = [...MONEY_COLUMNS, 'quantity'] as const;

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

type ColumnKey = typeof ALL_COLUMNS[number]['key'];

const REPORT_TEMPLATES: Record<ReportTemplateKey, {
  label: string;
  description: string;
  columnKeys: ColumnKey[];
  allowAmounts: boolean;
  groupByIncomeType: boolean;
}> = {
  doctor: {
    label: 'Arts',
    description: 'Volledig rapport met aantallen en bedragen.',
    columnKeys: ALL_COLUMNS.map(c => c.key),
    allowAmounts: true,
    groupByIncomeType: true,
  },
  head_nurse: {
    label: 'Hoofdverpleegkundige',
    description: 'Aantallenrapport zonder bedragen, ongeacht kolomselectie.',
    columnKeys: ['month', 'year', 'nomenclature_code', 'description', 'quantity'],
    allowAmounts: false,
    groupByIncomeType: false,
  },
};

const fmt = (val: number) => val.toLocaleString('de-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function toSheetRows(rows: (string | number)[][]) {
  return rows.map((row) => row.map((value) => ({ value })));
}

function getMonthDate(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

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
  const [selectedNomenclatureCodes, setSelectedNomenclatureCodes] = useState<string[]>([]);
  const [reportTemplateKey, setReportTemplateKey] = useState<ReportTemplateKey>('doctor');

  // Columns & summary
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    ALL_COLUMNS.map(c => c.key)
  );
  const [includeSummary, setIncludeSummary] = useState(true);
  const dataVersion = useDataVersion();
  const reportTemplate = REPORT_TEMPLATES[reportTemplateKey];

  useEffect(() => {
    setSelectedColumns(REPORT_TEMPLATES[reportTemplateKey].columnKeys);
  }, [reportTemplateKey]);

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

  const availableNomenclatureCodes = useMemo(() => {
    const usedCodes = [...new Set(records
      .filter(r => String(r.year) === selectedYear)
      .map(r => r.nomenclature_code)
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return usedCodes.map(code => ({ code, label: codeToLabel[code] || code }));
  }, [records, selectedYear, codeToLabel]);

  useEffect(() => {
    if (selectedNomenclatureCodes.length === 0) return;
    const available = new Set(availableNomenclatureCodes.map(item => item.code));
    const next = selectedNomenclatureCodes.filter(code => available.has(code));
    if (next.length !== selectedNomenclatureCodes.length) setSelectedNomenclatureCodes(next);
  }, [availableNomenclatureCodes, selectedNomenclatureCodes]);

  const filtered = useMemo(() => {
    let f = records.filter(r => String(r.year) === selectedYear);
    f = f.filter(r => r.month >= parseInt(monthFrom) && r.month <= parseInt(monthTo));
    if (incomeType !== 'all') f = f.filter(r => r.income_type === incomeType);
    if (selectedNomenclatureCodes.length > 0) {
      const selected = new Set(selectedNomenclatureCodes);
      f = f.filter(r => selected.has(r.nomenclature_code));
    }
    return f.sort((a, b) => a.month - b.month || a.record_date.localeCompare(b.record_date));
  }, [records, selectedYear, monthFrom, monthTo, incomeType, selectedNomenclatureCodes]);

  const reportRows = useMemo(() => {
    const grouped = new Map<string, IncomeRecord>();

    filtered.forEach((record) => {
      const key = [
        record.year,
        record.month,
        reportTemplate.groupByIncomeType ? record.income_type : 'all',
        record.nomenclature_code,
        record.description || '',
      ].join('|');
      const existing = grouped.get(key);

      if (!existing) {
        grouped.set(key, {
          ...record,
          id: key,
          income_type: reportTemplate.groupByIncomeType ? record.income_type : 'all',
          record_date: getMonthDate(record.year, record.month),
        });
        return;
      }

      existing.quantity += record.quantity;
      existing.total_amount += record.total_amount;
      existing.aandeel_arts += record.aandeel_arts;
      existing.bouwfonds += record.bouwfonds;
      existing.mif += record.mif;
      existing.netto += record.netto;
      existing.unit_amount = existing.quantity > 0 ? existing.total_amount / existing.quantity : 0;
    });

    return [...grouped.values()].sort((a, b) =>
      a.month - b.month ||
      a.nomenclature_code.localeCompare(b.nomenclature_code, undefined, { numeric: true }) ||
      a.income_type.localeCompare(b.income_type)
    );
  }, [filtered, reportTemplate.groupByIncomeType]);

  const monthlyTotals = useMemo(() => {
    const mFrom = parseInt(monthFrom);
    const mTo = parseInt(monthTo);

    return Array.from({ length: mTo - mFrom + 1 }, (_, index) => {
      const month = mFrom + index;
      const monthRows = reportRows.filter(r => r.month === month);
      return {
        month,
        monthName: MONTH_NAMES[month - 1],
        shortMonth: MONTH_NAMES[month - 1].substring(0, 3),
        bruto: monthRows.reduce((s, r) => s + r.total_amount, 0),
        aandeel: monthRows.reduce((s, r) => s + r.aandeel_arts, 0),
        bouwfonds: monthRows.reduce((s, r) => s + r.bouwfonds, 0),
        mif: monthRows.reduce((s, r) => s + r.mif, 0),
        netto: monthRows.reduce((s, r) => s + r.netto, 0),
        quantity: monthRows.reduce((s, r) => s + r.quantity, 0),
      };
    });
  }, [reportRows, monthFrom, monthTo]);

  const nomenclatureTotals = useMemo(() => {
    const grouped = new Map<string, { label: string; quantity: number; bruto: number; netto: number }>();

    reportRows.forEach((record) => {
      const label = codeToLabel[record.nomenclature_code] || record.nomenclature_code;
      const current = grouped.get(record.nomenclature_code) || { label, quantity: 0, bruto: 0, netto: 0 };
      current.quantity += record.quantity;
      current.bruto += record.total_amount;
      current.netto += record.netto;
      grouped.set(record.nomenclature_code, current);
    });

    return [...grouped.entries()]
      .map(([code, values]) => ({ code, ...values }))
      .sort((a, b) => b.quantity - a.quantity || a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [reportRows, codeToLabel]);

  const nomenclatureMonthlyQuantities = useMemo(() => {
    return nomenclatureTotals.map((item) => ({
      ...item,
      months: monthlyTotals.map((month) => ({
        month: month.shortMonth,
        quantity: reportRows
          .filter(r => r.nomenclature_code === item.code && r.month === month.month)
          .reduce((sum, record) => sum + record.quantity, 0),
      })),
    }));
  }, [nomenclatureTotals, monthlyTotals, reportRows]);

  const toggleColumn = (key: string) => {
    if (!reportTemplate.allowAmounts && (RESTRICTED_AMOUNT_COLUMNS as readonly string[]).includes(key)) return;
    setSelectedColumns(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const incomeTypeLabel = (t: string) =>
    t === 'ambulatory' ? 'Ambulant' : t === 'hospitalized' ? 'Gehospitaliseerd' : t === 'associatie' ? 'Associatie' : t;

  const toggleNomenclatureCode = (code: string) => {
    setSelectedNomenclatureCodes(prev =>
      prev.includes(code)
        ? prev.filter(item => item !== code)
        : [...prev, code].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    );
  };

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
  const nomenclatureFilterLabel = selectedNomenclatureCodes.length === 0
    ? 'Alle nomenclatuurcodes'
    : selectedNomenclatureCodes.length === 1
      ? (codeToLabel[selectedNomenclatureCodes[0]] || selectedNomenclatureCodes[0])
      : `${selectedNomenclatureCodes.length} nomenclatuurcodes geselecteerd`;
  const cols = ALL_COLUMNS.filter(c =>
    selectedColumns.includes(c.key) &&
    (reportTemplate.allowAmounts || !(RESTRICTED_AMOUNT_COLUMNS as readonly string[]).includes(c.key))
  );

  const exportToExcel = async () => {
    if (reportRows.length === 0) { toast.error('Geen data om te exporteren'); return; }

    const headers = cols.map(c => c.label);
    const rows = reportRows.map(r => cols.map(c => getRawValue(r, c.key)));

    // Add totals row for numeric columns
    const totalsRow = cols.map(c => {
      if ((TOTAL_COLUMNS as readonly string[]).includes(c.key)) {
        return reportRows.reduce((s, r) => s + (r[c.key as keyof IncomeRecord] as number), 0);
      }
      if (c.key === cols[0].key) return 'TOTAAL';
      return '';
    });

    const wsData = [headers, ...rows, [], totalsRow];

    // Monthly summary sheet
    const summaryHeaders = reportTemplate.allowAmounts
      ? ['Maand', 'Bruto', 'Aandeel Arts', 'Bouwfonds', 'MIF', 'Netto', 'Aantal prestaties']
      : ['Maand', 'Aantal prestaties'];
    const summaryRows: (string | number)[][] = monthlyTotals.map(m =>
      reportTemplate.allowAmounts
        ? [m.monthName, m.bruto, m.aandeel, m.bouwfonds, m.mif, m.netto, m.quantity]
        : [m.monthName, m.quantity]
    );
    summaryRows.push([]);
    summaryRows.push(reportTemplate.allowAmounts
      ? [
        'TOTAAL',
        monthlyTotals.reduce((s, m) => s + m.bruto, 0),
        monthlyTotals.reduce((s, m) => s + m.aandeel, 0),
        monthlyTotals.reduce((s, m) => s + m.bouwfonds, 0),
        monthlyTotals.reduce((s, m) => s + m.mif, 0),
        monthlyTotals.reduce((s, m) => s + m.netto, 0),
        monthlyTotals.reduce((s, m) => s + m.quantity, 0),
      ]
      : ['TOTAAL', monthlyTotals.reduce((s, m) => s + m.quantity, 0)]
    );

    const nomenclatureHeaders = reportTemplate.allowAmounts
      ? ['Nomenclatuur', 'Aantal prestaties', 'Bruto', 'Netto']
      : ['Nomenclatuur', 'Aantal prestaties'];
    const nomenclatureRows = nomenclatureTotals.map(item =>
      reportTemplate.allowAmounts
        ? [item.label, item.quantity, item.bruto, item.netto]
        : [item.label, item.quantity]
    );

    await (writeXlsxFile as any)([
      toSheetRows(wsData),
      toSheetRows([summaryHeaders, ...summaryRows]),
      toSheetRows([nomenclatureHeaders, ...nomenclatureRows]),
    ], {
      sheets: ['Detail', 'Maandoverzicht', 'Nomenclatuur'],
      fileName: `inkomsten_${selectedYear}_${monthFrom}-${monthTo}.xlsx`,
    });
    toast.success('Excel bestand gedownload');
  };

  const exportToPDF = () => {
    if (reportRows.length === 0) { toast.error('Geen data om te exporteren'); return; }

    const doc = new jsPDF({ orientation: 'landscape' });
    const teal: [number, number, number] = [36, 94, 95];
    const lightTeal: [number, number, number] = [232, 244, 244];

    // Title
    doc.setFillColor(teal[0], teal[1], teal[2]);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(`${reportTemplate.label} rapport`, 14, 16);
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.text(periodLabel, 14, 32);
    doc.text(`Type: ${incomeType === 'all' ? 'Alle' : incomeTypeLabel(incomeType)}`, 14, 38);
    doc.text(`Nomenclatuur: ${nomenclatureFilterLabel}`, 14, 44);
    if (!reportTemplate.allowAmounts) {
      doc.setFontSize(8);
      doc.text('Bedragen zijn uitgesloten in dit sjabloon.', 14, 49);
    }

    const headers = cols.map(c => c.label);
    const rows: string[][] = [];
    const monthHeaderRows = new Set<number>();

    monthlyTotals.forEach((month) => {
      const monthRows = reportRows.filter(r => r.month === month.month);
      if (monthRows.length === 0) return;

      monthHeaderRows.add(rows.length);
      rows.push(cols.map((_, index) =>
        index === 0
          ? reportTemplate.allowAmounts
            ? `${month.monthName} ${selectedYear} - ${fmt(month.quantity)} prestaties - netto EUR ${fmt(month.netto)}`
            : `${month.monthName} ${selectedYear} - ${fmt(month.quantity)} prestaties`
          : ''
      ));
      monthRows.forEach(r => rows.push(cols.map(c => getDisplayValue(r, c.key))));
    });

    // Totals
    const totalsRow = cols.map(c => {
      if ((TOTAL_COLUMNS as readonly string[]).includes(c.key)) {
        return fmt(reportRows.reduce((s, r) => s + (r[c.key as keyof IncomeRecord] as number), 0));
      }
      if (c.key === cols[0].key) return 'TOTAAL';
      return '';
    });
    rows.push(totalsRow);

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: 52,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2, lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: teal, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (data) => {
        if (data.row.index === rows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = lightTeal;
        }
        if (monthHeaderRows.has(data.row.index)) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = lightTeal;
          data.cell.styles.textColor = teal;
        }
      },
    });

    // Monthly summary report
    if (includeSummary) {
      const mFrom = parseInt(monthFrom);
      const mTo = parseInt(monthTo);
      const pdfMonthlyTotals: { month: string; quantity: number; netto: number; bruto: number; aandeel: number; bouwfonds: number; mif: number }[] = [];

      for (let m = mFrom; m <= mTo; m++) {
        const monthRecs = reportRows.filter(r => r.month === m);
        pdfMonthlyTotals.push({
          month: MONTH_NAMES[m - 1].substring(0, 3),
          quantity: monthRecs.reduce((s, r) => s + r.quantity, 0),
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
      doc.text(`Nomenclatuur: ${nomenclatureFilterLabel}`, 14, 31);

      // Summary table
      if (reportTemplate.allowAmounts) {
      autoTable(doc, {
        head: [['Maand', 'Bruto (€)', 'Aandeel Arts (€)', 'Bouwfonds (€)', 'MIF (€)', 'Netto (€)']],
        body: pdfMonthlyTotals.map(m => [m.month, fmt(m.bruto), fmt(m.aandeel), fmt(m.bouwfonds), fmt(m.mif), fmt(m.netto)]),
        foot: [['TOTAAL',
          fmt(pdfMonthlyTotals.reduce((s, m) => s + m.bruto, 0)),
          fmt(pdfMonthlyTotals.reduce((s, m) => s + m.aandeel, 0)),
          fmt(pdfMonthlyTotals.reduce((s, m) => s + m.bouwfonds, 0)),
          fmt(pdfMonthlyTotals.reduce((s, m) => s + m.mif, 0)),
          fmt(pdfMonthlyTotals.reduce((s, m) => s + m.netto, 0)),
        ]],
        startY: 36,
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [45, 100, 100], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [230, 230, 230], fontStyle: 'bold', textColor: [0, 0, 0] },
        alternateRowStyles: { fillColor: [248, 248, 248] },
      });
      } else {
        autoTable(doc, {
          head: [['Maand', 'Prestaties']],
          body: pdfMonthlyTotals.map(m => [m.month, fmt(m.quantity)]),
          foot: [['TOTAAL', fmt(pdfMonthlyTotals.reduce((s, m) => s + m.quantity, 0))]],
          startY: 36,
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: teal, textColor: 255, fontStyle: 'bold' },
          footStyles: { fillColor: lightTeal, fontStyle: 'bold', textColor: [0, 0, 0] },
          alternateRowStyles: { fillColor: [248, 248, 248] },
        });
      }

      // --- Charts page ---
      doc.addPage('landscape');
      doc.setFillColor(teal[0], teal[1], teal[2]);
      doc.rect(0, 0, doc.internal.pageSize.getWidth(), 24, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(15);
      doc.text('Grafieken', 14, 16);
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(9);
      doc.text('Alleen de geselecteerde gegevens zijn opgenomen.', 14, 32);

      if (reportTemplate.allowAmounts) {
      // --- Bar chart: Netto per maand ---
      const chartY = 48;
      const chartX = 14;
      const chartW = 120;
      const chartH = 72;
      const maxVal = Math.max(...pdfMonthlyTotals.map(m => m.netto), 1);
      const barCount = pdfMonthlyTotals.length;
      const barGap = 3;
      const barW = Math.min(13, (chartW - barGap * (barCount + 1)) / barCount);
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
      pdfMonthlyTotals.forEach((m, i) => {
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
      const chart2X = 160;
      const chart2Y = chartY;
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text('Verdeling per maand (Aandeel Arts, Bouwfonds, MIF)', chart2X, chart2Y);

      const chart2AxisY = chart2Y + 6;
      const maxStacked = Math.max(...pdfMonthlyTotals.map(m => m.aandeel + m.bouwfonds + m.mif), 1);

      // Grid
      doc.setDrawColor(180, 180, 180);
      doc.line(chart2X, chart2AxisY + chartH, chart2X + chartW, chart2AxisY + chartH);
      for (let i = 0; i <= 4; i++) {
        const y = chart2AxisY + chartH - (chartH * i) / 4;
        doc.setDrawColor(230, 230, 230);
        doc.line(chart2X, y, chart2X + chartW, y);
        doc.setFontSize(6);
        doc.setTextColor(130, 130, 130);
        doc.text(fmt(maxStacked * i / 4), chart2X - 1, y + 1, { align: 'right' });
      }

      const colors = {
        aandeel: [70, 140, 90] as [number, number, number],
        bouwfonds: [200, 140, 50] as [number, number, number],
        mif: [180, 70, 70] as [number, number, number],
      };
      const chart2StartX = chart2X + (chartW - totalBarsW) / 2;

      pdfMonthlyTotals.forEach((m, i) => {
        const bx = chart2StartX + i * (barW + barGap);
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
        const lx = chart2X + i * 43;
        doc.setFillColor(item.color[0], item.color[1], item.color[2]);
        doc.rect(lx, legendY, 4, 4, 'F');
        doc.setFontSize(7);
        doc.setTextColor(80, 80, 80);
        doc.text(item.label, lx + 6, legendY + 3.5);
      });
      } else {
        const chartY = 50;
        const chartX = 18;
        const chartW = 250;
        const chartH = 82;
        const maxQty = Math.max(...pdfMonthlyTotals.map(m => m.quantity), 1);
        const barGap = 5;
        const barW = Math.min(18, (chartW - barGap * (pdfMonthlyTotals.length + 1)) / Math.max(pdfMonthlyTotals.length, 1));
        const totalBarsW = pdfMonthlyTotals.length * barW + (pdfMonthlyTotals.length - 1) * barGap;
        const startX = chartX + (chartW - totalBarsW) / 2;
        const axisY = chartY + 8;

        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text('Aantal prestaties per maand', chartX, chartY);
        doc.setDrawColor(220, 226, 232);
        doc.line(chartX, axisY + chartH, chartX + chartW, axisY + chartH);

        for (let i = 0; i <= 4; i++) {
          const y = axisY + chartH - (chartH * i) / 4;
          doc.setDrawColor(235, 238, 242);
          doc.line(chartX, y, chartX + chartW, y);
          doc.setFontSize(7);
          doc.setTextColor(100, 110, 120);
          doc.text(fmt(maxQty * i / 4), chartX - 2, y + 1, { align: 'right' });
        }

        pdfMonthlyTotals.forEach((m, i) => {
          const bh = (m.quantity / maxQty) * chartH;
          const bx = startX + i * (barW + barGap);
          const by = axisY + chartH - bh;

          doc.setFillColor(teal[0], teal[1], teal[2]);
          doc.rect(bx, by, barW, bh, 'F');
          doc.setFontSize(7);
          doc.setTextColor(80, 80, 80);
          doc.text(m.month, bx + barW / 2, axisY + chartH + 6, { align: 'center' });
          doc.text(fmt(m.quantity), bx + barW / 2, Math.max(by - 2, axisY + 4), { align: 'center' });
        });

        autoTable(doc, {
          head: [['Nomenclatuur', 'Prestaties']],
          body: nomenclatureTotals.map(item => [item.label, fmt(item.quantity)]),
          startY: 152,
          styles: { fontSize: 8, cellPadding: 2.5 },
          headStyles: { fillColor: teal, textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 248, 248] },
        });
      }

      const drawNomenclatureChart = (
        chart: typeof nomenclatureMonthlyQuantities[number],
        x: number,
        y: number,
        width: number,
        height: number
      ) => {
        const maxQty = Math.max(...chart.months.map(m => m.quantity), 1);
        const axisY = y + 15;
        const plotH = height - 28;
        const gap = 4;
        const barW = Math.min(16, (width - gap * (chart.months.length + 1)) / Math.max(chart.months.length, 1));
        const barsW = chart.months.length * barW + (chart.months.length - 1) * gap;
        const startX = x + (width - barsW) / 2;

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x - 4, y - 8, width + 8, height + 8, 2, 2, 'FD');
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);
        doc.text(chart.label.slice(0, 62), x, y);
        doc.setFontSize(7);
        doc.setTextColor(100, 110, 120);
        doc.text(`Totaal: ${fmt(chart.quantity)} prestaties`, x, y + 6);

        for (let i = 0; i <= 3; i++) {
          const lineY = axisY + plotH - (plotH * i) / 3;
          doc.setDrawColor(235, 238, 242);
          doc.line(x, lineY, x + width, lineY);
          doc.setFontSize(6);
          doc.setTextColor(120, 130, 140);
          doc.text(fmt(maxQty * i / 3), x - 2, lineY + 1, { align: 'right' });
        }

        chart.months.forEach((month, index) => {
          const barH = (month.quantity / maxQty) * plotH;
          const bx = startX + index * (barW + gap);
          const by = axisY + plotH - barH;

          doc.setFillColor(teal[0], teal[1], teal[2]);
          doc.rect(bx, by, barW, barH, 'F');
          doc.setFontSize(6);
          doc.setTextColor(80, 80, 80);
          doc.text(month.month, bx + barW / 2, axisY + plotH + 5, { align: 'center' });
          if (month.quantity > 0) {
            doc.text(fmt(month.quantity), bx + barW / 2, Math.max(by - 2, axisY + 4), { align: 'center' });
          }
        });
      };

      nomenclatureMonthlyQuantities.forEach((chart, index) => {
        if (index % 2 === 0) {
          doc.addPage('landscape');
          doc.setFillColor(teal[0], teal[1], teal[2]);
          doc.rect(0, 0, doc.internal.pageSize.getWidth(), 24, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(15);
          doc.text('Grafieken per nomenclatuur', 14, 16);
          doc.setTextColor(30, 41, 59);
          doc.setFontSize(9);
          doc.text('Aantallen per maand, op basis van de huidige selectie.', 14, 32);
        }

        drawNomenclatureChart(chart, 20, index % 2 === 0 ? 52 : 132, 252, 62);
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
              <Label className="text-sm text-muted-foreground">Rapportsjabloon</Label>
              <Select value={reportTemplateKey} onValueChange={(value) => setReportTemplateKey(value as ReportTemplateKey)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REPORT_TEMPLATES).map(([key, template]) => (
                    <SelectItem key={key} value={key}>{template.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">{reportTemplate.description}</p>
            </div>

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
                  <SelectItem value="associatie">Associatie</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-2 border-t border-border/50">
              <div className="mb-3 flex items-center justify-between gap-2">
                <Label className="text-sm text-muted-foreground flex items-center gap-2">
                  <ListFilter className="h-4 w-4" />
                  Nomenclatuur
                </Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setSelectedNomenclatureCodes(availableNomenclatureCodes.map(item => item.code))}
                    disabled={availableNomenclatureCodes.length === 0}
                  >
                    Alles
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setSelectedNomenclatureCodes([])}
                    disabled={selectedNomenclatureCodes.length === 0}
                  >
                    Wissen
                  </Button>
                </div>
              </div>
              <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border border-border/60 bg-muted/10 p-2">
                {availableNomenclatureCodes.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Geen codes gevonden voor dit jaar.</p>
                ) : availableNomenclatureCodes.map(item => (
                  <label key={item.code} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-muted/50">
                    <Checkbox
                      checked={selectedNomenclatureCodes.includes(item.code)}
                      onCheckedChange={() => toggleNomenclatureCode(item.code)}
                    />
                    <span className="text-sm leading-tight">{item.label}</span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{nomenclatureFilterLabel}</p>
            </div>

            <div className="pt-2 border-t border-border/50">
              <Label className="text-sm text-muted-foreground mb-3 block">Kolommen</Label>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {ALL_COLUMNS.map(col => (
                  <div key={col.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`col-${col.key}`}
                      checked={selectedColumns.includes(col.key)}
                      disabled={!reportTemplate.allowAmounts && (RESTRICTED_AMOUNT_COLUMNS as readonly string[]).includes(col.key)}
                      onCheckedChange={() => toggleColumn(col.key)}
                    />
                    <label
                      htmlFor={`col-${col.key}`}
                      className={`text-sm cursor-pointer ${!reportTemplate.allowAmounts && (RESTRICTED_AMOUNT_COLUMNS as readonly string[]).includes(col.key) ? 'text-muted-foreground line-through' : ''}`}
                    >
                      {col.label}
                    </label>
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
                Voorbeeld ({reportRows.length} rapportregels)
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
            <p className="text-xs text-muted-foreground">{nomenclatureFilterLabel}</p>
          </CardHeader>
          <CardContent>
            {reportRows.length === 0 ? (
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
                    {reportRows.slice(0, 50).map(r => (
                      <tr key={r.id} className="border-b border-border/20 hover:bg-muted/30">
                        {cols.map(c => (
                          <td key={c.key} className="py-1.5 px-2 whitespace-nowrap">{getDisplayValue(r, c.key)}</td>
                        ))}
                      </tr>
                    ))}
                    {reportRows.length > 50 && (
                      <tr><td colSpan={cols.length} className="py-3 text-center text-muted-foreground text-xs">... en {reportRows.length - 50} meer rapportregels (alles wordt geexporteerd)</td></tr>
                    )}
                  </tbody>
                  <tfoot className="border-t-2 border-border/50 font-semibold">
                    <tr>
                      {cols.map((c, idx) => (
                        <td key={c.key} className="py-2 px-2 whitespace-nowrap">
                          {(MONEY_COLUMNS as readonly string[]).includes(c.key)
                            ? `EUR ${fmt(reportRows.reduce((s, r) => s + (r[c.key as keyof IncomeRecord] as number), 0))}`
                            : c.key === 'quantity'
                              ? fmt(reportRows.reduce((s, r) => s + r.quantity, 0))
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
