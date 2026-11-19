// Front Office sends the ArrDep Memo as an Excel file (.xlsm / .xlsx). Instead of opening it and saving as
// CSV by hand, the upload turns it into the same CSV text here in the browser, so the memo parser and the
// daily-stats reader get exactly what a "Save as CSV" gives them. Tested on real memos: identical results,
// and accented names / curly quotes come through cleaner than Excel's CSV.
// Macros in .xlsm files are never run — only the cell values are read.

export const isExcelFile = (name: string) => /\.(xlsx|xlsm|xls)$/i.test(name);

const q = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const excelFileToCsv = async (file: File): Promise<string> => {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  // The memo sheet: the one open when it was saved, unless another visible sheet is clearly the memo
  const views = (wb.Workbook as { Views?: { activeTab?: number }[] } | undefined)?.Views;
  const active = views?.[0]?.activeTab ?? 0;
  const order = [active, ...wb.SheetNames.map((_, i) => i).filter(i => i !== active)];
  const hidden = (i: number) => !!(wb.Workbook as { Sheets?: { Hidden?: number }[] } | undefined)?.Sheets?.[i]?.Hidden;
  const toRows = (i: number) => (XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { header: 1, raw: false, defval: '', blankrows: true }) as unknown[][])
    .map(r => r.map(c => String(c ?? '').replace(/\r\n?/g, '\n')));
  const looksLikeMemo = (rows: string[][]) => rows.some(r => r.some(c => /ARRIVAL|DEPARTURE|GEMS ALLOCATION/i.test(c)));
  let rows = toRows(order[0]);
  if (!looksLikeMemo(rows)) {
    const other = order.slice(1).filter(i => !hidden(i)).map(toRows).find(looksLikeMemo);
    if (other) rows = other;
  }
  if (!rows.length) throw new Error('The Excel file is empty');
  return rows.map(r => r.map(q).join(',')).join('\n');
};
