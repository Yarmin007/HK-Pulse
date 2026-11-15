"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, X, Trash2, ClipboardPaste, FileUp, FileDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// Order Tracking: Purchase Requests (PR). Store Requests have their own page: /store-requests

type PastedPrItem = {
  item_name: string; ordered_qty: number; unit: string; request_date: string;
  request_no?: string; article_number?: string; remarks?: string; received_date?: string; received_qty?: number;
};

/** Completed once everything ordered has come in, Partial when some has. */
const prStatusFor = (ordered: number, received: number) =>
  received <= 0 ? 'Pending' : received >= ordered ? 'Completed' : 'Partial';

// Headings of the CSV template (Import CSV reads these back by name)
const CSV_TEMPLATE_HEADERS = ['PR Date', 'PR No', 'Item Description', 'Qty', 'Unit', 'Article No', 'Received Date', 'Received Qty', 'Remark'];
const downloadCsvTemplate = () => {
  const blob = new Blob([CSV_TEMPLATE_HEADERS.join(',') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'purchase-requests-template.csv';
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Lines copied from the purchasing system, e.g. (tab separated):
 * 1  3  Brilliance torch, H190/W50/D60mm, LED white light  0  20.000  Each  04/11/2026  1.0000  20.0000 ...
 * Item name, quantity and unit sit just before the first DD/MM/YYYY date. The PR No is added later.
 */
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const toIsoDate = (dmy: string) => {
  const v = String(dmy || '').trim().split(/[ T]/)[0];
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(v)) { const [y, mo, d] = v.split('-'); return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`; }
  const m = v.match(DATE_RE);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
};
const parsePastedPrLines = (text: string): PastedPrItem[] => {
  const items: PastedPrItem[] = [];
  text.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    // Tabs when copied from the system; fall back to runs of 2+ spaces
    const cols = (line.includes('\t') ? line.split('\t') : line.split(/\s{2,}/)).map((c) => c.trim());
    const d = cols.findIndex((c) => DATE_RE.test(c));
    if (d >= 2) {
      const unit = cols[d - 1];
      const qty = parseFloat(cols[d - 2].replace(/,/g, ''));
      // Item name: the longest text column before the quantity (skips line / item numbers)
      const name = cols.slice(0, d - 2).filter((c) => /[a-z]/i.test(c)).sort((a, b) => b.length - a.length)[0];
      if (name && !isNaN(qty)) {
        items.push({ item_name: name, ordered_qty: qty, unit: unit || 'Each', request_date: toIsoDate(cols[d]) });
        return;
      }
    }
    // Single-spaced fallback: "<nums> <name> <num> <qty> <unit> <date>"
    const m = line.trim().match(/^(?:\d+\s+)*(.+?)\s+\d+(?:\.\d+)?\s+(\d+(?:\.\d+)?)\s+(\S+)\s+(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (m) items.push({ item_name: m[1].trim(), ordered_qty: parseFloat(m[2]), unit: m[3], request_date: toIsoDate(m[4]) });
  });
  return items;
};

/** Quote-aware CSV split (handles "a, b" fields and "" escapes). */
const splitCsvRows = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c));
};

/**
 * Older PRs from a CSV. With a header row, columns are found by name (item / description, qty, unit,
 * date, PR no, article, remark). Without one, each row is read like a line pasted from the system.
 */
const parsePrCsv = (text: string): PastedPrItem[] => {
  const rows = splitCsvRows(text.replace(/^\uFEFF/, ''));
  if (rows.length === 0) return [];
  const head = rows[0].map((h) => h.toLowerCase());
  const isRec = (h: string) => /rec(eived|v|d)?\b|receiv/.test(h);
  // Keys in priority order, so "Description" wins over e.g. "Item Code"; `received` columns only where asked
  const col = (keys: string[], received = false) => {
    for (const k of keys) { const i = head.findIndex((h) => h.includes(k) && isRec(h) === received); if (i >= 0) return i; }
    return -1;
  };
  const num = (v?: string) => parseFloat(String(v || '').replace(/,/g, ''));
  const iName = col(['description', 'item name', 'item desc', 'item']);
  const iQty = col(['ordered qty', 'order qty', 'quantity', 'qty']);
  if (iName >= 0 && iQty >= 0 && iName !== iQty) {
    const iUnit = col(['unit', 'uom']), iDate = col(['pr date', 'date']), iNo = col(['pr no', 'pr_no', 'request no', 'request_no', 'pr #']);
    const iArt = col(['article', 'art no', 'art.']), iRem = col(['remark', 'note']);
    const iRecDate = col(['date'], true), iRecQty = col(['qty', 'quantity'], true);
    return rows.slice(1).map((r) => ({
      item_name: r[iName] || '',
      ordered_qty: num(r[iQty]) || 1,
      unit: (iUnit >= 0 && r[iUnit]) || 'Each',
      request_date: iDate >= 0 ? toIsoDate(r[iDate]) : '',
      request_no: iNo >= 0 ? r[iNo] || '' : '',
      article_number: iArt >= 0 ? r[iArt] || '' : '',
      remarks: iRem >= 0 ? r[iRem] || '' : '',
      received_date: iRecDate >= 0 ? toIsoDate(r[iRecDate]) : '',
      received_qty: iRecQty >= 0 ? num(r[iRecQty]) || 0 : 0,
    })).filter((it) => it.item_name);
  }
  return parsePastedPrLines(rows.map((r) => r.join('\t')).join('\n'));
};

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const shiftMonth = (ym: string, by: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + by, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthLabel = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); };

type PurchaseOrderRecord = {
  id: string;
  order_type: 'Purchase Request';
  request_date: string;
  request_no: string;
  article_number: string;
  item_name: string;
  ordered_qty: number;
  unit: string;
  received_date: string | null;
  received_qty: number;
  remarks: string | null;
  status: string;
};

export default function OrderTrackingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([]);

  // Purchase Request Modal State
  const [isAddPrOpen, setIsAddPrOpen] = useState(false);
  const [prFormData, setPrFormData] = useState({
    request_date: new Date().toISOString().split('T')[0],
    request_no: '',
    article_number: '',
    item_name: '',
    ordered_qty: '',
    unit: 'Each',
    remarks: ''
  });

  // Pasted lines from the purchasing system (one PR line each)
  const [pasteText, setPasteText] = useState('');
  // Lines read from an uploaded CSV (older PRs); shown in the same preview as pasted lines
  const [csvImport, setCsvImport] = useState<{ name: string; items: PastedPrItem[] } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const pastedItems = csvImport ? csvImport.items : parsePastedPrLines(pasteText);

  // List shows one month at a time ('' = all months)
  const [month, setMonth] = useState<string>(thisMonth());

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (csvInputRef.current) csvInputRef.current.value = '';
    if (!file) return;
    const items = parsePrCsv(await file.text());
    if (items.length === 0) return toast.error('No PR lines found in this CSV');
    setPasteText('');
    setCsvImport({ name: file.name, items });
    setIsAddPrOpen(true);
  };

  useEffect(() => {
    fetchPurchaseOrders();
  }, []);

  const fetchPurchaseOrders = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('hsk_procurement_orders')
      .select('*')
      .eq('order_type', 'Purchase Request')
      .order('request_date', { ascending: false });

    if (!error && data) setPurchaseOrders(data);
    setIsLoading(false);
  };

  const resetPrForm = () => {
    setPrFormData({
      request_date: new Date().toISOString().split('T')[0],
      request_no: '',
      article_number: '',
      item_name: '',
      ordered_qty: '',
      unit: 'Each',
      remarks: ''
    });
    setPasteText('');
    setCsvImport(null);
  };

  const handleSavePrOrder = async () => {
    const base = {
      order_type: 'Purchase Request',
      request_no: prFormData.request_no.trim(),
      received_qty: 0,
      remarks: prFormData.remarks || null,
      status: 'Pending'
    };

    let rows: Record<string, any>[];
    if (pastedItems.length > 0) {
      rows = pastedItems.map((it) => ({
        ...base,
        request_no: it.request_no || base.request_no,
        remarks: it.remarks || base.remarks,
        request_date: it.request_date || prFormData.request_date,
        article_number: it.article_number || '',
        item_name: it.item_name,
        ordered_qty: it.ordered_qty || 1,
        unit: it.unit || 'Each',
        received_qty: it.received_qty || 0,
        received_date: it.received_date || null,
        status: prStatusFor(it.ordered_qty || 1, it.received_qty || 0),
      }));
    } else {
      if (!prFormData.item_name.trim()) {
        return toast.error("Please enter the Item Description, or paste lines from the system");
      }
      rows = [{
        ...base,
        request_date: prFormData.request_date,
        article_number: prFormData.article_number.trim(),
        item_name: prFormData.item_name.trim(),
        ordered_qty: parseFloat(prFormData.ordered_qty) || 1,
        unit: prFormData.unit || 'Each',
      }];
    }

    let { error } = await supabase.from('hsk_procurement_orders').insert(rows);
    // Older databases have no `remarks` column: save the lines without it rather than failing
    if (error && /remarks/i.test(error.message || '')) {
      ({ error } = await supabase.from('hsk_procurement_orders').insert(rows.map(({ remarks: _r, ...rest }) => rest)));
      if (!error && rows.some((r) => r.remarks)) toast('Saved without remarks: add a "remarks" column to hsk_procurement_orders to keep them', { icon: 'ℹ️' });
    }
    if (error) return toast.error("Error saving PR: " + error.message);

    toast.success(rows.length === 1 ? "Purchase Request created!" : `${rows.length} PR lines created!`);
    // Show where the new lines went: their month, or all months when they span several
    const months = [...new Set(rows.map((r) => String(r.request_date || '').slice(0, 7)))];
    setMonth(months.length === 1 ? months[0] : '');
    setIsAddPrOpen(false);
    resetPrForm();
    fetchPurchaseOrders();
  };

  // PR No usually comes later: set it on the PR card and every line of that PR gets it
  const savePrNo = async (lines: PurchaseOrderRecord[], current: string, value: string) => {
    const next = value.trim();
    if (next === current) return;
    const ids = lines.map((l) => l.id);
    setPurchaseOrders((prev) => prev.map((o) => (ids.includes(o.id) ? { ...o, request_no: next } : o)));
    const { error } = await supabase.from('hsk_procurement_orders').update({ request_no: next }).in('id', ids);
    if (error) {
      toast.error("PR No not saved: " + error.message);
      fetchPurchaseOrders();
    } else {
      toast.success(next ? `PR No ${next} saved${ids.length > 1 ? ` on ${ids.length} lines` : ''}` : 'PR No cleared');
    }
  };

  const prNoInput = (lines: PurchaseOrderRecord[], current: string, className: string) => (
    <input
      key={`${lines.map((l) => l.id).join('|')}-${current}`}
      type="text"
      defaultValue={current}
      placeholder="+ Add PR No"
      title={lines.length > 1 ? `Sets the PR No on all ${lines.length} lines` : undefined}
      onBlur={(e) => savePrNo(lines, current, e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = current; e.currentTarget.blur(); } }}
      className={`font-mono font-black text-[#6D2158] placeholder:text-slate-400 placeholder:font-sans placeholder:font-bold bg-transparent rounded-lg px-1.5 py-1 -mx-1.5 outline-none border border-dashed border-transparent hover:border-slate-300 focus:border-[#6D2158] focus:border-solid focus:bg-white ${className}`}
    />
  );

  // Receiving: date and qty per line; status follows (Pending / Partial / Completed)
  const saveReceiving = async (order: PurchaseOrderRecord, patch: { received_date?: string | null; received_qty?: number }) => {
    const next = { ...order, ...patch };
    let receivedQty = Number(next.received_qty) || 0;
    let receivedDate = next.received_date || null;
    // Entering a qty with no date: date it today; entering a date with no qty: assume all of it came
    if (patch.received_qty !== undefined && receivedQty > 0 && !receivedDate) receivedDate = new Date().toISOString().split('T')[0];
    if (patch.received_date && receivedQty <= 0) receivedQty = Number(order.ordered_qty) || 0;
    const update = { received_date: receivedDate, received_qty: receivedQty, status: prStatusFor(Number(order.ordered_qty) || 0, receivedQty) };
    if (update.received_date === (order.received_date || null) && update.received_qty === (Number(order.received_qty) || 0)) return;
    setPurchaseOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...update } : o)));
    const { error } = await supabase.from('hsk_procurement_orders').update(update).eq('id', order.id);
    if (error) { toast.error('Receiving not saved: ' + error.message); fetchPurchaseOrders(); }
  };

  const receivedDateInput = (order: PurchaseOrderRecord, className = '') => (
    <input
      key={`rd-${order.id}-${order.received_date || ''}`}
      type="date"
      defaultValue={order.received_date || ''}
      onBlur={(e) => saveReceiving(order, { received_date: e.target.value || null })}
      className={`font-mono font-bold text-emerald-700 bg-transparent rounded-lg px-1 py-1 outline-none border border-transparent hover:border-slate-200 focus:border-emerald-500 focus:bg-white ${order.received_date ? '' : 'text-slate-300'} ${className}`}
    />
  );

  const receivedQtyInput = (order: PurchaseOrderRecord, className = '') => (
    <input
      key={`rq-${order.id}-${order.received_qty || 0}`}
      type="number"
      min={0}
      step="any"
      defaultValue={order.received_qty || ''}
      placeholder="-"
      onBlur={(e) => saveReceiving(order, { received_qty: parseFloat(e.target.value) || 0 })}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className={`font-black text-emerald-600 text-center placeholder:text-slate-300 bg-transparent rounded-lg px-1 py-1 outline-none border border-transparent hover:border-slate-200 focus:border-emerald-500 focus:bg-white ${className}`}
    />
  );

  const deleteLine = async (order: PurchaseOrderRecord) => {
    if (!confirm(`Delete "${order.item_name}" from this PR?`)) return;
    await supabase.from('hsk_procurement_orders').delete().eq('id', order.id);
    fetchPurchaseOrders();
  };

  const filteredPurchaseOrders = purchaseOrders.filter(o => {
    if (month && !String(o.request_date || '').startsWith(month)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (o.item_name && o.item_name.toLowerCase().includes(q)) ||
      (o.request_no && o.request_no.toLowerCase().includes(q)) ||
      (o.article_number && o.article_number.includes(q)) ||
      (o.remarks && o.remarks.toLowerCase().includes(q))
    );
  });

  // One card per PR: lines sharing a PR No stay together. Lines without a PR No yet are grouped by date.
  type PrGroup = { key: string; prNo: string; lines: PurchaseOrderRecord[]; dates: string[] };
  const prGroups: PrGroup[] = [];
  const groupIndex = new Map<string, PrGroup>();
  filteredPurchaseOrders.forEach((o) => {
    const prNo = (o.request_no || '').trim();
    const key = prNo ? `pr:${prNo.toUpperCase()}` : `date:${o.request_date || ''}`;
    let g = groupIndex.get(key);
    if (!g) { g = { key, prNo, lines: [], dates: [] }; groupIndex.set(key, g); prGroups.push(g); }
    g.lines.push(o);
    if (o.request_date && !g.dates.includes(o.request_date)) g.dates.push(o.request_date);
  });

  const statusPill = (status: string) => (
    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
      status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : status === 'Partial' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'
    }`}>
      {status}
    </span>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-3 sm:p-4 md:p-6 pb-28 font-sans text-slate-800">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm gap-4">
        <div className="flex items-center gap-3.5">
          <div className="h-10 w-1.5 bg-[#6D2158] rounded-full shrink-0" />
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight">
              Order Tracking
            </h1>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
              Purchase Requests (PR)
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <input type="file" ref={csvInputRef} accept=".csv,text/csv" className="hidden" onChange={handleCsvUpload} />
          <button
            onClick={downloadCsvTemplate}
            title="Download the CSV headings to fill in"
            className="flex-1 sm:flex-initial justify-center bg-white border border-slate-200 hover:bg-slate-50 active:scale-95 text-slate-600 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <FileDown size={15}/>
            <span>CSV Format</span>
          </button>
          <button
            onClick={() => csvInputRef.current?.click()}
            title="Add older PRs from a CSV file"
            className="flex-1 sm:flex-initial justify-center bg-slate-800 hover:bg-slate-900 active:scale-95 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <FileUp size={15}/>
            <span>Import CSV</span>
          </button>

          <button
            onClick={() => setIsAddPrOpen(true)}
            className="flex-1 sm:flex-initial justify-center bg-[#6D2158] hover:bg-[#5a1b49] active:scale-95 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus size={16}/>
            <span>New PR</span>
          </button>
        </div>
      </div>

      {/* SEARCH */}
      <div className="flex flex-col lg:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 text-slate-400" size={16}/>
          <input 
            type="text" 
            placeholder="Search PR No, Article No, Description, or Remark..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200/90 rounded-xl font-bold text-xs text-slate-700 outline-none focus:border-[#6D2158] shadow-xs"
          />
        </div>

        {/* MONTH (defaults to this month) */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-white border border-slate-200/90 rounded-xl shadow-xs">
            <button onClick={() => setMonth(shiftMonth(month || thisMonth(), -1))} className="p-2.5 text-slate-500 hover:text-[#6D2158]" title="Previous month"><ChevronLeft size={15}/></button>
            <span className="px-1 min-w-[112px] text-center text-xs font-black text-slate-700">{month ? monthLabel(month) : 'All months'}</span>
            <button onClick={() => setMonth(shiftMonth(month || thisMonth(), 1))} className="p-2.5 text-slate-500 hover:text-[#6D2158]" title="Next month"><ChevronRight size={15}/></button>
          </div>
          {month !== thisMonth() && (
            <button onClick={() => setMonth(thisMonth())} className="px-3 py-2.5 rounded-xl text-[11px] font-bold bg-white border border-slate-200 text-slate-500 hover:bg-slate-50">This month</button>
          )}
          {month && (
            <button onClick={() => setMonth('')} className="px-3 py-2.5 rounded-xl text-[11px] font-bold bg-white border border-slate-200 text-slate-500 hover:bg-slate-50">All</button>
          )}
        </div>
      </div>

      {/* PURCHASE REQUESTS: PR No + date merged on the left over all its lines, a gap between PRs */}
      {prGroups.length === 0 ? (
        <div className="p-12 text-center text-slate-400 font-bold text-xs bg-white rounded-2xl border border-slate-200/80">
          {isLoading ? "Loading purchase requests..." : `No purchase requests${month ? ` in ${monthLabel(month)}` : ''}.`}
        </div>
      ) : (
        <>
          {/* MOBILE: PR on the left, its lines on the right */}
          <div className="md:hidden space-y-3">
            {prGroups.map((g) => {
              const dates = [...g.dates].sort();
              return (
                <div key={g.key} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex">
                  <div className={`w-28 shrink-0 p-3 border-r ${g.prNo ? 'bg-[#6D2158]/[0.04] border-[#6D2158]/10' : 'bg-amber-50/70 border-amber-100'}`}>
                    {prNoInput(g.lines, g.prNo, 'text-xs w-full')}
                    <div className="text-[10px] font-mono font-semibold text-slate-400 mt-0.5">{dates[0]}{dates.length > 1 ? ' …' : ''}</div>
                  </div>
                  <div className="flex-1 min-w-0 divide-y divide-slate-100">
                    {g.lines.map((order) => (
                      <div key={order.id} className="p-2.5 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800">{order.item_name}</p>
                          {order.remarks && <p className="text-[10px] text-slate-500">{order.remarks}</p>}
                          <div className="mt-1">{statusPill(order.status)}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-black text-slate-900">{order.ordered_qty} <span className="text-[10px] font-bold text-slate-500">{order.unit}</span></span>
                          <span className="flex items-center justify-end gap-1 text-[10px] font-bold text-emerald-600">Recv {receivedQtyInput(order, 'text-[11px] w-12')}</span>
                          {receivedDateInput(order, 'text-[10px] w-[118px]')}
                          <button onClick={() => deleteLine(order)} className="p-0.5 text-slate-300 hover:text-rose-600"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* DESKTOP: one table, PR Date + PR No merged across each PR's lines */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[950px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  <tr>
                    <th className="py-3 px-4 w-28">PR Date</th>
                    <th className="py-3 px-4 w-36">PR / Req No</th>
                    <th className="py-3 px-4">Items & Description</th>
                    <th className="py-3 px-4 text-center w-28">Ordered Qty</th>
                    <th className="py-3 px-4 text-center w-20">Unit</th>
                    <th className="py-3 px-4 text-center w-28">Received Date</th>
                    <th className="py-3 px-4 text-center w-28">Received Qty</th>
                    <th className="py-3 px-4">Remark</th>
                    <th className="py-3 px-4 text-center w-24">Status</th>
                    <th className="py-3 px-4 text-right w-14"></th>
                  </tr>
                </thead>
                {prGroups.map((g, gi) => {
                  const dates = [...g.dates].sort();
                  const n = g.lines.length;
                  const tone = g.prNo ? 'bg-[#6D2158]/[0.03]' : 'bg-amber-50/60';
                  return (
                    <tbody key={g.key} className={gi > 0 ? 'border-t-[10px] border-[#F8FAFC]' : ''}>
                      {g.lines.map((order, i) => (
                        <tr key={order.id} className={`hover:bg-slate-50 transition-colors ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                          {i === 0 && (
                            <>
                              <td rowSpan={n} className={`py-2.5 px-4 align-top font-mono text-[11px] font-semibold text-slate-500 border-r border-slate-100 ${tone}`}>
                                {dates[0]}
                                {dates.length > 1 && <div className="text-[10px] text-slate-400">– {dates[dates.length - 1]}</div>}
                              </td>
                              <td rowSpan={n} className={`py-2.5 px-4 align-top border-r border-slate-100 ${tone}`}>
                                {prNoInput(g.lines, g.prNo, 'text-xs w-full')}
                                {n > 1 && <div className="text-[10px] font-bold text-slate-400 mt-0.5">{n} items</div>}
                              </td>
                            </>
                          )}
                          <td className="py-2.5 px-4 font-bold text-slate-800">
                            <div>{order.item_name}</div>
                            {order.article_number && <div className="text-[10px] text-slate-400 font-mono">Art: {order.article_number}</div>}
                          </td>
                          <td className="py-2.5 px-4 text-center font-black text-slate-800">{order.ordered_qty}</td>
                          <td className="py-2.5 px-4 text-center font-bold uppercase text-slate-500">{order.unit}</td>
                          <td className="py-1.5 px-2 text-center">{receivedDateInput(order, 'text-[11px] w-full')}</td>
                          <td className="py-1.5 px-2 text-center">{receivedQtyInput(order, 'text-xs w-20')}</td>
                          <td className="py-2.5 px-4 text-slate-500">{order.remarks || '-'}</td>
                          <td className="py-2.5 px-4 text-center">{statusPill(order.status)}</td>
                          <td className="py-2.5 px-4 text-right">
                            <button onClick={() => deleteLine(order)} className="p-1.5 text-slate-300 hover:text-rose-600 rounded-lg" title="Delete line">
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  );
                })}
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* NATIVE BOTTOM-SHEET / DESKTOP MODAL: NEW PURCHASE REQUEST (PR)            */}
      {/* ========================================================================= */}
      {isAddPrOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-t-3xl md:rounded-3xl shadow-2xl w-full max-w-lg p-6 animate-in slide-in-from-bottom-6 md:zoom-in-95 border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3.5 mb-4">
              <h3 className="text-lg font-black text-slate-800">New Purchase Request (PR)</h3>
              <button onClick={() => { setIsAddPrOpen(false); resetPrForm(); }} className="bg-slate-100 p-1.5 rounded-full text-slate-500 hover:text-slate-800">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* PASTE FROM THE PURCHASING SYSTEM */}
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-3">
                <label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 flex items-center gap-1.5">
                  <ClipboardPaste size={13} className="text-[#6D2158]" /> Paste lines from the system
                </label>
                {csvImport ? (
                  <p className="text-[11px] font-bold text-slate-600">From file: <span className="font-mono">{csvImport.name}</span></p>
                ) : (
                <textarea
                  rows={3}
                  placeholder="Copy the PR line(s) from the system and paste here. Item, qty and unit are read automatically."
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-[11px] text-slate-700 outline-none focus:border-[#6D2158] resize-y"
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                />
                )}
                {(pasteText.trim() || csvImport) && (
                  pastedItems.length === 0 ? (
                    <p className="text-[11px] font-bold text-rose-600 mt-1.5">Could not read an item from this text. Fill the fields below instead.</p>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-emerald-700">{pastedItems.length} item{pastedItems.length === 1 ? '' : 's'} found</span>
                        <button type="button" onClick={() => { setPasteText(''); setCsvImport(null); }} className="text-[10px] font-bold text-slate-400 hover:text-rose-600">Clear</button>
                      </div>
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {pastedItems.map((it, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-2.5 py-2">
                          <span className="font-bold text-slate-800 min-w-0">{it.item_name}</span>
                          <span className="shrink-0 text-right">
                            <span className="font-black text-slate-900">{it.ordered_qty}</span>{' '}
                            <span className="font-bold text-slate-500">{it.unit}</span>
                            {(it.request_date || it.request_no) && <span className="block text-[10px] font-mono text-slate-400">{[it.request_no, it.request_date].filter(Boolean).join(' · ')}</span>}
                            {!!it.received_qty && <span className="block text-[10px] font-bold text-emerald-600">Recv {it.received_qty}{it.received_date ? ` · ${it.received_date}` : ''}</span>}
                          </span>
                        </div>
                      ))}
                      </div>
                    </div>
                  )
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">PR Date</label>
                  <input
                    type="date"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none"
                    value={prFormData.request_date}
                    onChange={e => setPrFormData({ ...prFormData, request_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">PR No <span className="normal-case font-semibold">(optional, can add later)</span></label>
                  <input
                    type="text"
                    placeholder="PR-2026-081"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-700 outline-none"
                    value={prFormData.request_no}
                    onChange={e => setPrFormData({ ...prFormData, request_no: e.target.value })}
                  />
                </div>
              </div>

              {pastedItems.length === 0 && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Art No.</label>
                      <input
                        type="text"
                        placeholder="1504016"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-700 outline-none"
                        value={prFormData.article_number}
                        onChange={e => setPrFormData({ ...prFormData, article_number: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Item Description</label>
                      <input
                        type="text"
                        placeholder="Item Name"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none"
                        value={prFormData.item_name}
                        onChange={e => setPrFormData({ ...prFormData, item_name: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Ordered Qty</label>
                      <input
                        type="number"
                        placeholder="1"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-700 outline-none"
                        value={prFormData.ordered_qty}
                        onChange={e => setPrFormData({ ...prFormData, ordered_qty: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Unit</label>
                      <input
                        type="text"
                        placeholder="Each"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none"
                        value={prFormData.unit}
                        onChange={e => setPrFormData({ ...prFormData, unit: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Remark</label>
                <textarea
                  rows={2}
                  placeholder="Optional notes..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none resize-none"
                  value={prFormData.remarks}
                  onChange={e => setPrFormData({ ...prFormData, remarks: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsAddPrOpen(false); resetPrForm(); }}
                  className="px-4 py-2.5 font-bold text-slate-500 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePrOrder}
                  className="px-5 py-2.5 bg-[#6D2158] hover:bg-[#5a1b49] text-white rounded-xl font-bold uppercase tracking-wider shadow-md"
                >
                  {pastedItems.length > 1 ? `Save ${pastedItems.length} lines` : 'Save PR'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
