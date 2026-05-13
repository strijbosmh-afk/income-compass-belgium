import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Goal, GoalIncomeType, GoalMetric } from '@/hooks/useGoals';

export type ExportRow = {
  label: string;
  longLabel: string;
  werkelijk: number | null;
  doel: number;
  periodeWerkelijk: number;
  gap: number | null;
  pctVanDoel: number | null;
};

const incomeTypeLabel: Record<GoalIncomeType, string> = {
  all: 'Totaal',
  ambulatory: 'Ambulant',
  hospitalized: 'Gehospitaliseerd',
  associatie: 'Associatie',
};
const metricLabel: Record<GoalMetric, string> = {
  netto: 'Netto',
  bruto: 'Bruto',
  aandeel_arts: 'Aandeel Arts',
};
const periodTypeLabel = (g: Goal) => {
  if (g.period_type === 'year') return `Jaar ${g.year}`;
  if (g.period_type === 'quarter') return `Q${g.period_value} ${g.year}`;
  return `${g.year}-${String(g.period_value).padStart(2, '0')}`;
};

const fmtNum = (v: number | null) =>
  v == null ? '' : v.toLocaleString('de-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number | null) => (v == null ? '' : `${(v * 100).toFixed(1)}%`);

function fileBase(g: Goal) {
  return `doel_${periodTypeLabel(g).replace(/\s+/g, '_')}_${g.income_type}_${g.metric}`;
}

function csvEscape(v: string): string {
  if (/[",;\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function exportPeriodsCSV(goal: Goal, rows: ExportRow[]) {
  const header = [
    'Periode',
    'Beschrijving',
    'Werkelijk cumulatief (EUR)',
    'In deze periode (EUR)',
    'Doel lineair (EUR)',
    'Verschil werkelijk - doel (EUR)',
    'Percentage van einddoel',
  ];
  const meta = [
    `# Doel: ${periodTypeLabel(goal)} - ${incomeTypeLabel[goal.income_type]} ${metricLabel[goal.metric]}`,
    `# Doelbedrag: ${fmtNum(goal.amount)} EUR`,
    `# Geëxporteerd: ${new Date().toLocaleString('nl-BE')}`,
    `# Aantal periodes: ${rows.length}`,
  ];
  const lines = [
    ...meta,
    header.map(csvEscape).join(';'),
    ...rows.map(r =>
      [
        r.label,
        r.longLabel,
        fmtNum(r.werkelijk),
        fmtNum(r.periodeWerkelijk),
        fmtNum(r.doel),
        fmtNum(r.gap),
        fmtPct(r.pctVanDoel),
      ].map(csvEscape).join(';')
    ),
  ];
  // BOM voor Excel UTF-8
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileBase(goal)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportPeriodsPDF(goal: Goal, rows: ExportRow[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // Header band
  doc.setFillColor(30, 60, 80);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Doel – periode-export', 14, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${periodTypeLabel(goal)} • ${incomeTypeLabel[goal.income_type]} • ${metricLabel[goal.metric]}`,
    14,
    20,
  );

  doc.setTextColor(0, 0, 0);
  let y = 36;

  doc.setFontSize(9);
  doc.text(`Doelbedrag: EUR ${fmtNum(goal.amount)}`, 14, y);
  doc.text(`Aantal periodes: ${rows.length}`, 14, y + 5);
  doc.text(`Export: ${new Date().toLocaleString('nl-BE')}`, 14, y + 10);
  y += 16;

  const totalActual = rows.reduce((s, r) => s + r.periodeWerkelijk, 0);
  const lastCum = rows.length > 0 ? rows[rows.length - 1].werkelijk : null;
  const lastDoel = rows.length > 0 ? rows[rows.length - 1].doel : 0;
  const lastGap = lastCum == null ? null : lastCum - lastDoel;

  autoTable(doc, {
    startY: y,
    head: [['Periode', 'Werkelijk cum.', 'In periode', 'Doel lineair', 'Verschil', '% van eind­doel']],
    body: rows.map(r => [
      r.longLabel,
      fmtNum(r.werkelijk),
      fmtNum(r.periodeWerkelijk),
      fmtNum(r.doel),
      r.gap == null ? '' : (r.gap >= 0 ? '+' : '') + fmtNum(r.gap),
      fmtPct(r.pctVanDoel),
    ]),
    foot: [[
      'Selectie totaal',
      fmtNum(lastCum),
      fmtNum(totalActual),
      fmtNum(lastDoel),
      lastGap == null ? '' : (lastGap >= 0 ? '+' : '') + fmtNum(lastGap),
      fmtPct(lastCum == null || goal.amount === 0 ? null : lastCum / goal.amount),
    ]],
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 60, 80], textColor: 255 },
    footStyles: { fillColor: [230, 230, 230], fontStyle: 'bold', textColor: [0, 0, 0] },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 4) {
        const t = d.cell.text[0] || '';
        if (t.startsWith('+')) d.cell.styles.textColor = [40, 130, 70];
        else if (t.startsWith('-')) d.cell.styles.textColor = [180, 60, 60];
      }
    },
    margin: { left: 14, right: 14 },
  });

  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text(`MedIncome • ${new Date().toLocaleDateString('nl-BE')}`, 14, pageH - 6);

  doc.save(`${fileBase(goal)}.pdf`);
}
