// Villa fumigation report for a month, a year or any period.
//   PDF   (landscape A4) page 1: header band, key numbers, fumigations per month (bar chart), villa status
//         (bar + legend) and the villas that are due. Page 2: the tracker — every villa × month with the
//         day(s) it was done, colour-coded days since the last fumigation (a one-month report lists dates instead).
//   Excel (ExcelJS, styled) Overview · Tracker (villa × month, like the paper tracker) · Log (every entry, filterable).
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TOTAL_VILLAS, DUE_DAYS, daysBetween, lastByVilla, band, villaRanges, type FumigationEntry, type Band } from '@/lib/fumigation';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (iso: string) => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}`;
const dmy = (iso: string) => `${dm(iso)} ${iso.slice(0, 4)}`;
const VILLAS = Array.from({ length: TOTAL_VILLAS }, (_, i) => String(i + 1));

// Colours (same as the app)
const C = {
  plum: [109, 33, 88] as const, plumSoft: [243, 232, 240] as const, ink: [30, 41, 59] as const, mute: [100, 116, 139] as const,
  line: [226, 232, 240] as const, paper: [248, 250, 252] as const,
  fresh: [16, 185, 129] as const, ok: [190, 242, 100] as const, soon: [252, 211, 77] as const, due: [244, 63, 94] as const, never: [203, 213, 225] as const, blocked: [148, 163, 184] as const,
};
const BAND_TXT: Record<Band, string> = { fresh: '0–30 days', ok: '31–60 days', soon: '61–90 days', due: `> ${DUE_DAYS} days`, never: 'No record', blocked: 'Blocked' };
const BANDS: Band[] = ['fresh', 'ok', 'soon', 'due', 'never', 'blocked'];

/** blocked = villas closed (renovation): never counted as due, left out of the active-villa numbers */
export type FumReportOpts = { from: string; to: string; label: string; asOf: string; blocked?: string[] };

const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
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
  const blocked = new Set((o.blocked || []).map(String));
  const active = VILLAS.filter(v => !blocked.has(v));
  const daysOf = (v: string) => { const l = last.get(v); return l ? daysBetween(l.date, end) : null; };
  const bandOf = (v: string): Band => band(daysOf(v), blocked.has(v));
  const done = VILLAS.filter(v => covered.has(v)).map(v => {
    const list = inP.filter(e => e.villa === v).sort((a, b) => a.date.localeCompare(b.date));
    return { v, n: list.length, dates: list.map(e => e.date) };
  });
  const overdue = VILLAS.filter(v => { const b = bandOf(v); return b === 'due' || b === 'never'; }).sort((a, b) => (daysOf(b) ?? 9999) - (daysOf(a) ?? 9999));
  const gaps: number[] = [];
  active.forEach(v => {
    const ds = all.filter(e => e.villa === v && e.date <= end).map(e => e.date).sort();
    for (let i = 1; i < ds.length; i++) if (ds[i] >= o.from) gaps.push(daysBetween(ds[i - 1], ds[i]));
  });
  const bands = BANDS.map(b => ({ b, n: VILLAS.filter(v => bandOf(v) === b).length })).filter(x => x.b !== 'blocked' || x.n);
  return {
    inPeriod: inP, total: inP.length, covered: covered.size, coveredActive: active.filter(v => covered.has(v)).length,
    notCovered: active.filter(v => !covered.has(v)), done, blocked, active,
    perMonth, overdue, last, end, daysOf, bandOf, bands,
    avgGap: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
  };
};

// =====================================================================================================
// PDF
// =====================================================================================================
type RGB = readonly [number, number, number];
const fillC = (doc: jsPDF, c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
const textC = (doc: jsPDF, c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
const drawC = (doc: jsPDF, c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

export const buildFumigationPdf = (all: FumigationEntry[], o: FumReportOpts) => {
  const s = fumigationStats(all, o);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 12;

  const header = (sub: string) => {
    fillC(doc, C.plum); doc.rect(0, 0, W, 22, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(255);
    doc.text('Villa Fumigation Report', M, 11);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(240, 220, 235);
    doc.text(`${o.label}  ·  ${dmy(o.from)} – ${dmy(o.to)}${sub ? `  ·  ${sub}` : ''}`, M, 17.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255);
    doc.text('SIX SENSES LAAMU', W - M, 11, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(240, 220, 235);
    doc.text('Housekeeping · Pest Control', W - M, 17.5, { align: 'right' });
  };

  // ---------------- Page 1: overview ----------------
  header('Overview');

  // Key numbers
  const kpis: { k: string; v: string; sub: string; accent: RGB }[] = [
    { k: 'Fumigations', v: String(s.total), sub: 'visits in the period', accent: C.plum },
    { k: 'Villas done', v: `${s.coveredActive}`, sub: `of ${s.active.length} active villas${s.blocked.size ? ` (${s.blocked.size} blocked)` : ''}`, accent: C.fresh },
    { k: 'Not done', v: String(s.notCovered.length), sub: 'active villas in the period', accent: C.mute },
    { k: 'Due now', v: String(s.overdue.length), sub: `active, > ${DUE_DAYS} days or none`, accent: C.due },
    { k: 'Average gap', v: s.avgGap === null ? '—' : `${s.avgGap}`, sub: 'days between visits', accent: C.soon },
  ];
  const gap = 4, kw = (W - 2 * M - gap * (kpis.length - 1)) / kpis.length, ky = 28, kh = 22;
  kpis.forEach((k, i) => {
    const x = M + i * (kw + gap);
    fillC(doc, C.paper); drawC(doc, C.line); doc.setLineWidth(0.2); doc.roundedRect(x, ky, kw, kh, 2.5, 2.5, 'FD');
    fillC(doc, k.accent); doc.roundedRect(x, ky, 1.6, kh, 0.8, 0.8, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); textC(doc, C.mute); doc.text(k.k.toUpperCase(), x + 5, ky + 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(19); textC(doc, k.k === 'Due now' && s.overdue.length ? C.due : C.ink); doc.text(k.v, x + 5, ky + 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); textC(doc, C.mute); doc.text(k.sub, x + 5, ky + 19.5);
  });

  // Panel helper
  const panel = (x: number, y: number, w: number, h: number, title: string) => {
    drawC(doc, C.line); doc.setLineWidth(0.2); doc.setFillColor(255, 255, 255); doc.roundedRect(x, y, w, h, 2.5, 2.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); textC(doc, C.ink); doc.text(title, x + 5, y + 7);
  };

  // Fumigations per month (bar chart)
  const py = ky + kh + 6, ph = 74, pw = (W - 2 * M) * 0.62;
  // One month → per day; longer → per month
  const single = s.perMonth.length === 1;
  const bars = single
    ? (() => { const ym = s.perMonth[0].ym; const last = +monthEnd(ym).slice(8); return Array.from({ length: last }, (_, i) => { const d = `${ym}-${String(i + 1).padStart(2, '0')}`; const list = s.inPeriod.filter(e => e.date === d); return { key: d, label: String(i + 1), n: list.length, sub: 0, hot: d === o.asOf }; }); })()
    : s.perMonth.map(p => ({ key: p.ym, label: s.perMonth.length > 12 ? `${MON[+p.ym.slice(5) - 1]} ${p.ym.slice(2, 4)}` : MON[+p.ym.slice(5) - 1], n: p.n, sub: p.villas, hot: p.ym === o.asOf.slice(0, 7) }));
  panel(M, py, pw, ph, single ? 'Fumigations per day' : 'Fumigations per month');
  {
    const cx = M + 8, cy = py + 14, cw = pw - 16, ch = ph - 26;
    const max = Math.max(1, ...bars.map(p => p.n));
    const n = bars.length;
    const slot = cw / Math.max(1, n), bw = Math.min(14, slot * 0.62);
    drawC(doc, C.line); doc.setLineWidth(0.15);
    [0.25, 0.5, 0.75, 1].forEach(f => { const yy = cy + ch - ch * f; doc.line(cx, yy, cx + cw, yy); });
    doc.line(cx, cy + ch, cx + cw, cy + ch);
    bars.forEach((p, i) => {
      const bh = (p.n / max) * ch;
      const x = cx + i * slot + (slot - bw) / 2;
      if (p.n) { fillC(doc, p.hot ? C.plum : [176, 120, 160]); doc.roundedRect(x, cy + ch - bh, bw, bh, Math.min(1, bw / 3), Math.min(1, bw / 3), 'F'); }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(n > 20 ? 6 : 7.5); textC(doc, C.ink);
      if (p.n) doc.text(String(p.n), x + bw / 2, cy + ch - bh - 1.5, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(n > 20 ? 5.5 : n > 14 ? 5.5 : 7); textC(doc, C.mute);
      doc.text(p.label, x + bw / 2, cy + ch + 4.5, { align: 'center' });
      if (p.sub) { doc.setFontSize(6); doc.text(`${p.sub} villas`, x + bw / 2, cy + ch + 8, { align: 'center' }); }
    });
  }

  // Villa status (stacked bar + legend)
  const sx = M + pw + 5, sw = W - M - sx;
  panel(sx, py, sw, ph, `Villa status · as of ${dmy(s.end)}`);
  {
    const bx = sx + 6, by = py + 13, bwid = sw - 12, bh = 8;
    let x = bx;
    s.bands.forEach(({ b, n }) => {
      if (!n) return;
      const w = (n / TOTAL_VILLAS) * bwid;
      fillC(doc, C[b]); doc.rect(x, by, w, bh, 'F');
      if (w > 7) { doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(b === 'ok' || b === 'soon' || b === 'never' ? 40 : 255); doc.text(String(n), x + w / 2, by + 5.3, { align: 'center' }); }
      x += w;
    });
    s.bands.forEach(({ b, n }, i) => {
      const ly = by + 15 + i * (s.bands.length > 5 ? 7.6 : 8.5);
      fillC(doc, C[b]); doc.roundedRect(bx, ly - 3.5, 4.5, 4.5, 0.8, 0.8, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); textC(doc, C.ink); doc.text(b === 'blocked' ? `Blocked · V${villaRanges([...s.blocked])}` : BAND_TXT[b], bx + 7, ly);
      doc.setFont('helvetica', 'bold'); doc.text(`${n}`, bx + bwid, ly, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); textC(doc, C.mute); doc.text(`${Math.round((n / TOTAL_VILLAS) * 100)}%`, bx + bwid - 9, ly, { align: 'right' });
    });
  }

  // Villas fumigated in the period: a 97-villa map (plum = fumigated, with the day(s) or the number of visits)
  const dy = py + ph + 5;
  const dh = H - dy - 10;
  const oneMonthP = s.perMonth.length === 1;
  panel(M, dy, W - 2 * M, dh, `Villas fumigated in this period — ${s.covered} villa${s.covered === 1 ? '' : 's'}, ${s.total} fumigation${s.total === 1 ? '' : 's'}`);
  {
    const cols = 17, gapX = 1.6, gapY = 1.6;
    const gx = M + 5, gy = dy + 10.5, gw = W - 2 * M - 10;
    const cw = (gw - gapX * (cols - 1)) / cols;
    const rows = Math.ceil(TOTAL_VILLAS / cols);
    const chh = Math.min(9.5, (dh - 18 - gapY * (rows - 1)) / rows);
    const byV = new Map(s.done.map(d => [d.v, d]));
    VILLAS.forEach((v, i) => {
      const x = gx + (i % cols) * (cw + gapX), y = gy + Math.floor(i / cols) * (chh + gapY);
      const d = byV.get(v);
      const isBlocked = s.blocked.has(v);
      if (d) { fillC(doc, C.plum); doc.roundedRect(x, y, cw, chh, 1.2, 1.2, 'F'); }
      else if (isBlocked) { fillC(doc, [226, 232, 240]); doc.roundedRect(x, y, cw, chh, 1.2, 1.2, 'F'); }
      else { doc.setFillColor(255, 255, 255); drawC(doc, C.line); doc.setLineWidth(0.25); doc.roundedRect(x, y, cw, chh, 1.2, 1.2, 'FD'); }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      if (d) doc.setTextColor(255); else textC(doc, isBlocked ? C.mute : [148, 163, 184]);
      doc.text(String(v), x + 1.8, y + 3.6);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.6);
      const sub = d ? (oneMonthP ? d.dates.map(x2 => String(+x2.slice(8))).join(', ') : `${d.n}×`) : isBlocked ? 'blocked' : '—';
      if (d) doc.setTextColor(243, 232, 240);
      doc.text(sub, x + cw - 1.5, y + chh - 1.5, { align: 'right', maxWidth: cw - 3 });
    });
    // legend
    const ly = gy + rows * (chh + gapY) + 2.5;
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    let lx = gx;
    const key: [string, RGB, boolean][] = [[`Fumigated (${oneMonthP ? 'day of the month' : 'number of visits'})`, C.plum, false], [`Not fumigated (${s.notCovered.length})`, [255, 255, 255], true], ...(s.blocked.size ? [[`Blocked — renovation (${s.blocked.size})`, [226, 232, 240], false] as [string, RGB, boolean]] : [])];
    key.forEach(([t, c, outline]) => {
      fillC(doc, c); drawC(doc, C.line); doc.roundedRect(lx, ly - 2.6, 3.2, 3.2, 0.5, 0.5, outline ? 'FD' : 'F');
      textC(doc, C.mute); doc.text(t, lx + 4.5, ly);
      lx += doc.getTextWidth(t) + 10;
    });
  }

  // ---------------- Page 2: tracker ----------------
  doc.addPage();
  const months = monthsIn(o.from, o.to);
  const oneMonth = months.length === 1;
  header(oneMonth ? 'Villas' : 'Tracker');
  const half = Math.ceil(TOTAL_VILLAS / 2);
  const halves = [VILLAS.slice(0, half), VILLAS.slice(half)];
  const tableW = (W - 2 * M - 6) / 2;

  const statusCell = (v: string) => { if (s.blocked.has(v)) return 'Blocked'; const d = s.daysOf(v); return d === null ? '—' : String(d); };
  const trackerPage = doc.getNumberOfPages();
  halves.forEach((list, hi) => {
    doc.setPage(trackerPage); // both halves side by side on the same page
    const head = oneMonth ? [['Villa', 'Fumigated on', 'Remarks', 'Last', 'Days']] : [['Villa', ...months.map(ym => (months.length > 12 ? `${MON[+ym.slice(5) - 1]}${ym.slice(2, 4)}` : MON[+ym.slice(5) - 1])), 'Total', 'Days']];
    const body = list.map(v => {
      const mine = s.inPeriod.filter(e => e.villa === v).sort((a, b) => a.date.localeCompare(b.date));
      const l = s.last.get(v);
      if (oneMonth) return [v, mine.map(e => `${dm(e.date)}${e.time ? ` ${e.time}` : ''}`).join(', '), Array.from(new Set(mine.map(e => e.remarks).filter(Boolean))).join('; '), l ? dm(l.date) : '—', statusCell(v)];
      return [v, ...months.map(ym => mine.filter(e => e.date.startsWith(ym)).map(e => String(+e.date.slice(8, 10))).join(', ')), mine.length ? String(mine.length) : '', statusCell(v)];
    });
    const lastIdx = head[0].length - 1;
    autoTable(doc, {
      head, body,
      startY: 26,
      margin: { left: M + hi * (tableW + 6), right: W - M - hi * (tableW + 6) - tableW, bottom: 9 },
      tableWidth: tableW,
      theme: 'grid',
      styles: { fontSize: oneMonth ? 6.3 : 6, cellPadding: { top: 0.3, bottom: 0.3, left: 0.7, right: 0.7 }, lineColor: [226, 232, 240], lineWidth: 0.1, textColor: [30, 41, 59], halign: 'center', valign: 'middle', minCellHeight: 3.2, overflow: 'ellipsize' },
      headStyles: { fillColor: [109, 33, 88], textColor: 255, fontStyle: 'bold', fontSize: 6.4, cellPadding: 0.8, minCellHeight: 4.5 },
      columnStyles: oneMonth
        ? { 0: { cellWidth: 9, fontStyle: 'bold' }, 1: { halign: 'left' }, 2: { halign: 'left', cellWidth: tableW * 0.3 }, 3: { cellWidth: 14 }, 4: { cellWidth: 11, fontStyle: 'bold' } }
        : { 0: { cellWidth: 9, fontStyle: 'bold' }, [lastIdx - 1]: { cellWidth: 9, fontStyle: 'bold' }, [lastIdx]: { cellWidth: 11, fontStyle: 'bold' } },
      alternateRowStyles: { fillColor: [250, 250, 252] },
      didParseCell: d => {
        if (d.section !== 'body') return;
        const v = list[d.row.index];
        if (d.column.index === lastIdx) {
          const b = s.bandOf(v);
          d.cell.styles.fillColor = [...C[b]] as [number, number, number];
          d.cell.styles.textColor = b === 'fresh' || b === 'due' || b === 'blocked' ? 255 : 40;
          if (b === 'blocked') d.cell.styles.fontSize = 5.2;
        } else if (!oneMonth && d.column.index > 0 && d.column.index < lastIdx - 1 && String(d.cell.raw || '')) {
          d.cell.styles.fillColor = [243, 232, 240];
          d.cell.styles.textColor = [109, 33, 88];
          d.cell.styles.fontStyle = 'bold';
        }
      },
    });
  });
  // legend
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); textC(doc, C.mute);
  doc.text('Days since last fumigation:', M, H - 5.4);
  let lx = M + doc.getTextWidth('Days since last fumigation:') + 3;
  doc.setFont('helvetica', 'normal');
  BANDS.filter(b => b !== 'blocked' || s.blocked.size).forEach(b => {
    fillC(doc, C[b]); doc.roundedRect(lx, H - 7.8, 3.2, 3.2, 0.5, 0.5, 'F');
    textC(doc, C.mute); doc.text(BAND_TXT[b], lx + 4.5, H - 5.4);
    lx += doc.getTextWidth(BAND_TXT[b]) + 9;
  });
  if (!oneMonth) { textC(doc, C.mute); doc.text('Month cells show the day(s) of the month the villa was fumigated.', lx + 2, H - 5.4); }

  // footer
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); textC(doc, C.mute);
    doc.text(`HK Pulse · generated ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · page ${i} of ${total}`, W - M, H - 5.4, { align: 'right' });
  }
  return doc;
};

// =====================================================================================================
// Excel
// =====================================================================================================
const hex = (c: RGB) => 'FF' + c.map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
const solid = (c: RGB) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: hex(c) } });
const thin = { style: 'thin' as const, color: { argb: 'FFE2E8F0' } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

export const buildFumigationXlsx = async (all: FumigationEntry[], o: FumReportOpts): Promise<Blob> => {
  const ExcelJS = (await import('exceljs')).default;
  const s = fumigationStats(all, o);
  const months = monthsIn(o.from, o.to);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HK Pulse';

  const titleRows = (ws: import('exceljs').Worksheet, lastCol: number, sub: string) => {
    ws.mergeCells(1, 1, 1, lastCol);
    const t = ws.getCell(1, 1);
    t.value = 'Villa Fumigation Report — Six Senses Laamu';
    t.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
    t.fill = solid(C.plum); t.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(1).height = 28;
    ws.mergeCells(2, 1, 2, lastCol);
    const st = ws.getCell(2, 1);
    st.value = `${o.label}  ·  ${dmy(o.from)} – ${dmy(o.to)}  ·  ${sub}`;
    st.font = { size: 10, color: { argb: 'FF6D2158' } }; st.fill = solid(C.plumSoft); st.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(2).height = 20;
  };
  const headRow = (ws: import('exceljs').Worksheet, r: number, labels: string[]) => {
    const row = ws.getRow(r);
    labels.forEach((l, i) => {
      const c = row.getCell(i + 1);
      c.value = l; c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; c.fill = solid(C.plum);
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = box;
    });
    row.height = 22;
  };
  const lightText = (b: Band) => b === 'fresh' || b === 'due' || b === 'blocked';
  const bandFill = (v: string) => { const b = s.bandOf(v); return { fill: solid(C[b]), font: { bold: true, color: { argb: lightText(b) ? 'FFFFFFFF' : 'FF1E293B' } } }; };

  // ---------------- Overview ----------------
  {
    const ws = wb.addWorksheet('Overview', { views: [{ showGridLines: false }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = [{ width: 24 }, { width: 14 }, { width: 14 }, { width: 4 }, { width: 22 }, { width: 14 }, { width: 14 }];
    titleRows(ws, 7, `as of ${dmy(s.end)}`);

    // Key numbers
    const kp: [string, string | number, RGB][] = [
      ['Fumigations', s.total, C.plum], ['Villas done (active)', `${s.coveredActive} / ${s.active.length}`, C.fresh], ['Active villas not done', s.notCovered.length, C.mute],
      [`Due (> ${DUE_DAYS} days or never)`, s.overdue.length, C.due], ['Average days between visits', s.avgGap ?? '—', C.soon],
      ...(s.blocked.size ? [[`Blocked (renovation): V${villaRanges([...s.blocked])}`, s.blocked.size, C.blocked] as [string, number, RGB]] : []),
    ];
    ws.getCell('A4').value = 'KEY NUMBERS'; ws.getCell('A4').font = { bold: true, size: 9, color: { argb: 'FF64748B' } };
    kp.forEach(([k, v, c], i) => {
      const r = 5 + i;
      const a = ws.getCell(r, 1), b = ws.getCell(r, 2);
      a.value = k; a.font = { size: 11, color: { argb: 'FF1E293B' } }; a.border = { left: { style: 'thick', color: { argb: hex(c) } }, bottom: thin, top: thin };
      b.value = v; b.font = { bold: true, size: 13, color: { argb: i === 3 && s.overdue.length ? hex(C.due) : 'FF1E293B' } }; b.alignment = { horizontal: 'right' }; b.border = { bottom: thin, top: thin, right: thin };
      ws.getRow(r).height = 21;
    });

    // Villa status
    ws.getCell('E4').value = `VILLA STATUS (as of ${dmy(s.end)})`; ws.getCell('E4').font = { bold: true, size: 9, color: { argb: 'FF64748B' } };
    s.bands.forEach(({ b, n }, i) => {
      const r = 5 + i;
      const a = ws.getCell(r, 5), c2 = ws.getCell(r, 6), c3 = ws.getCell(r, 7);
      a.value = b === 'never' ? 'No record' : b === 'blocked' ? 'Blocked (renovation)' : `${BAND_TXT[b]} since`; a.fill = solid(C[b]); a.font = { bold: true, color: { argb: lightText(b) ? 'FFFFFFFF' : 'FF1E293B' } }; a.border = box;
      c2.value = n; c2.alignment = { horizontal: 'center' }; c2.font = { bold: true }; c2.border = box;
      c3.value = n / TOTAL_VILLAS; c3.numFmt = '0%'; c3.alignment = { horizontal: 'center' }; c3.font = { color: { argb: 'FF64748B' } }; c3.border = box;
    });

    // Per month
    let r = 12;
    ws.getCell(r, 1).value = 'FUMIGATIONS PER MONTH'; ws.getCell(r, 1).font = { bold: true, size: 9, color: { argb: 'FF64748B' } };
    r++;
    headRow(ws, r, ['Month', 'Fumigations', 'Villas']);
    const max = Math.max(1, ...s.perMonth.map(p => p.n));
    s.perMonth.forEach(p => {
      r++;
      const row = ws.getRow(r);
      row.getCell(1).value = `${MON[+p.ym.slice(5) - 1]} ${p.ym.slice(0, 4)}`;
      row.getCell(2).value = p.n; row.getCell(3).value = p.villas;
      [1, 2, 3].forEach(c => { row.getCell(c).border = box; if (c > 1) row.getCell(c).alignment = { horizontal: 'center' }; });
      // simple in-cell bar: tint by size
      const t = p.n / max;
      row.getCell(2).fill = solid([Math.round(255 - (255 - 176) * t), Math.round(255 - (255 - 120) * t), Math.round(255 - (255 - 160) * t)]);
      if (t > 0.6) row.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    });
    r++;
    const tot = ws.getRow(r);
    tot.getCell(1).value = 'Total'; tot.getCell(2).value = s.total; tot.getCell(3).value = s.covered;
    [1, 2, 3].forEach(c => { const cell = tot.getCell(c); cell.font = { bold: true }; cell.fill = solid(C.plumSoft); cell.border = box; if (c > 1) cell.alignment = { horizontal: 'center' }; });

    // Villas fumigated in the period
    let d = 12;
    ws.getCell(d, 5).value = `VILLAS FUMIGATED IN THIS PERIOD (${s.covered})`; ws.getCell(d, 5).font = { bold: true, size: 9, color: { argb: 'FF64748B' } };
    d++;
    ['Villa', 'Visits', 'Dates'].forEach((l, i) => { const c = ws.getCell(d, 5 + i); c.value = l; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = solid(C.plum); c.alignment = { horizontal: 'center' }; c.border = box; });
    s.done.forEach((x, k) => {
      d++;
      const vals: (string | number)[] = [`V${x.v}`, x.n, x.dates.map(dm).join(', ')];
      vals.forEach((val, i) => {
        const c = ws.getCell(d, 5 + i); c.value = val; c.border = box;
        c.alignment = i === 2 ? { horizontal: 'left', wrapText: true, vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
        if (i === 0) c.font = { bold: true, color: { argb: 'FF6D2158' } };
        if (k % 2 === 1) c.fill = solid([250, 250, 252]);
      });
    });
    if (!s.done.length) { ws.getCell(d + 1, 5).value = 'None'; ws.getCell(d + 1, 5).font = { color: { argb: 'FF64748B' } }; }
    ws.getColumn(7).width = 44;
  }

  // ---------------- Tracker ----------------
  {
    const lastCol = 1 + months.length + 4;
    const ws = wb.addWorksheet('Tracker', {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 4, showGridLines: false }],
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '4:4', margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    });
    ws.columns = [{ width: 8 }, ...months.map(() => ({ width: months.length > 12 ? 9 : 11 })), { width: 8 }, { width: 15 }, { width: 8 }, { width: 30 }];
    titleRows(ws, lastCol, 'day(s) of the month each villa was fumigated');
    headRow(ws, 4, ['Villa', ...months.map(ym => `${MON[+ym.slice(5) - 1]}${months.length > 12 || months[0].slice(0, 4) !== months[months.length - 1].slice(0, 4) ? ` ${ym.slice(2, 4)}` : ''}`), 'Visits', 'Last fumigation', 'Days since', 'Notes']);
    VILLAS.forEach((v, i) => {
      const r = 5 + i;
      const row = ws.getRow(r);
      const mine = s.inPeriod.filter(e => e.villa === v).sort((a, b) => a.date.localeCompare(b.date));
      const l = s.last.get(v);
      row.getCell(1).value = +v;
      row.getCell(1).font = { bold: true }; row.getCell(1).alignment = { horizontal: 'center' };
      months.forEach((ym, mi) => {
        const days = mine.filter(e => e.date.startsWith(ym)).map(e => +e.date.slice(8, 10));
        const c = row.getCell(2 + mi);
        if (days.length) { c.value = days.join(', '); c.fill = solid(C.plumSoft); c.font = { bold: true, color: { argb: 'FF6D2158' } }; }
        c.alignment = { horizontal: 'center' };
      });
      const cv = row.getCell(2 + months.length); cv.value = mine.length || null; cv.alignment = { horizontal: 'center' }; cv.font = { bold: true };
      const cl = row.getCell(3 + months.length); cl.value = l ? dmy(l.date) : 'No record'; cl.alignment = { horizontal: 'center' };
      const cd = row.getCell(4 + months.length); cd.value = s.blocked.has(v) ? 'Blocked' : s.daysOf(v) ?? '—'; cd.alignment = { horizontal: 'center' }; Object.assign(cd, bandFill(v));
      const cn = row.getCell(5 + months.length); cn.value = Array.from(new Set(mine.map(e => e.remarks).filter(Boolean))).join('; ') || null; cn.font = { color: { argb: 'FF475569' } };
      for (let c = 1; c <= lastCol; c++) {
        const cell = row.getCell(c);
        cell.border = box;
        if (i % 2 === 1 && !cell.fill) cell.fill = solid([250, 250, 252]);
      }
      row.height = 17;
    });
    const tr = ws.getRow(5 + TOTAL_VILLAS);
    tr.getCell(1).value = 'Total';
    months.forEach((ym, mi) => { tr.getCell(2 + mi).value = s.inPeriod.filter(e => e.date.startsWith(ym)).length; });
    tr.getCell(2 + months.length).value = s.total;
    for (let c = 1; c <= lastCol; c++) { const cell = tr.getCell(c); cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = solid(C.plum); cell.alignment = { horizontal: 'center' }; cell.border = box; }
    tr.height = 20;
    // legend
    const lr = 7 + TOTAL_VILLAS;
    ws.getCell(lr, 1).value = 'Days since:'; ws.getCell(lr, 1).font = { bold: true, size: 9, color: { argb: 'FF64748B' } };
    BANDS.filter(b => b !== 'blocked' || s.blocked.size).forEach((b, i) => {
      const c = ws.getCell(lr, 2 + i);
      c.value = BAND_TXT[b]; c.fill = solid(C[b]); c.alignment = { horizontal: 'center' }; c.font = { size: 9, bold: true, color: { argb: lightText(b) ? 'FFFFFFFF' : 'FF1E293B' } };
    });
  }

  // ---------------- Log ----------------
  {
    const ws = wb.addWorksheet('Log', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
    ws.columns = [{ width: 14 }, { width: 9 }, { width: 9 }, { width: 38 }, { width: 30 }];
    titleRows(ws, 5, `${s.total} entries`);
    headRow(ws, 4, ['Date', 'Time', 'Villa', 'Remarks', 'Logged by']);
    [...s.inPeriod].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).forEach((e, i) => {
      const row = ws.getRow(5 + i);
      const [y, m, d] = e.date.split('-').map(Number);
      row.getCell(1).value = new Date(Date.UTC(y, m - 1, d)); row.getCell(1).numFmt = 'dd mmm yyyy';
      row.getCell(2).value = e.time || null;
      row.getCell(3).value = +e.villa;
      row.getCell(4).value = e.remarks || null;
      row.getCell(5).value = e.source === 'import' ? 'Excel import' : e.by || null;
      for (let c = 1; c <= 5; c++) { const cell = row.getCell(c); cell.border = box; if (c <= 3) cell.alignment = { horizontal: 'center' }; if (i % 2 === 1) cell.fill = solid([250, 250, 252]); }
    });
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + Math.max(1, s.total), column: 5 } };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
