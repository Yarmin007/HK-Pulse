// Monthly Roster → formatted .xlsx (ExcelJS): the roster laid out like the printed sheet, plus a
// "Checklist" sheet with the signing-sheet / Fusion status per person.
import { format, parseISO } from 'date-fns';
import { CODE_COLORS, CODE_NAMES, FRIDAY_FILL, PH_FILL, BLOCK_FILL, type RosterGroup, type RosterCell } from './rosterShared';
import type { RosterCheck } from '@/lib/rosterChecks';

type Args = {
  fileName: string; title: string; range: string; scope: string;
  dates: string[]; phDates: Set<string>; groups: RosterGroup[];
  cellOf: (hostId: string, date: string) => RosterCell;
  cfLabel: string; balLabel: string; periodEnd: string;
  checks: Record<string, RosterCheck>;
};

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;
const PLUM = 'FF6D2158';
const GRID = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } };
const BOX = { top: GRID, left: GRID, bottom: GRID, right: GRID };
const fill = (hex: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: argb(hex) } });

export const exportRosterXlsx = async (a: Args) => {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HK Pulse';

  // ---------------- Roster ----------------
  const ws = wb.addWorksheet('Roster', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 5 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '4:5',
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  });
  const nDates = a.dates.length;
  const firstDateCol = 4;                     // A No · B SSL · C Name · D.. dates
  const balCol = firstDateCol + nDates;       // 5 balance columns
  const lastCol = balCol + 4;

  ws.columns = [
    { width: 4.5 }, { width: 10 }, { width: 26 },
    ...a.dates.map(() => ({ width: 4.2 })),
    ...[0, 1, 2, 3, 4].map(() => ({ width: 7 })),
  ];

  // Title
  ws.mergeCells(1, 1, 1, lastCol);
  const t = ws.getCell(1, 1);
  t.value = `Housekeeping · Monthly Roster · ${a.title}`;
  t.font = { bold: true, size: 15, color: { argb: PLUM } };
  ws.getRow(1).height = 24;
  ws.mergeCells(2, 1, 2, lastCol);
  const s = ws.getCell(2, 1);
  s.value = `${a.range} · ${a.scope} · balances at ${a.balLabel}, carried forward from ${a.cfLabel}`;
  s.font = { size: 10, color: { argb: 'FF475569' } };

  // Header rows 4 (day) + 5 (weekday)
  const h4 = ws.getRow(4), h5 = ws.getRow(5);
  [['No', 1], ['SSL No', 2], ['Name', 3]].forEach(([label, c]) => {
    ws.mergeCells(4, c as number, 5, c as number);
    ws.getCell(4, c as number).value = label as string;
  });
  a.dates.forEach((d, i) => {
    const dt = parseISO(d);
    h4.getCell(firstDateCol + i).value = dt.getDate();
    h5.getCell(firstDateCol + i).value = format(dt, 'EEE');
  });
  ['CF OFF', 'CF PH', 'OFF BAL', 'PH BAL', 'AL BAL'].forEach((label, i) => {
    ws.mergeCells(4, balCol + i, 5, balCol + i);
    ws.getCell(4, balCol + i).value = label;
  });
  [h4, h5].forEach(r => {
    r.height = r === h4 ? 18 : 14;
    for (let c = 1; c <= lastCol; c++) {
      const cell = r.getCell(c);
      const di = c - firstDateCol;
      const d = di >= 0 && di < nDates ? a.dates[di] : '';
      const bg = d && a.phDates.has(d) ? 'BFDBFE' : d && parseISO(d).getDay() === 5 ? 'FECDD3' : '';
      cell.fill = bg ? fill(bg) : { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } };
      cell.font = { bold: true, size: r === h4 ? 10 : 8, color: { argb: bg ? 'FF0F172A' : 'FFFFFFFF' } };
      cell.alignment = { horizontal: c === 3 ? 'left' : 'center', vertical: 'middle', wrapText: c >= balCol };
      cell.border = BOX;
    }
  });

  // Body
  let rowNo = 6, n = 0;
  a.groups.forEach(g => {
    ws.mergeCells(rowNo, 1, rowNo, lastCol);
    const gc = ws.getCell(rowNo, 1);
    gc.value = `${g.dep.toUpperCase()} · ${g.hosts.length}`;
    gc.font = { bold: true, size: 10, color: { argb: PLUM } };
    gc.fill = fill('E2E8F0');
    gc.alignment = { vertical: 'middle' };
    ws.getRow(rowNo).height = 17;
    rowNo++;
    g.hosts.forEach(h => {
      n++;
      const r = ws.getRow(rowNo);
      r.height = 16;
      r.getCell(1).value = n;
      r.getCell(2).value = h.host_id;
      r.getCell(3).value = h.full_name;
      a.dates.forEach((d, i) => {
        const cell = r.getCell(firstDateCol + i);
        const c = a.cellOf(h.host_id, d);
        if (c.blocked) { cell.fill = fill(BLOCK_FILL); return; }
        const col = CODE_COLORS[c.code];
        cell.value = c.code === 'P' ? '' : c.code;
        if (col) { cell.fill = fill(col[0]); cell.font = { bold: true, size: 9, color: { argb: argb(col[1]) }, underline: c.worked }; }
        else {
          const bg = a.phDates.has(d) ? PH_FILL : parseISO(d).getDay() === 5 ? FRIDAY_FILL : '';
          if (bg) cell.fill = fill(bg);
          cell.font = { size: 9 };
        }
        if (c.note) cell.note = c.note;
      });
      const num = (v?: string) => { const x = parseFloat(v || '0'); return Number.isFinite(x) ? x : 0; };
      [h.cfOff, h.cfPH, h.balOff, h.balPH, h.balAL].forEach((v, i) => {
        const cell = r.getCell(balCol + i);
        cell.value = num(v);
        cell.numFmt = i === 4 ? '0.00' : i % 2 ? '0.0' : '0';
        cell.font = { bold: true, size: 10, color: { argb: num(v) < 0 ? 'FFBE123C' : 'FF0F172A' } };
        cell.fill = fill(i < 2 ? 'F8FAFC' : i === 2 ? 'D1FAE5' : i === 3 ? 'DBEAFE' : 'CFFAFE');
      });
      for (let c = 1; c <= lastCol; c++) {
        const cell = r.getCell(c);
        cell.border = BOX;
        cell.alignment = { horizontal: c === 3 ? 'left' : 'center', vertical: 'middle' };
        if (c <= 2) cell.font = { size: 9, color: { argb: 'FF475569' } };
        if (c === 3) cell.font = { size: 10, bold: true };
      }
      rowNo++;
    });
  });

  // Legend
  rowNo++;
  const used = new Set<string>();
  a.groups.forEach(g => g.hosts.forEach(h => a.dates.forEach(d => { const c = a.cellOf(h.host_id, d).code; if (c && c !== 'P') used.add(c); })));
  const legendRow = ws.getRow(rowNo);
  legendRow.getCell(3).value = 'Legend';
  legendRow.getCell(3).font = { bold: true, size: 9 };
  let col = firstDateCol;
  Object.keys(CODE_COLORS).filter(c => used.has(c)).forEach(code => {
    const k = legendRow.getCell(col);
    k.value = code; k.fill = fill(CODE_COLORS[code][0]); k.border = BOX;
    k.font = { bold: true, size: 9, color: { argb: argb(CODE_COLORS[code][1]) } }; k.alignment = { horizontal: 'center' };
    ws.mergeCells(rowNo, col + 1, rowNo, col + 3);
    const nm = legendRow.getCell(col + 1);
    nm.value = CODE_NAMES[code] || code; nm.font = { size: 8, color: { argb: 'FF475569' } };
    col += 4;
  });
  ws.getRow(rowNo + 1).getCell(3).value = 'Blank = present · grey = not on roster · underlined = leave day worked (earns RO)';
  ws.getRow(rowNo + 1).getCell(3).font = { size: 8, italic: true, color: { argb: 'FF64748B' } };

  // ---------------- Checklist ----------------
  const cs = wb.addWorksheet('Checklist', { views: [{ state: 'frozen', ySplit: 3 }] });
  cs.columns = [{ width: 5 }, { width: 11 }, { width: 28 }, { width: 24 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 18 }, { width: 14 }];
  cs.mergeCells(1, 1, 1, 9);
  cs.getCell(1, 1).value = `Roster checklist · ${a.title} (${a.range})`;
  cs.getCell(1, 1).font = { bold: true, size: 13, color: { argb: PLUM } };
  const head = cs.getRow(3);
  ['No', 'SSL No', 'Name', 'Sub-department', 'Sheet checked to', 'Sheet checked by', 'Fusion updated to', 'Fusion updated by', 'Status'].forEach((v, i) => {
    const c = head.getCell(i + 1);
    c.value = v; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } };
    c.border = BOX; c.alignment = { vertical: 'middle', horizontal: i < 2 ? 'center' : 'left' };
  });
  head.height = 18;
  let cr = 4, cn = 0;
  const fmt = (d?: string) => (d ? format(parseISO(d), 'dd MMM') : '');
  a.groups.forEach(g => g.hosts.forEach(h => {
    cn++;
    const c = a.checks[h.host_id];
    const sheetDone = !!c?.sheet_upto && c.sheet_upto >= a.periodEnd;
    const fusionDone = !!c?.fusion_upto && c.fusion_upto >= a.periodEnd;
    const status = sheetDone && fusionDone ? 'Done' : !c?.sheet_upto && !c?.fusion_upto ? 'Not started' : 'In progress';
    const r = cs.getRow(cr++);
    [cn, h.host_id, h.full_name, g.dep, fmt(c?.sheet_upto), c?.sheet_by || '', fmt(c?.fusion_upto), c?.fusion_by || '', status].forEach((v, i) => {
      const cell = r.getCell(i + 1);
      cell.value = v; cell.border = BOX; cell.alignment = { vertical: 'middle', horizontal: i < 2 ? 'center' : 'left' };
    });
    const paint = (i: number, done: boolean, any: boolean) => { r.getCell(i).fill = fill(done ? 'D1FAE5' : any ? 'FEF3C7' : 'F1F5F9'); };
    paint(5, sheetDone, !!c?.sheet_upto);
    paint(7, fusionDone, !!c?.fusion_upto);
    paint(9, status === 'Done', status === 'In progress');
  }));
  cs.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 9 } };

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = a.fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
