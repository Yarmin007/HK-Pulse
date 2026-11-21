// Fumigation report for any period: PDF (summary + per-villa table) and Excel (log + tracker by villa / month).
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TOTAL_VILLAS, DUE_DAYS, daysBetween, lastByVilla, type FumigationEntry } from '@/lib/fumigation';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (iso: string) => `${iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}`;
const dmy = (iso: string) => `${dm(iso)} ${iso.slice(0, 4)}`;
const VILLAS = Array.from({ length: TOTAL_VILLAS }, (_, i) => String(i + 1));

export type FumReportOpts = { from: string; to: string; label: string; asOf: string };

/** Months touched by the period, as YYYY-MM */
const monthsIn = (from: string, to: string) => {
  const out: string[] = [];
  let y = +from.slice(0, 4), m = +from.slice(5, 7);
  while (`${y}-${String(m).padStart(2, '0')}` <= to.slice(0, 7) && out.length < 60) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
};

export const fumigationStats = (all: FumigationEntry[], o: FumReportOpts) => {
  const inP = all.filter(e => e.date >= o.from && e.date <= o.to);
  const end = o.to < o.asOf ? o.to : o.asOf;
  const last = lastByVilla(all, end);
  const covered = new Set(inP.map(e => e.villa));
  const perMonth = monthsIn(o.from, o.to).map(ym => ({ ym, n: inP.filter(e => e.date.startsWith(ym)).length, villas: new Set(inP.filter(e => e.date.startsWith(ym)).map(e => e.villa)).size }));
  const overdue = VILLAS.filter(v => { const l = last.get(v); return !l || daysBetween(l.date, end) > DUE_DAYS; });
  const gaps: number[] = [];
  VILLAS.forEach(v => {
    const ds = all.filter(e => e.villa === v && e.date <= end).map(e => e.date).sort();
    for (let i = 1; i < ds.length; i++) if (ds[i] >= o.from) gaps.push(daysBetween(ds[i - 1], ds[i]));
  });
  return {
    inPeriod: inP, total: inP.length, covered: covered.size, notCovered: VILLAS.filter(v => !covered.has(v)),
    perMonth, overdue, last, end,
    avgGap: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
  };
};

export const buildFumigationPdf = (all: FumigationEntry[], o: FumReportOpts) => {
  const s = fumigationStats(all, o);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 12;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(109, 33, 88);
  doc.text('Villa Fumigation Report', M, 16);
  doc.setFontSize(10); doc.setTextColor(60);
  doc.text(`Six Senses Laamu · ${o.label} (${dmy(o.from)} – ${dmy(o.to)})`, M, 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(130);
  doc.text(`Generated ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })} · Due = more than ${DUE_DAYS} days since the last fumigation (as of ${dmy(s.end)})`, M, 27);

  // KPI boxes
  const kpis: [string, string][] = [
    ['Fumigations', String(s.total)],
    ['Villas done', `${s.covered} / ${TOTAL_VILLAS}`],
    ['Not done in period', String(s.notCovered.length)],
    [`Due (> ${DUE_DAYS} days)`, String(s.overdue.length)],
    ['Avg days between visits', s.avgGap === null ? '—' : String(s.avgGap)],
  ];
  const bw = (W - 2 * M - 4 * 4) / 5;
  kpis.forEach(([k, v], i) => {
    const x = M + i * (bw + 4);
    doc.setDrawColor(220); doc.setFillColor(250, 247, 250); doc.roundedRect(x, 31, bw, 17, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(30); doc.text(v, x + 4, 40);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120); doc.text(k, x + 4, 45);
  });

  // Per month
  autoTable(doc, {
    startY: 53, margin: { left: M, right: M },
    head: [['Month', ...s.perMonth.map(p => `${MON[+p.ym.slice(5) - 1]} ${p.ym.slice(2, 4)}`), 'Total']],
    body: [
      ['Fumigations', ...s.perMonth.map(p => String(p.n || '')), String(s.total)],
      ['Villas', ...s.perMonth.map(p => String(p.villas || '')), String(s.covered)],
    ],
    theme: 'grid', styles: { fontSize: 7.5, halign: 'center', cellPadding: 1.2 }, headStyles: { fillColor: [109, 33, 88] },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = (doc as any).lastAutoTable.finalY + 6;
  const listBlock = (title: string, villas: string[]) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30);
    doc.text(`${title} (${villas.length})`, M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(70);
    const txt = villas.length ? villas.map(v => { const l = s.last.get(v); return `V${v}${l ? ` (${daysBetween(l.date, s.end)}d)` : ' (none)'}`; }).join('   ') : 'None';
    const lines = doc.splitTextToSize(txt, W - 2 * M);
    doc.text(lines, M, y + 4.5);
    y += 6 + lines.length * 3.6;
  };
  listBlock(`Due — more than ${DUE_DAYS} days or never`, s.overdue);
  listBlock('Not fumigated in this period', s.notCovered);

  // Per villa
  doc.addPage();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(109, 33, 88);
  doc.text(`By villa — ${o.label}`, M, 14);
  autoTable(doc, {
    startY: 18, margin: { left: M, right: M },
    head: [['Villa', 'Visits', 'Dates in period', 'Last fumigation', 'Days since', 'Remarks']],
    body: VILLAS.map(v => {
      const mine = s.inPeriod.filter(e => e.villa === v).sort((a, b) => a.date.localeCompare(b.date));
      const l = s.last.get(v);
      const days = l ? daysBetween(l.date, s.end) : null;
      return [`V${v}`, String(mine.length || ''), mine.map(e => dm(e.date)).join(', '), l ? dmy(l.date) : '—', days === null ? '—' : String(days),
        Array.from(new Set(mine.map(e => e.remarks).filter(Boolean))).join('; ')];
    }),
    theme: 'grid', styles: { fontSize: 7.2, cellPadding: 1 }, headStyles: { fillColor: [109, 33, 88] },
    columnStyles: { 0: { cellWidth: 13, fontStyle: 'bold' }, 1: { cellWidth: 13, halign: 'center' }, 2: { cellWidth: 110 }, 3: { cellWidth: 28 }, 4: { cellWidth: 18, halign: 'center' } },
    didParseCell: d => {
      if (d.section !== 'body' || d.column.index !== 4) return;
      const n = Number(d.cell.raw);
      if (d.cell.raw === '—' || n > DUE_DAYS) { d.cell.styles.textColor = [190, 18, 60]; d.cell.styles.fontStyle = 'bold'; }
      else if (n > 60) d.cell.styles.textColor = [194, 65, 12];
    },
  });

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(140);
    doc.text(`HK Pulse · Villa Fumigation · ${o.label} · Page ${i} of ${total}`, W / 2, doc.internal.pageSize.getHeight() - 5, { align: 'center' });
  }
  return doc;
};

export const buildFumigationXlsx = async (all: FumigationEntry[], o: FumReportOpts): Promise<Blob> => {
  const XLSX = await import('xlsx');
  const s = fumigationStats(all, o);
  const months = monthsIn(o.from, o.to);
  const wb = XLSX.utils.book_new();

  // Tracker: villa × month (like the original sheet), dates in each cell
  const tracker = [
    [`VILLA FUMIGATION — ${o.label.toUpperCase()}`],
    [],
    ['Villa No', ...months.map(ym => `${MON[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`), 'Total Visits', 'Last fumigation', 'Days since', 'Notes'],
    ...VILLAS.map(v => {
      const mine = s.inPeriod.filter(e => e.villa === v);
      const l = s.last.get(v);
      return [+v, ...months.map(ym => mine.filter(e => e.date.startsWith(ym)).map(e => dm(e.date)).sort().join(', ')), mine.length,
        l ? dmy(l.date) : '', l ? daysBetween(l.date, s.end) : '', Array.from(new Set(mine.map(e => e.remarks).filter(Boolean))).join('; ')];
    }),
    ['Total', ...months.map(ym => s.inPeriod.filter(e => e.date.startsWith(ym)).length), s.total],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(tracker);
  ws1['!cols'] = [{ wch: 9 }, ...months.map(() => ({ wch: 14 })), { wch: 11 }, { wch: 15 }, { wch: 10 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'By villa');

  // Log: every entry
  const log = [['Date', 'Time', 'Villa', 'Remarks', 'Logged by'],
    ...[...s.inPeriod].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).map(e => [dmy(e.date), e.time, +e.villa, e.remarks, e.source === 'import' ? 'Imported' : e.by])];
  const ws2 = XLSX.utils.aoa_to_sheet(log);
  ws2['!cols'] = [{ wch: 13 }, { wch: 7 }, { wch: 7 }, { wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Log');

  // Summary
  const sum = [['Summary', o.label], ['Fumigations', s.total], ['Villas done', `${s.covered} / ${TOTAL_VILLAS}`], [`Due (> ${DUE_DAYS} days)`, s.overdue.length],
    ['Avg days between visits', s.avgGap ?? ''], [], ['Month', 'Fumigations', 'Villas'], ...s.perMonth.map(p => [`${MON[+p.ym.slice(5) - 1]} ${p.ym.slice(0, 4)}`, p.n, p.villas]),
    [], ['Due villas', s.overdue.map(v => `V${v}`).join(', ')], ['Not done in period', s.notCovered.map(v => `V${v}`).join(', ')]];
  const ws3 = XLSX.utils.aoa_to_sheet(sum);
  ws3['!cols'] = [{ wch: 24 }, { wch: 60 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Summary');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
