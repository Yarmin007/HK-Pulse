// Housekeeping Cycle Fleet: who rides which bicycle / tricycle.
// The fleet (units, assignments, remarks, history) is one JSON list in hsk_constants (type 'hk_cycle_fleet');
// join date, SSL no, name and designation always come live from hsk_hosts.
import { supabase } from '@/lib/supabase';

export type CycleType = 'Tricycle' | 'Bicycle';
export type CycleStatus = 'Assigned' | 'Spare' | 'Repair';
export type CycleGroup = 'HK' | 'HM' | 'PA' | 'POOL';

export type CycleHistory = { host_id: string; name: string; ssl: string; from: string; to: string };
export type CycleUnit = {
  code: string;            // HK-1, HM-2, PA-5, Pool-3
  group: CycleGroup;
  type: CycleType;
  host_id: string | null;  // hsk_hosts.id
  assigned_on: string;     // YYYY-MM-DD
  status: CycleStatus;
  remarks: string;
  history: CycleHistory[];
};

export const GROUPS: { key: CycleGroup; label: string; prefix: string; count: number; type: CycleType }[] = [
  { key: 'HK', label: 'Villa Attendants', prefix: 'HK', count: 20, type: 'Tricycle' },
  { key: 'HM', label: 'Housemen', prefix: 'HM', count: 3, type: 'Tricycle' },
  { key: 'PA', label: 'Public Area', prefix: 'PA', count: 5, type: 'Bicycle' },
  { key: 'POOL', label: 'Pool', prefix: 'Pool', count: 5, type: 'Bicycle' },
];

const TYPE = 'hk_cycle_fleet';

export const defaultFleet = (): CycleUnit[] =>
  GROUPS.flatMap(g => Array.from({ length: g.count }, (_, i) => ({
    code: `${g.prefix}-${i + 1}`, group: g.key, type: g.type, host_id: null, assigned_on: '',
    status: 'Spare' as CycleStatus, remarks: '', history: [],
  })));

const codeOrder = (code: string) => {
  const gi = GROUPS.findIndex(g => code.toUpperCase().startsWith(g.prefix.toUpperCase() + '-'));
  const n = parseInt(code.split('-')[1] || '0', 10);
  return (gi < 0 ? 99 : gi) * 1000 + n;
};
export const sortFleet = (units: CycleUnit[]) => [...units].sort((a, b) => codeOrder(a.code) - codeOrder(b.code));

export const loadFleet = async (): Promise<{ id: string | null; units: CycleUnit[] }> => {
  const { data, error } = await supabase.from('hsk_constants').select('id, label').eq('type', TYPE).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return { id: null, units: defaultFleet() };
  try {
    const parsed = JSON.parse(data.label || '[]');
    if (!Array.isArray(parsed)) return { id: data.id, units: defaultFleet() };
    return {
      id: data.id,
      units: sortFleet(parsed.map((u: Partial<CycleUnit>) => ({
        code: String(u.code || ''), group: (u.group || 'HK') as CycleGroup, type: (u.type || 'Bicycle') as CycleType,
        host_id: u.host_id || null, assigned_on: u.assigned_on || '', status: (u.status || (u.host_id ? 'Assigned' : 'Spare')) as CycleStatus,
        remarks: u.remarks || '', history: Array.isArray(u.history) ? u.history : [],
      })).filter((u: CycleUnit) => u.code)),
    };
  } catch {
    return { id: data.id, units: defaultFleet() };
  }
};

export const saveFleet = async (units: CycleUnit[]) => {
  const label = JSON.stringify(sortFleet(units));
  const { data: existing, error: readErr } = await supabase.from('hsk_constants').select('id').eq('type', TYPE).limit(1).maybeSingle();
  if (readErr) throw readErr;
  const { error } = existing?.id
    ? await supabase.from('hsk_constants').update({ label }).eq('id', existing.id)
    : await supabase.from('hsk_constants').insert([{ type: TYPE, label }]);
  if (error) throw error;
};

export type FleetHost = { id: string; host_id: string; full_name: string; role: string; joining_date: string | null; status: string | null; image_url?: string | null };

export const loadHosts = async (): Promise<FleetHost[]> => {
  const { data, error } = await supabase.from('hsk_hosts').select('id, host_id, full_name, role, joining_date, status, image_url').order('full_name');
  if (error) throw error;
  return (data || []) as FleetHost[];
};

// Which group a host most likely belongs to (used to sort the picker)
export const suggestedGroup = (role: string): CycleGroup | null => {
  const r = (role || '').toLowerCase();
  if (r.includes('pool')) return 'POOL';
  if (r.includes('public') || /\bpa\b/.test(r)) return 'PA';
  if (r.includes('houseman') || r.includes('housemen') || r.includes('house man')) return 'HM';
  if (r.includes('villa') || r.includes('attendant') || /\bva\b/.test(r)) return 'HK';
  return null;
};

// ---------------- Report rows (shared by Excel + PDF) ----------------
export type FleetReportRow = {
  no: number; joinDate: string; ssl: string; name: string; designation: string;
  cycle: string; type: CycleType; status: CycleStatus; remarks: string;
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return y && m && d ? `${d}-${m}-${y}` : '';
};

export const buildReportRows = (units: CycleUnit[], hosts: Map<string, FleetHost>): FleetReportRow[] =>
  units.map((u, i) => {
    const h = u.host_id ? hosts.get(u.host_id) : undefined;
    return {
      no: i + 1,
      joinDate: fmtDate(h?.joining_date),
      ssl: h?.host_id || '',
      name: h?.full_name || '',
      designation: h?.role || '',
      cycle: u.code,
      type: u.type,
      status: u.status,
      remarks: u.remarks,
    };
  });

export const REPORT_HEADERS = ['#', 'Join Date', 'SSL No', 'Name', 'Designation', 'Cycle No', 'Type', 'Status', 'Remarks'];
const rowValues = (r: FleetReportRow) => [r.no, r.joinDate, r.ssl, r.name, r.designation, r.cycle, r.type, r.status, r.remarks];

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export const exportFleetExcel = async (rows: FleetReportRow[], title: string, fileBase: string) => {
  const mod = await import('exceljs');
  // CJS interop: depending on the bundler the classes sit on the namespace or on .default
  const ExcelJS = ((mod as unknown as { default?: typeof mod }).default?.Workbook ? (mod as unknown as { default: typeof mod }).default : mod);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Cycle Fleet', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ws.columns = [{ width: 5 }, { width: 12 }, { width: 11 }, { width: 28 }, { width: 24 }, { width: 10 }, { width: 10 }, { width: 11 }, { width: 36 }];

  ws.mergeCells(1, 1, 1, REPORT_HEADERS.length);
  ws.getCell(1, 1).value = 'Housekeeping Cycle Fleet';
  ws.getCell(1, 1).font = { bold: true, size: 15, color: { argb: 'FF6D2158' } };
  ws.mergeCells(2, 1, 2, REPORT_HEADERS.length);
  ws.getCell(2, 1).value = title;
  ws.getCell(2, 1).font = { size: 10, color: { argb: 'FF64748B' } };

  const header = ws.getRow(4);
  header.values = REPORT_HEADERS;
  header.height = 20;
  header.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6D2158' } };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
    c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  rows.forEach((r, i) => {
    const row = ws.getRow(5 + i);
    row.values = rowValues(r);
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
      c.alignment = { vertical: 'middle', horizontal: [1, 2, 3, 6, 7, 8].includes(col) ? 'center' : 'left', wrapText: col === 9 };
      if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    });
    row.getCell(6).font = { bold: true };
    const st = row.getCell(8);
    if (r.status === 'Repair') st.font = { bold: true, color: { argb: 'FFB45309' } };
    if (r.status === 'Spare') st.font = { color: { argb: 'FF64748B' } };
  });
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: REPORT_HEADERS.length } };

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase}.xlsx`);
};

export const exportFleetPdf = async (rows: FleetReportRow[], title: string, fileBase: string, summary: string) => {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(109, 33, 88);
  doc.text('Housekeeping Cycle Fleet', 12, 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100);
  doc.text(title, 12, 21);
  doc.text(summary, W - 12, 21, { align: 'right' });

  autoTable(doc, {
    startY: 26,
    margin: { left: 12, right: 12 },
    head: [REPORT_HEADERS],
    body: rows.map(rowValues),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.6, lineColor: [203, 213, 225], lineWidth: 0.1, textColor: 30, valign: 'middle' },
    headStyles: { fillColor: [109, 33, 88], textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 22, halign: 'center' }, 2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 50 }, 4: { cellWidth: 44 }, 5: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      6: { cellWidth: 18, halign: 'center' }, 7: { cellWidth: 18, halign: 'center' }, 8: { cellWidth: 'auto' },
    },
    didParseCell: d => {
      if (d.section === 'body' && d.column.index === 7) {
        if (d.cell.raw === 'Repair') { d.cell.styles.textColor = [180, 83, 9]; d.cell.styles.fontStyle = 'bold'; }
        if (d.cell.raw === 'Spare') d.cell.styles.textColor = [100, 116, 139];
      }
    },
  });

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(140);
    doc.text(`HK Pulse · Cycle Fleet · Page ${i} of ${total}`, W / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
  }
  doc.save(`${fileBase}.pdf`);
};
