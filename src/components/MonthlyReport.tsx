import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useDataVersion } from '@/hooks/useDataVersion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, Lock, Unlock, CheckCircle2, TrendingUp, TrendingDown, Minus, AlertTriangle, CalendarCheck, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { applyShare } from '@/lib/incomeTypes';

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
};

type Closure = { id: string; year: number; month: number; closed_at: string; note: string | null };

const MONTH_NAMES = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
const fmt = (val: number) => val.toLocaleString('de-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;

function aggregate(recs: IncomeRecord[]) {
  return recs.reduce(
    (acc, r) => {
      acc.bruto += r.total_amount;
      acc.aandeel += r.aandeel_arts;
      acc.bouwfonds += r.bouwfonds;
      acc.mif += r.mif;
      acc.netto += r.netto;
      acc.qty += r.quantity;
      acc.count += 1;
      return acc;
    },
    { bruto: 0, aandeel: 0, bouwfonds: 0, mif: 0, netto: 0, qty: 0, count: 0 }
  );
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function MonthlyReport() {
  const { user } = useAuth();
  const dataVersion = useDataVersion();
  const [records, setRecords] = useState<IncomeRecord[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [closeNote, setCloseNote] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);

  const now = new Date();
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1));
  const [searchParams, setSearchParams] = useSearchParams();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = searchParams.get('close');
    if (!close) return;
    const m = close.match(/^(\d{4})-(\d{1,2})$/);
    if (!m) return;
    setYear(m[1]);
    setMonth(String(parseInt(m[2], 10)));
    // Scroll after render
    setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setDetailsOpen(true);
    }, 100);
    // Clear the param so it doesn't retrigger
    const next = new URLSearchParams(searchParams);
    next.delete('close');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      supabase.from('income_records').select('id,month,year,income_type,nomenclature_code,description,total_amount,aandeel_arts,bouwfonds,mif,netto,quantity').eq('user_id', user.id),
      supabase.from('month_closures').select('id,year,month,closed_at,note').eq('user_id', user.id),
    ]).then(([recRes, closeRes]) => {
      setRecords((((recRes.data as IncomeRecord[]) || []).map((record) => applyShare(record))) as IncomeRecord[]);
      setClosures((closeRes.data as Closure[]) || []);
      setLoading(false);
    });
  }, [user, dataVersion]);

  const yearNum = parseInt(year);
  const monthNum = parseInt(month);

  const years = useMemo(() => {
    const set = new Set<number>(records.map(r => r.year));
    set.add(now.getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [records]);

  const currentRecs = useMemo(() => records.filter(r => r.year === yearNum && r.month === monthNum), [records, yearNum, monthNum]);
  const prevDate = useMemo(() => {
    const d = new Date(yearNum, monthNum - 2, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }, [yearNum, monthNum]);
  const prevMonthRecs = useMemo(() => records.filter(r => r.year === prevDate.year && r.month === prevDate.month), [records, prevDate]);
  const prevYearRecs = useMemo(() => records.filter(r => r.year === yearNum - 1 && r.month === monthNum), [records, yearNum, monthNum]);

  const closure = useMemo(() => closures.find(c => c.year === yearNum && c.month === monthNum), [closures, yearNum, monthNum]);

  useEffect(() => {
    setCloseNote(closure?.note || '');
  }, [closure?.id]);

  const totals = useMemo(() => aggregate(currentRecs), [currentRecs]);
  const ambulant = useMemo(() => aggregate(currentRecs.filter(r => r.income_type === 'ambulatory')), [currentRecs]);
  const hospitalized = useMemo(() => aggregate(currentRecs.filter(r => r.income_type === 'hospitalized')), [currentRecs]);
  const associatie = useMemo(() => aggregate(currentRecs.filter(r => r.income_type === 'associatie')), [currentRecs]);
  const prevTotals = useMemo(() => aggregate(prevMonthRecs), [prevMonthRecs]);
  const prevYearTotals = useMemo(() => aggregate(prevYearRecs), [prevYearRecs]);

  const topCodes = useMemo(() => {
    const map = new Map<string, { code: string; description: string; bruto: number; netto: number; qty: number }>();
    for (const r of currentRecs) {
      const ex = map.get(r.nomenclature_code);
      if (ex) {
        ex.bruto += r.total_amount;
        ex.netto += r.netto;
        ex.qty += r.quantity;
      } else {
        map.set(r.nomenclature_code, {
          code: r.nomenclature_code,
          description: r.description || '',
          bruto: r.total_amount,
          netto: r.netto,
          qty: r.quantity,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.netto - a.netto).slice(0, 10);
  }, [currentRecs]);

  const closeChecklist = useMemo(() => {
    const pastMonths = Array.from({ length: Math.max(0, monthNum - 1) }, (_, i) => i + 1)
      .map(m => ({ month: m, recs: records.filter(r => r.year === yearNum && r.month === m) }))
      .filter(m => m.recs.length > 0);
    const expectedNetto = pastMonths.length > 0
      ? pastMonths.reduce((sum, m) => sum + aggregate(m.recs).netto, 0) / pastMonths.length
      : prevTotals.netto || prevYearTotals.netto || 0;
    const diff = totals.netto - expectedNetto;
    const diffPct = expectedNetto > 0 ? (diff / expectedNetto) * 100 : null;
    const lowComparedToExpected = expectedNetto > 0 && totals.netto < expectedNetto * 0.5;
    const missingCurrent = currentRecs.length === 0;
    const missingPriorMonth = prevDate.year === yearNum && monthNum > 1 && prevMonthRecs.length === 0;
    const issues = [
      missingCurrent ? 'Geen records in deze maand.' : null,
      missingPriorMonth ? `Vorige maand (${MONTH_NAMES[prevDate.month - 1]}) heeft geen records.` : null,
      lowComparedToExpected ? 'Netto ligt meer dan 50% onder de verwachte maandwaarde.' : null,
    ].filter(Boolean) as string[];

    return { expectedNetto, diff, diffPct, issues, ok: issues.length === 0 && currentRecs.length > 0 };
  }, [records, yearNum, monthNum, currentRecs, prevDate, prevMonthRecs, prevTotals.netto, prevYearTotals.netto, totals.netto]);

  const toggleClosure = async () => {
    if (!user) return;
    setBusy(true);
    try {
      if (closure) {
        const { error } = await supabase.from('month_closures').delete().eq('id', closure.id);
        if (error) throw error;
        setClosures(prev => prev.filter(c => c.id !== closure.id));
        toast.success('Maand heropend');
      } else {
        const checklistNote = [
          closeChecklist.expectedNetto > 0 ? `Verwacht netto: € ${fmt(closeChecklist.expectedNetto)} (${closeChecklist.diff >= 0 ? '+' : ''}€ ${fmt(closeChecklist.diff)})` : null,
          closeChecklist.issues.length > 0 ? `Aandachtspunten: ${closeChecklist.issues.join(' ')}` : 'Geen aandachtspunten bij afsluiten.',
          closeNote.trim() ? `Notitie: ${closeNote.trim()}` : null,
        ].filter(Boolean).join('\n');
        const { data, error } = await supabase.from('month_closures').insert({ user_id: user.id, year: yearNum, month: monthNum, note: checklistNote }).select().single();
        if (error) throw error;
        setClosures(prev => [...prev, data as Closure]);
        toast.success('Maand afgesloten');
      }
    } catch (e: any) {
      toast.error(e.message || 'Fout bij wijzigen status');
    } finally {
      setBusy(false);
    }
  };

  const generatePDF = () => {
    if (currentRecs.length === 0) {
      toast.error('Geen data voor deze maand');
      return;
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const monthLabel = `${MONTH_NAMES[monthNum - 1]} ${yearNum}`;

    // ===== HEADER BAND =====
    doc.setFillColor(30, 60, 80);
    doc.rect(0, 0, pageW, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Maandrapport', 14, 14);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'normal');
    doc.text(monthLabel, 14, 23);

    // Status badge
    if (closure) {
      doc.setFillColor(60, 140, 90);
      doc.roundedRect(pageW - 50, 8, 36, 8, 1.5, 1.5, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('AFGESLOTEN', pageW - 32, 13.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(new Date(closure.closed_at).toLocaleDateString('nl-BE'), pageW - 32, 19.5, { align: 'center' });
    } else {
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.4);
      doc.roundedRect(pageW - 50, 8, 36, 8, 1.5, 1.5);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('CONCEPT', pageW - 32, 13.5, { align: 'center' });
    }

    doc.setTextColor(0, 0, 0);
    let y = 42;

    // ===== KERNCIJFERS BLOK =====
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Kerncijfers', 14, y);
    y += 5;

    const cards = [
      { label: 'Bruto', val: totals.bruto, color: [70, 110, 140] },
      { label: 'Aandeel Arts', val: totals.aandeel, color: [70, 140, 90] },
      { label: 'Afdracht', val: totals.bruto - totals.aandeel, color: [180, 110, 60] },
      { label: 'Netto', val: totals.netto, color: [30, 60, 80] },
    ] as const;
    const cardW = (pageW - 28 - 9) / 4;
    cards.forEach((c, i) => {
      const x = 14 + i * (cardW + 3);
      doc.setFillColor(248, 248, 248);
      doc.roundedRect(x, y, cardW, 22, 1.5, 1.5, 'F');
      doc.setFillColor(c.color[0], c.color[1], c.color[2]);
      doc.rect(x, y, 1.5, 22, 'F');
      doc.setFontSize(7);
      doc.setTextColor(110, 110, 110);
      doc.setFont('helvetica', 'normal');
      doc.text(c.label.toUpperCase(), x + 4, y + 6);
      doc.setFontSize(13);
      doc.setTextColor(20, 20, 20);
      doc.setFont('helvetica', 'bold');
      doc.text(`EUR ${fmt(c.val)}`, x + 4, y + 15);
    });
    y += 28;

    // ===== INKOMSTSTROMEN =====
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Per inkomststroom', 14, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      head: [['Stroom', 'Prestaties', 'Bruto (EUR)', 'Aandeel Arts', 'Afdracht', 'Netto (EUR)']],
      body: [
        ['Ambulant', String(ambulant.qty), fmt(ambulant.bruto), fmt(ambulant.aandeel), fmt(ambulant.bruto - ambulant.aandeel), fmt(ambulant.netto)],
        ['Gehospitaliseerd', String(hospitalized.qty), fmt(hospitalized.bruto), fmt(hospitalized.aandeel), fmt(hospitalized.bruto - hospitalized.aandeel), fmt(hospitalized.netto)],
        ['Associatie (50%)', String(associatie.qty), fmt(associatie.bruto), fmt(associatie.aandeel), fmt(associatie.bruto - associatie.aandeel), fmt(associatie.netto)],
      ],
      foot: [['TOTAAL', String(totals.qty), fmt(totals.bruto), fmt(totals.aandeel), fmt(totals.bruto - totals.aandeel), fmt(totals.netto)]],
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [30, 60, 80], textColor: 255 },
      footStyles: { fillColor: [230, 230, 230], fontStyle: 'bold', textColor: [0, 0, 0] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    // ===== WATERVAL Bruto -> Netto =====
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Waterval: Bruto naar Netto', 14, y);
    y += 6;

    const wfX = 14;
    const wfW = pageW - 28;
    const wfH = 38;
    const wfMax = totals.bruto || 1;
    const steps = [
      { label: 'Bruto', val: totals.bruto, color: [70, 110, 140] as [number, number, number], cumul: totals.bruto },
      { label: '- Afdracht ZH', val: totals.bruto - totals.aandeel, color: [180, 110, 60] as [number, number, number], cumul: totals.aandeel, sub: -(totals.bruto - totals.aandeel) },
      { label: '- MIF', val: totals.mif, color: [180, 70, 70] as [number, number, number], cumul: totals.aandeel - totals.mif, sub: -totals.mif },
      { label: '- Bouwfonds', val: totals.bouwfonds, color: [200, 140, 50] as [number, number, number], cumul: totals.aandeel - totals.mif - totals.bouwfonds, sub: -totals.bouwfonds },
      { label: 'Netto', val: totals.netto, color: [30, 60, 80] as [number, number, number], cumul: totals.netto },
    ];
    const stepW = (wfW - 4 * 3) / 5;
    steps.forEach((s, i) => {
      const sx = wfX + i * (stepW + 3);
      const h = (s.cumul / wfMax) * wfH;
      const sy = y + wfH - h;
      doc.setFillColor(s.color[0], s.color[1], s.color[2]);
      doc.rect(sx, sy, stepW, h, 'F');
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 80);
      doc.text(s.label, sx + stepW / 2, y + wfH + 4, { align: 'center' });
      doc.setFontSize(8);
      doc.setTextColor(20, 20, 20);
      doc.setFont('helvetica', 'bold');
      doc.text(fmt(s.cumul), sx + stepW / 2, y + wfH + 9, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      if (s.sub !== undefined) {
        doc.setFontSize(6);
        doc.setTextColor(180, 70, 70);
        doc.text(`(${fmt(s.sub)})`, sx + stepW / 2, y + wfH + 13, { align: 'center' });
      }
    });
    y += wfH + 18;

    // ===== VERGELIJKING =====
    if (y > pageH - 80) { doc.addPage(); y = 18; }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Vergelijking', 14, y);
    y += 3;

    const prevMonthLabel = `${MONTH_NAMES[prevDate.month - 1].substring(0, 3)} ${prevDate.year}`;
    const prevYearLabel = `${MONTH_NAMES[monthNum - 1].substring(0, 3)} ${yearNum - 1}`;

    const buildCompareRow = (label: string, curr: number, prevM: number, prevY: number) => {
      const dM = pctChange(curr, prevM);
      const dY = pctChange(curr, prevY);
      return [
        label,
        fmt(curr),
        fmt(prevM),
        dM === null ? 'n.v.t.' : fmtPct(dM),
        fmt(prevY),
        dY === null ? 'n.v.t.' : fmtPct(dY),
      ];
    };

    autoTable(doc, {
      startY: y,
      head: [['', monthLabel, prevMonthLabel, 'vs vorige', prevYearLabel, 'vs vorig jaar']],
      body: [
        buildCompareRow('Bruto', totals.bruto, prevTotals.bruto, prevYearTotals.bruto),
        buildCompareRow('Aandeel Arts', totals.aandeel, prevTotals.aandeel, prevYearTotals.aandeel),
        buildCompareRow('Netto', totals.netto, prevTotals.netto, prevYearTotals.netto),
        ['Prestaties', String(totals.qty), String(prevTotals.qty), prevTotals.qty === 0 ? 'n.v.t.' : fmtPct(((totals.qty - prevTotals.qty) / prevTotals.qty) * 100), String(prevYearTotals.qty), prevYearTotals.qty === 0 ? 'n.v.t.' : fmtPct(((totals.qty - prevYearTotals.qty) / prevYearTotals.qty) * 100)],
      ],
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [30, 60, 80], textColor: 255 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      didParseCell: (data) => {
        if (data.section === 'body' && (data.column.index === 3 || data.column.index === 5)) {
          const txt = data.cell.text[0] || '';
          if (txt.startsWith('+')) data.cell.styles.textColor = [40, 130, 70];
          else if (txt.startsWith('-')) data.cell.styles.textColor = [180, 60, 60];
        }
      },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    // ===== TOP NOMENCLATUURCODES =====
    if (y > pageH - 80) { doc.addPage(); y = 18; }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Top ${topCodes.length} nomenclatuurcodes (op netto)`, 14, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      head: [['#', 'Code', 'Omschrijving', 'Aantal', 'Bruto (EUR)', 'Netto (EUR)', '% v. netto']],
      body: topCodes.map((c, i) => [
        String(i + 1),
        c.code,
        c.description.length > 50 ? c.description.substring(0, 47) + '...' : c.description,
        String(c.qty),
        fmt(c.bruto),
        fmt(c.netto),
        totals.netto > 0 ? `${((c.netto / totals.netto) * 100).toFixed(1)}%` : '-',
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 60, 80], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: { 0: { halign: 'right', cellWidth: 8 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });

    // ===== FOOTER op alle pagina's =====
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(140, 140, 140);
      doc.text(`MedIncome • Gegenereerd ${new Date().toLocaleDateString('nl-BE')} ${new Date().toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}`, 14, pageH - 6);
      doc.text(`Pagina ${i} / ${total}`, pageW - 14, pageH - 6, { align: 'right' });
    }

    // ===== AFGESLOTEN watermerk diagonaal op pagina 1 =====
    if (closure) {
      doc.setPage(1);
      doc.saveGraphicsState();
      // @ts-ignore - jsPDF GState exists at runtime
      doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
      doc.setTextColor(60, 140, 90);
      doc.setFontSize(110);
      doc.setFont('helvetica', 'bold');
      doc.text('AFGESLOTEN', pageW / 2, pageH / 2 + 20, { align: 'center', angle: 30 });
      doc.restoreGraphicsState();
    }

    doc.save(`maandrapport_${yearNum}_${String(monthNum).padStart(2, '0')}${closure ? '_afgesloten' : '_concept'}.pdf`);
    toast.success('Maandrapport gedownload');
  };

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const monthHasData = currentRecs.length > 0;

  return (
    <Card className="ios-card border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Maandafsluiting
              {closure && (
                <Badge variant="outline" className="border-green-600/40 text-green-700 dark:text-green-400 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Afgesloten
                </Badge>
              )}
            </CardTitle>
            <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
              Sluit een maand af met verschilcontrole, aandachtspunten en een PDF-samenvatting.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs md:hidden"
            onClick={() => setDetailsOpen((open) => !open)}
          >
            Details
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 md:space-y-5">
        <div className="grid grid-cols-2 gap-2 items-end sm:gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
          <div>
            <label className="text-xs text-muted-foreground">Jaar</label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Maand</label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((n, i) => <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={toggleClosure}
            variant={closure ? 'outline' : 'secondary'}
            disabled={busy || !monthHasData}
            className="w-full gap-2 md:w-auto"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : closure ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {closure ? 'Heropenen' : 'Afsluiten'}
          </Button>
          <Button onClick={generatePDF} disabled={!monthHasData} className="w-full gap-2 md:w-auto">
            <FileText className="h-4 w-4" /> PDF
          </Button>
        </div>

        {!monthHasData ? (
          <div className="rounded-xl border border-dashed border-border/50 py-6 text-center text-sm text-muted-foreground md:py-10">
            Geen records voor {MONTH_NAMES[monthNum - 1]} {yearNum}.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 md:hidden">
              <PreviewTile label="Netto" value={totals.netto} highlight />
              <PreviewTile label="Prestaties" value={totals.qty} isCount />
            </div>
            <div className={`${detailsOpen ? 'grid' : 'hidden'} grid-cols-2 gap-2 md:grid md:grid-cols-4 md:gap-3`}>
              <PreviewTile label="Bruto" value={totals.bruto} />
              <PreviewTile label="Aandeel Arts" value={totals.aandeel} />
              <PreviewTile label="Netto" value={totals.netto} highlight />
              <PreviewTile label="Prestaties" value={totals.qty} isCount />
            </div>
            <div className={`${detailsOpen ? 'grid' : 'hidden'} grid-cols-2 gap-2 md:grid md:grid-cols-5 md:gap-3`}>
              <CompareTile label="vs vorige maand" curr={totals.netto} prev={prevTotals.netto} subLabel={`${MONTH_NAMES[prevDate.month - 1].substring(0, 3)} ${prevDate.year}`} />
              <CompareTile label="vs vorig jaar" curr={totals.netto} prev={prevYearTotals.netto} subLabel={`${MONTH_NAMES[monthNum - 1].substring(0, 3)} ${yearNum - 1}`} />
              <PreviewTile label="Ambulant netto" value={ambulant.netto} small />
              <PreviewTile label="Gehosp. netto" value={hospitalized.netto} small />
              <PreviewTile label="Associatie netto" value={associatie.netto} small />
            </div>
          </div>
        )}

        <div className={`${detailsOpen ? 'block' : 'hidden'} rounded-xl border p-3 md:block md:p-4 ${closeChecklist.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${closeChecklist.ok ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'}`}>
              {closeChecklist.ok ? <CalendarCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="font-medium text-sm">Afsluitcontrole</p>
                <p className="text-xs text-muted-foreground">
                  Verwacht netto: {closeChecklist.expectedNetto > 0 ? `€ ${fmt(closeChecklist.expectedNetto)}` : 'n.v.t.'}
                  {closeChecklist.expectedNetto > 0 && (
                    <span className={closeChecklist.diff >= 0 ? ' text-emerald-700 dark:text-emerald-400' : ' text-destructive'}>
                      {' '}({closeChecklist.diff >= 0 ? '+' : ''}€ {fmt(closeChecklist.diff)}{closeChecklist.diffPct !== null ? `, ${fmtPct(closeChecklist.diffPct)}` : ''})
                    </span>
                  )}
                </p>
              </div>
              {closeChecklist.issues.length > 0 ? (
                <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-300">
                  {closeChecklist.issues.map(issue => <li key={issue}>• {issue}</li>)}
                </ul>
              ) : (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">Geen aandachtspunten gevonden. De maand is klaar om af te sluiten.</p>
              )}
              <input
                value={closeNote}
                onChange={(e) => setCloseNote(e.target.value)}
                disabled={!!closure}
                placeholder="Optionele afsluitnotitie"
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              {closure?.note && (
                <p className="whitespace-pre-line rounded-lg bg-background/70 p-2 text-xs text-muted-foreground">{closure.note}</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewTile({ label, value, highlight, isCount, small }: { label: string; value: number; highlight?: boolean; isCount?: boolean; small?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? 'border-primary/40 bg-primary/5' : 'border-border/50 bg-muted/30'}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 font-semibold tabular-nums ${small ? 'text-sm' : 'text-lg'}`}>
        {isCount ? value : `€ ${fmt(value)}`}
      </div>
    </div>
  );
}

function CompareTile({ label, curr, prev, subLabel }: { label: string; curr: number; prev: number; subLabel: string }) {
  const pct = pctChange(curr, prev);
  const Icon = pct === null || pct === 0 ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  const tone = pct === null || pct === 0 ? 'text-muted-foreground' : pct > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  return (
    <div className="rounded-md border border-border/50 bg-muted/30 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 flex items-center gap-1.5 font-semibold ${tone}`}>
        <Icon className="h-4 w-4" />
        {pct === null ? 'n.v.t.' : fmtPct(pct)}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{subLabel}: € {fmt(prev)}</div>
    </div>
  );
}
