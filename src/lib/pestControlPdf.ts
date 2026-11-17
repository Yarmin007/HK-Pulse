// Builds the PestEX "Pest Control Day & Night Worksheet" as a PDF, auto-filled from saved sheets.
// One A4 portrait page per sheet (date + shift); multi-sheet reports start with a summary page.
import { jsPDF } from 'jspdf';
import autoTable, { CellHookData } from 'jspdf-autotable';
import { PEST_TARGETS, PEST_METHODS, PEST_OUTLETS, PestWorksheet, PestShift, emptyWorksheet, pestRowHasData } from '@/lib/pestControl';

const M = 10; // page margin (mm)

const fmt = (iso: string) => {
  const [y, m, d] = (iso || '').split('-');
  return y && m && d ? `${d}-${m}-${y}` : iso || '';
};

// Hyphenated header labels so narrow columns break cleanly instead of mid-word
const HEAD_LABELS: Record<string, string> = { Cockroach: 'Cock-\nroach', Mosquitoes: 'Mosqu-\nitoes', Fumigation: 'Fumi-\ngation', 'Bait Station': 'Bait\nStation', 'Hand Spray': 'Hand\nSpray', 'Mist Blow': 'Mist\nBlow' };
const headLabels = () => [...PEST_TARGETS, ...PEST_METHODS].map(h => HEAD_LABELS[h] || h);

const TICK_COLS = PEST_TARGETS.length + PEST_METHODS.length; // columns 1..11 are tick boxes

const drawTick = (doc: jsPDF, x: number, y: number, w: number, h: number) => {
  const cx = x + w / 2;
  const cy = y + h / 2;
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(cx - 1.3, cy, cx - 0.35, cy + 0.95);
  doc.line(cx - 0.35, cy + 0.95, cx + 1.5, cy - 1.1);
};

const letterhead = (doc: jsPDF, title: string) => {
  const W = doc.internal.pageSize.getWidth();
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('PestEX Maldives [Pvt] Limited', W / 2, 14, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text("PestEX Building, Karankaa Magu, Henveiru, Male', Maldives. Phone: (960) 333 8009, 333 6878, Fax: 333 8005", W / 2, 18.5, { align: 'center' });
  doc.text('Email: services@pestexmaldives.com   Web: www.pestexmaldives.com', W / 2, 22, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(title, W / 2, 28, { align: 'center' });
  doc.setLineWidth(0.3);
  doc.line(M, 30.5, W - M, 30.5);
};

const sheetPage = (doc: jsPDF, sheet: PestWorksheet) => {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  letterhead(doc, 'PEST CONTROL DAY & NIGHT WORKSHEET');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('RESORT NAME :', M, 36);
  doc.text('DATE :', 118, 36);
  doc.text('SHIFT :', 162, 36);
  doc.setFont('helvetica', 'normal');
  doc.text(sheet.resort || 'SIX SENSES LAAMU', M + 26, 36);
  doc.text(fmt(sheet.date), 129, 36);
  doc.text(sheet.shift, 174, 36);

  const ticks: boolean[][] = [];
  const body = PEST_OUTLETS.map(outlet => {
    const r = sheet.rows[outlet];
    ticks.push([
      ...PEST_TARGETS.map(p => !!r?.pests?.includes(p)),
      ...PEST_METHODS.map(m => !!r?.methods?.includes(m)),
    ]);
    return [outlet.trim(), ...Array(TICK_COLS).fill(''), r?.chemical || '', r?.remarks || ''];
  });

  autoTable(doc, {
    startY: 39,
    margin: { left: M, right: M, bottom: M },
    theme: 'grid',
    head: [
      [
        { content: 'OUTLETS', rowSpan: 2, styles: { valign: 'middle', halign: 'left' } },
        { content: 'TARGET PEST', colSpan: PEST_TARGETS.length },
        { content: 'METHOD OF APPLICATION', colSpan: PEST_METHODS.length },
        { content: 'CHEMICAL USED', rowSpan: 2, styles: { valign: 'middle' } },
        { content: 'REMARKS', rowSpan: 2, styles: { valign: 'middle' } },
      ],
      headLabels(),
    ],
    body,
    styles: { fontSize: 6.3, cellPadding: 0.6, lineColor: 0, lineWidth: 0.15, textColor: 0, overflow: 'linebreak', minCellHeight: 3.8 },
    headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: 5.6 },
    columnStyles: {
      0: { cellWidth: 52, fontStyle: 'bold' },
      ...Object.fromEntries(Array.from({ length: TICK_COLS }, (_, i) => [i + 1, { cellWidth: 9, halign: 'center' as const }])),
      12: { cellWidth: 22 },
      13: { cellWidth: 'auto' },
    },
    didDrawCell: (data: CellHookData) => {
      if (data.section !== 'body') return;
      const c = data.column.index;
      if (c >= 1 && c <= TICK_COLS && ticks[data.row.index]?.[c - 1]) {
        drawTick(doc, data.cell.x, data.cell.y, data.cell.width, data.cell.height);
      }
    },
  });

  // Footer block (moves to a new page if the table ran long)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = ((doc as any).lastAutoTable?.finalY || 220) + 4;
  if (y + 52 > H - M) { doc.addPage(); y = M + 4; }

  const box = (label: string, text: string, top: number) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.text(label, M, top + 3.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    const lines = doc.splitTextToSize(text || '', W - 2 * M - 40).slice(0, 2);
    doc.text(lines, M + 40, top + 3.5);
    doc.setLineWidth(0.15);
    doc.rect(M, top, W - 2 * M, 9);
  };
  box('Extra work done:', sheet.extraWork, y);
  box("Representative's comments:", sheet.repComments, y + 9);

  const sigTop = y + 24;
  const colW = (W - 2 * M) / 2;
  ([['PestEX Technician', sheet.technician], ['Representative', sheet.representative]] as const).forEach(([title, p], i) => {
    const x = M + i * colW;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text(title, x, sigTop);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    [['Name:', p?.name || ''], ['Signature:', ''], ['Date:', fmt(p?.date || '')]].forEach(([lbl, val], j) => {
      const ly = sigTop + 6 + j * 7;
      doc.text(lbl, x, ly);
      doc.text(val, x + 18, ly - 0.6);
      doc.setLineWidth(0.15);
      doc.line(x + 17, ly + 0.6, x + colW - 8, ly + 0.6);
    });
  });
};

const summaryPage = (doc: jsPDF, sheets: PestWorksheet[], rangeLabel: string, missing: string[]) => {
  letterhead(doc, `PEST CONTROL SUMMARY — ${rangeLabel.toUpperCase()}`);
  const days = sheets.filter(s => s.shift === 'Day').length;
  const nights = sheets.length - days;
  const treated = new Set<string>();

  const rows = PEST_OUTLETS.map(outlet => {
    const used = sheets.map(s => s.rows[outlet]).filter(pestRowHasData);
    if (used.length) treated.add(outlet);
    const chems = Array.from(new Set(used.map(r => r!.chemical.trim()).filter(Boolean)));
    const n = (fn: (r: NonNullable<typeof used[number]>) => boolean) => { const c = used.filter(r => fn(r!)).length; return c ? String(c) : ''; };
    return [
      outlet.trim(),
      used.length ? String(used.length) : '',
      ...PEST_TARGETS.map(p => n(r => r.pests.includes(p))),
      ...PEST_METHODS.map(m => n(r => r.methods.includes(m))),
      chems.join(', '),
    ];
  });

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Resort: SIX SENSES LAAMU     Sheets: ${sheets.length} (Day ${days} · Night ${nights})     Outlets treated: ${treated.size}/${PEST_OUTLETS.length}`, M, 36);
  let startY = 39;
  if (missing.length) {
    doc.setFontSize(7);
    const txt = doc.splitTextToSize(`No sheet recorded on: ${missing.join(', ')}`, doc.internal.pageSize.getWidth() - 2 * M);
    doc.text(txt, M, 40);
    startY = 41 + txt.length * 3;
  }

  autoTable(doc, {
    startY,
    margin: { left: M, right: M, bottom: M },
    theme: 'grid',
    head: [
      [
        { content: 'OUTLETS', rowSpan: 2, styles: { valign: 'middle', halign: 'left' } },
        { content: 'VISITS', rowSpan: 2, styles: { valign: 'middle' } },
        { content: 'TARGET PEST (times)', colSpan: PEST_TARGETS.length },
        { content: 'METHOD (times)', colSpan: PEST_METHODS.length },
        { content: 'CHEMICALS USED', rowSpan: 2, styles: { valign: 'middle' } },
      ],
      headLabels(),
    ],
    body: rows,
    styles: { fontSize: 6.3, cellPadding: 0.6, lineColor: 0, lineWidth: 0.15, textColor: 0, minCellHeight: 3.8 },
    headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: 5.6 },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold' },
      1: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
      ...Object.fromEntries(Array.from({ length: TICK_COLS }, (_, i) => [i + 2, { cellWidth: 8.5, halign: 'center' as const }])),
      13: { cellWidth: 'auto' },
    },
  });
};

const eachDate = (from: string, to: string) => {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
};

export type PestPdfOptions = {
  from: string;
  to: string;
  shift: PestShift | 'Both';
  label: string;        // e.g. "17 Nov 2026" or "November 2026"
  includeSummary: boolean;
  blankWhenEmpty: boolean; // single day with nothing saved → print a blank form
};

// Returns the number of worksheet pages written
export const buildPestControlPdf = (sheets: PestWorksheet[], opts: PestPdfOptions): { doc: jsPDF; pages: number } => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let list = sheets;

  if (list.length === 0 && opts.blankWhenEmpty) {
    const shifts: PestShift[] = opts.shift === 'Both' ? ['Day', 'Night'] : [opts.shift];
    list = shifts.map(s => emptyWorksheet(opts.from, s));
  }

  const multi = opts.from !== opts.to;
  let first = true;
  if (multi && opts.includeSummary && list.length > 0) {
    const have = new Set(list.map(s => s.date));
    summaryPage(doc, list, opts.label, eachDate(opts.from, opts.to).filter(d => !have.has(d)).map(d => d.slice(8, 10) + '/' + d.slice(5, 7)));
    first = false;
  }

  list.forEach(sheet => {
    if (!first) doc.addPage();
    first = false;
    sheetPage(doc, sheet);
  });

  // Page numbers
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setTextColor(120);
    doc.text(`HK Pulse · Pest Control · ${opts.label} · Page ${i} of ${total}`, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 4, { align: 'center' });
    doc.setTextColor(0);
  }
  return { doc, pages: list.length };
};
