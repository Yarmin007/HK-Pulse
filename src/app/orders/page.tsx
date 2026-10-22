"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, Truck, Warehouse,
  X, Trash2, Save, FileText,
  ChevronDown, ChevronRight, UploadCloud, Loader2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

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

type StoreRequestItem = {
  id?: string;
  article_number: string;
  item_description: string;
  req_qty: number;
  iss_qty: number;
  unit: string;
  ave_cost: number;
  total_cost: number;
};

type StoreRequestGroup = {
  id: string;
  request_no: string;
  delivery_date: string;
  from_store: string;
  to_cost_center: string;
  reference: string;
  grand_total: number;
  status: string;
  items: StoreRequestItem[];
};

const COST_CENTERS = [
  "HOUSE KEEPING",
  "HOUSEKEEPING STORE",
  "MINI BAR",
  "GUEST LAUNDRY",
  "GARDEN DEPARTMENT"
];

const FROM_STORES = [
  "MAIN STORE - GENERAL",
  "MAIN STORE - BEVERAGE",
  "MAIN STORE - FOOD",
  "CENTRAL STORE",
  "CHEMICAL STORE",
  "ENGINEERING STORE"
];

const loadPdfJsEngine = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Browser only"));
    if ((window as any).pdfjsLib) return resolve((window as any).pdfjsLib);

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(lib);
    };
    script.onerror = () => reject(new Error("Failed to load PDF processing library from CDN"));
    document.head.appendChild(script);
  });
};

export default function OrderTrackingPage() {
  const [activeTab, setActiveTab] = useState<'Purchase Request' | 'Store Request'>('Store Request');
  const [searchQuery, setSearchQuery] = useState('');
  const [costCenterFilter, setCostCenterFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([]);
  const [storeRequests, setStoreRequests] = useState<StoreRequestGroup[]>([]);
  const [expandedRequests, setExpandedRequests] = useState<Record<string, boolean>>({});

  const [isAddSrOpen, setIsAddSrOpen] = useState(false);
  const [srHeader, setSrHeader] = useState({
    request_no: '',
    delivery_date: new Date().toISOString().split('T')[0],
    from_store: 'MAIN STORE - GENERAL',
    to_cost_center: 'HOUSE KEEPING',
    reference: ''
  });

  const [srItems, setSrItems] = useState<StoreRequestItem[]>([
    { article_number: '', item_description: '', req_qty: 1, iss_qty: 0, unit: 'Each', ave_cost: 0, total_cost: 0 }
  ]);

  useEffect(() => {
    if (activeTab === 'Purchase Request') fetchPurchaseOrders();
    else fetchStoreRequests();
  }, [activeTab]);

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

  const fetchStoreRequests = async () => {
    setIsLoading(true);
    try {
      const { data: headers, error: hErr } = await supabase
        .from('hsk_store_requests')
        .select('*')
        .order('delivery_date', { ascending: false });

      if (hErr) throw hErr;

      const { data: items, error: iErr } = await supabase
        .from('hsk_store_request_items')
        .select('*');

      if (iErr) throw iErr;

      const grouped: StoreRequestGroup[] = (headers || []).map((h: any) => {
        const myItems = (items || []).filter((item: any) => item.request_no === h.request_no || item.request_id === h.id);
        const calculatedTotal = myItems.reduce((acc, curr) => acc + (Number(curr.total_cost) || 0), 0);
        return {
          ...h,
          grand_total: calculatedTotal || h.grand_total || 0,
          items: myItems
        };
      });

      setStoreRequests(grouped);
      const initialExpand: Record<string, boolean> = {};
      grouped.slice(0, 5).forEach((g) => { initialExpand[g.request_no] = true; });
      setExpandedRequests(initialExpand);
    } catch (err: any) {
      toast.error("Failed to load store requests: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // --- ROBUST HYBRID PDF PARSER ---
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingPdf(true);
    const toastId = toast.loading("Analyzing Voucher Layout...");

    try {
      const pdfjs = await loadPdfJsEngine();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

      let allTokens: { str: string; x: number; y: number }[] = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        textContent.items.forEach((item: any) => {
          if (item.str && item.str.trim()) {
            allTokens.push({
              str: item.str.trim(),
              x: item.transform[4],
              y: item.transform[5],
            });
          }
        });
      }

      const parsed = parseVoucherByCoordinates(allTokens);

      if (!parsed.request_no && parsed.items.length === 0) {
        throw new Error("Could not parse items from PDF. Verify it is an authorized LA Transfer Request.");
      }

      setSrHeader({
        request_no: parsed.request_no || 'LA2610-00000',
        delivery_date: parsed.delivery_date || new Date().toISOString().split('T')[0],
        from_store: parsed.from_store || 'MAIN STORE - GENERAL',
        to_cost_center: parsed.to_cost_center || 'HOUSE KEEPING',
        reference: parsed.reference || ''
      });

      setSrItems(parsed.items.length > 0 ? parsed.items : [
        { article_number: '', item_description: '', req_qty: 1, iss_qty: 0, unit: 'Each', ave_cost: 0, total_cost: 0 }
      ]);

      setIsAddSrOpen(true);
      toast.success(`Extracted ${parsed.request_no} with ${parsed.items.length} lines!`, { id: toastId });
    } catch (err: any) {
      console.error("PDF Parse error:", err);
      toast.error("PDF Error: " + err.message, { id: toastId });
    } finally {
      setIsParsingPdf(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const parseVoucherByCoordinates = (tokens: { str: string; x: number; y: number }[]) => {
    let request_no = '';
    let to_cost_center = 'HOUSE KEEPING';
    let from_store = 'MAIN STORE - GENERAL';
    let delivery_date = '';
    let reference = '';
    const items: StoreRequestItem[] = [];

    const fullText = tokens.map(t => t.str).join(" ");

    // 1. LA Request No
    const laMatch = fullText.match(/LA\d{4}-\d{5}/i);
    if (laMatch) request_no = laMatch[0].toUpperCase();

    // 2. Cost Center
    for (const cc of COST_CENTERS) {
      if (fullText.toUpperCase().includes(`(${cc})`) || fullText.toUpperCase().includes(`TO ${cc}`)) {
        to_cost_center = cc;
        break;
      }
    }

    // 3. From Store
    for (const fs of FROM_STORES) {
      const cleanFs = fs.replace(/[^A-Z]/gi, "").toUpperCase();
      const cleanDoc = fullText.replace(/[^A-Z]/gi, "").toUpperCase();
      if (cleanDoc.includes(cleanFs)) {
        from_store = fs;
        break;
      }
    }

    // 4. Delivery Date
    const delivMatch = fullText.match(/(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})\s*Delivery\s*Date/i) ||
                       fullText.match(/Delivery\s*Date:?\s*(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/i);
    if (delivMatch) {
      const d = delivMatch[1].padStart(2, '0');
      const m = delivMatch[2].padStart(2, '0');
      const y = delivMatch[3];
      delivery_date = `${y}-${m}-${d}`;
    }

    // 5. Group into Rows by Y coordinate (within 5 points)
    const rowsMap: Record<number, { str: string; x: number }[]> = {};
    tokens.forEach((t) => {
      let matchedY: number | null = null;
      for (const yKey of Object.keys(rowsMap).map(Number)) {
        if (Math.abs(yKey - t.y) <= 5) {
          matchedY = yKey;
          break;
        }
      }
      if (matchedY === null) {
        matchedY = Math.round(t.y);
        rowsMap[matchedY] = [];
      }
      rowsMap[matchedY].push({ str: t.str, x: t.x });
    });

    // 6. Process Rows
    Object.keys(rowsMap)
      .map(Number)
      .sort((a, b) => b - a)
      .forEach((y) => {
        const rowItems = rowsMap[y].sort((a, b) => a.x - b.x);
        const rowText = rowItems.map(t => t.str).join(" ");

        // Look for 7 digit article number
        const artMatch = rowText.match(/(\d{7})/);
        if (!artMatch) return;
        
        const artNo = artMatch[1];
        let reqQty = 0;
        let ave = 0;
        let total = 0;
        let unit = '';
        let desc = '';

        // Check for Birchstreet bug where tokens get merged without spaces (e.g. Lt 1.412201007 48.00 67.55330 MLBeer)
        const bsRegex = new RegExp(`(?:[A-Za-z]+)?\\s*(\\d+\\.\\d{2})${artNo}\\s+(\\d+(?:\\.\\d+)?)\\s+(\\d+\\.\\d{2})(.*)`, 'i');
        const bsMatch = rowText.match(bsRegex);

        if (bsMatch) {
          ave = parseFloat(bsMatch[1]);
          reqQty = parseFloat(bsMatch[2]);
          total = parseFloat(bsMatch[3]);
          
          let remainder = bsMatch[4].trim();
          const unitMatch = remainder.match(/^(330\s*ML|500\s*GM|EACH|LT|KG|BOTTLES?|CANS?|BOXES?|PKT|ROLL)/i);
          if (unitMatch) {
            unit = unitMatch[1];
            desc = remainder.substring(unitMatch[0].length).trim();
          } else {
            unit = "Each";
            desc = remainder;
          }
        } else {
          // Standard Coordinate Map
          let descParts: string[] = [];
          rowItems.forEach(it => {
            const s = it.str.trim();
            if (!s || s.includes(artNo)) return;

            if (it.x > 55 && it.x < 260) {
              descParts.push(s);
            } else if (it.x >= 260 && it.x < 320) {
              const q = parseFloat(s.replace(',', '.'));
              if (!isNaN(q)) reqQty = q;
            } else if (it.x >= 320 && it.x < 420) {
              if (!unit && isNaN(parseFloat(s))) unit = s;
            } else if (it.x >= 450 && it.x < 520) {
              const a = parseFloat(s.replace(',', '.'));
              if (!isNaN(a)) ave = a;
            } else if (it.x >= 520) {
              const t = parseFloat(s.replace(',', '.'));
              if (!isNaN(t)) total = t;
            }
          });

          desc = descParts.join(" ");
        }

        desc = desc.replace(/^[-|]\s*/, '').trim();

        // Safety fallback
        if (reqQty === 0) reqQty = 1;
        if (total === 0 && reqQty > 0 && ave > 0) total = parseFloat((reqQty * ave).toFixed(2));

        items.push({
          article_number: artNo,
          item_description: desc || `Item ${artNo}`,
          req_qty: reqQty,
          iss_qty: 0,
          unit: unit || 'Each',
          ave_cost: ave,
          total_cost: total
        });
      });

    return { request_no, to_cost_center, from_store, delivery_date, reference, items };
  };

  const handleItemChange = (index: number, field: keyof StoreRequestItem, value: any) => {
    const updated = [...srItems];
    const row = { ...updated[index], [field]: value };

    if (field === 'req_qty' || field === 'ave_cost') {
      const q = field === 'req_qty' ? parseFloat(value) || 0 : row.req_qty;
      const c = field === 'ave_cost' ? parseFloat(value) || 0 : row.ave_cost;
      row.total_cost = parseFloat((q * c).toFixed(2));
    }

    updated[index] = row;
    setSrItems(updated);
  };

  const handleAddItemRow = () => {
    setSrItems([
      ...srItems,
      { article_number: '', item_description: '', req_qty: 1, iss_qty: 0, unit: 'Each', ave_cost: 0, total_cost: 0 }
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (srItems.length === 1) {
      setSrItems([{ article_number: '', item_description: '', req_qty: 1, iss_qty: 0, unit: 'Each', ave_cost: 0, total_cost: 0 }]);
    } else {
      setSrItems(srItems.filter((_, i) => i !== index));
    }
  };

  const handleSaveStoreRequest = async () => {
    if (!srHeader.request_no.trim()) {
      return toast.error("Please enter the LA Request No (e.g. LA2610-00434)");
    }

    const validItems = srItems.filter(item => item.article_number.trim() && item.item_description.trim());
    if (validItems.length === 0) {
      return toast.error("Please add at least one line item with Article No and Description");
    }

    const grandTotal = validItems.reduce((sum, item) => sum + (item.total_cost || 0), 0);

    try {
      const { data: headerData, error: hErr } = await supabase
        .from('hsk_store_requests')
        .upsert([{
          request_no: srHeader.request_no.trim().toUpperCase(),
          delivery_date: srHeader.delivery_date,
          from_store: srHeader.from_store,
          to_cost_center: srHeader.to_cost_center,
          reference: srHeader.reference,
          grand_total: grandTotal,
          status: 'Authorised'
        }], { onConflict: 'request_no' })
        .select()
        .single();

      if (hErr) throw hErr;

      // Replace existing lines for this request number
      await supabase.from('hsk_store_request_items').delete().eq('request_no', srHeader.request_no.trim().toUpperCase());

      const lineItemPayload = validItems.map(item => ({
        request_id: headerData.id,
        request_no: srHeader.request_no.trim().toUpperCase(),
        article_number: item.article_number.trim(),
        item_description: item.item_description.trim(),
        req_qty: item.req_qty,
        iss_qty: item.iss_qty || 0,
        unit: item.unit || 'Each',
        ave_cost: item.ave_cost || 0,
        total_cost: item.total_cost || 0,
      }));

      const { error: itemsErr } = await supabase
        .from('hsk_store_request_items')
        .insert(lineItemPayload);

      if (itemsErr) throw itemsErr;

      toast.success(`Saved Request ${srHeader.request_no}!`);
      setIsAddSrOpen(false);
      fetchStoreRequests();
    } catch (err: any) {
      toast.error("Error saving request: " + err.message);
    }
  };

  const handleDeleteStoreRequest = async (id: string, reqNo: string) => {
    if (!confirm(`Delete entire request ${reqNo} and all its line items?`)) return;
    try {
      await supabase.from('hsk_store_requests').delete().eq('id', id);
      toast.success(`Request ${reqNo} deleted`);
      fetchStoreRequests();
    } catch (err: any) {
      toast.error("Failed to delete: " + err.message);
    }
  };

  const toggleExpand = (reqNo: string) => {
    setExpandedRequests(prev => ({ ...prev, [reqNo]: !prev[reqNo] }));
  };

  const filteredStoreRequests = storeRequests.filter(req => {
    if (costCenterFilter !== 'ALL' && req.to_cost_center !== costCenterFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const matchesHeader = 
      req.request_no.toLowerCase().includes(q) ||
      req.to_cost_center.toLowerCase().includes(q) ||
      req.from_store.toLowerCase().includes(q) ||
      req.delivery_date.includes(q);

    const matchesItem = req.items.some(it => 
      it.article_number.includes(q) || it.item_description.toLowerCase().includes(q)
    );

    return matchesHeader || matchesItem;
  });

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-4 md:p-6 pb-24 font-antiqua text-[#6D2158]">
      
      {/* Hidden File Input for PDF Upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="application/pdf"
        className="hidden"
        onChange={handlePdfUpload}
      />

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b border-slate-200 pb-5 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Order & Store Tracking</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
            Six Senses Laamu Procurement & Transfer Vouchers
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'Store Request' && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsingPdf}
              className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-3 rounded-xl text-xs font-bold uppercase flex items-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {isParsingPdf ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16}/>}
              <span>{isParsingPdf ? "Reading PDF..." : "Upload Transfer PDF"}</span>
            </button>
          )}

          <button
            onClick={() => {
              setSrHeader({
                request_no: '',
                delivery_date: new Date().toISOString().split('T')[0],
                from_store: 'MAIN STORE - GENERAL',
                to_cost_center: 'HOUSE KEEPING',
                reference: ''
              });
              setSrItems([{ article_number: '', item_description: '', req_qty: 1, iss_qty: 0, unit: 'Each', ave_cost: 0, total_cost: 0 }]);
              setIsAddSrOpen(true);
            }}
            className="bg-[#6D2158] text-white px-5 py-3 rounded-xl text-xs font-bold uppercase flex items-center gap-2 shadow-lg hover:bg-[#5a1b49] transition-all cursor-pointer"
          >
            <Plus size={18}/> New Request Voucher
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-4 mb-6">
        <button 
          onClick={() => { setActiveTab('Store Request'); setCostCenterFilter('ALL'); }}
          className={`flex-1 p-4 rounded-xl border-2 flex items-center justify-center gap-3 transition-all cursor-pointer ${
            activeTab === 'Store Request' 
              ? 'border-[#6D2158] bg-white text-[#6D2158] shadow-md' 
              : 'border-transparent bg-slate-100 text-slate-400 hover:bg-slate-200/60'
          }`}
        >
          <Warehouse size={24} />
          <div className="text-left">
            <span className="block text-xs font-bold uppercase tracking-wider">Internal Transfer</span>
            <span className="text-lg font-bold">Store Request (SR)</span>
          </div>
        </button>

        <button 
          onClick={() => setActiveTab('Purchase Request')}
          className={`flex-1 p-4 rounded-xl border-2 flex items-center justify-center gap-3 transition-all cursor-pointer ${
            activeTab === 'Purchase Request' 
              ? 'border-[#6D2158] bg-white text-[#6D2158] shadow-md' 
              : 'border-transparent bg-slate-100 text-slate-400 hover:bg-slate-200/60'
          }`}
        >
          <Truck size={24} />
          <div className="text-left">
            <span className="block text-xs font-bold uppercase tracking-wider">External Supplier</span>
            <span className="text-lg font-bold">Purchase Request (PR)</span>
          </div>
        </button>
      </div>

      {/* SEARCH & FILTERS */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-3.5 text-slate-400" size={18}/>
          <input 
            type="text" 
            placeholder="Search by LA No, Art No, Item Description, Cost Center..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-700 outline-none focus:border-[#6D2158] shadow-sm"
          />
        </div>

        {activeTab === 'Store Request' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setCostCenterFilter('ALL')}
              className={`px-3 py-2 rounded-xl text-xs font-bold uppercase transition-all whitespace-nowrap cursor-pointer ${
                costCenterFilter === 'ALL'
                  ? 'bg-[#6D2158] text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              All Cost Centers
            </button>
            {COST_CENTERS.map((cc) => (
              <button
                key={cc}
                onClick={() => setCostCenterFilter(cc)}
                className={`px-3 py-2 rounded-xl text-xs font-bold uppercase transition-all whitespace-nowrap cursor-pointer ${
                  costCenterFilter === cc
                    ? 'bg-[#6D2158] text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                {cc}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* STORE REQUEST VOUCHERS LIST */}
      {activeTab === 'Store Request' && (
        <div className="space-y-4">
          {filteredStoreRequests.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-bold italic bg-white rounded-2xl border border-slate-200">
              {isLoading ? "Loading store requests..." : "No requests found. Click 'Upload Transfer PDF' to import a voucher."}
            </div>
          ) : (
            filteredStoreRequests.map((group) => {
              const isExpanded = expandedRequests[group.request_no];

              return (
                <div key={group.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  
                  {/* GROUP HEADER: LA NO, DATES, COST CENTER, FROM STORE */}
                  <div 
                    onClick={() => toggleExpand(group.request_no)}
                    className="p-4 bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer border-b border-slate-200 flex flex-wrap justify-between items-center gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <button className="text-[#6D2158]">
                        {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                      </button>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-[#6D2158] tracking-tight">
                            {group.request_no}
                          </span>
                          <span className="bg-[#6D2158]/10 text-[#6D2158] px-2 py-0.5 rounded text-[10px] font-black uppercase">
                            ({group.to_cost_center})
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold mt-0.5 flex items-center gap-2">
                          <span>From: <strong className="text-slate-600">{group.from_store}</strong></span>
                          <span>•</span>
                          <span>Delivery Date: <strong className="text-slate-600 font-mono">{group.delivery_date}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="block text-[9px] font-black uppercase text-slate-400">Total Items</span>
                        <span className="text-xs font-black text-slate-700">{group.items.length} Lines</span>
                      </div>

                      <div className="text-right">
                        <span className="block text-[9px] font-black uppercase text-slate-400">Grand Total</span>
                        <span className="text-sm font-black text-emerald-700 font-mono">
                          ${Number(group.grand_total).toFixed(2)}
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteStoreRequest(group.id, group.request_no);
                        }}
                        className="p-1.5 text-slate-300 hover:text-rose-600 rounded-lg"
                        title="Delete Request"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* ITEMS TABLE FOR THIS VOUCHER */}
                  {isExpanded && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-100/50 text-[10px] font-black uppercase text-slate-400 border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-4 w-28">Date</th>
                            <th className="py-2.5 px-4 w-28 font-mono">Art No.</th>
                            <th className="py-2.5 px-4">Item Description</th>
                            <th className="py-2.5 px-4 text-center w-24">Req. Qty</th>
                            <th className="py-2.5 px-4 text-center w-24">Unit</th>
                            <th className="py-2.5 px-4 text-right w-24">AVE ($)</th>
                            <th className="py-2.5 px-4 text-right w-28">Total ($)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {group.items.map((item, idx) => (
                            <tr key={item.id || idx} className="hover:bg-slate-50 transition-colors">
                              <td className="py-3 px-4 font-mono font-bold text-slate-500 whitespace-nowrap">
                                {group.delivery_date}
                              </td>
                              <td className="py-3 px-4 font-mono font-bold text-[#6D2158]">
                                {item.article_number}
                              </td>
                              <td className="py-3 px-4 font-bold text-slate-800">
                                {item.item_description}
                              </td>
                              <td className="py-3 px-4 font-black text-center text-slate-800">
                                {item.req_qty}
                              </td>
                              <td className="py-3 px-4 text-center font-bold uppercase text-slate-500">
                                {item.unit}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-slate-500">
                                ${Number(item.ave_cost).toFixed(2)}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-black text-slate-800">
                                ${Number(item.total_cost).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-xs">
                          <tr>
                            <td colSpan={6} className="py-3 px-4 text-right font-black uppercase text-slate-500">
                              Grand Total:
                            </td>
                            <td className="py-3 px-4 text-right font-black text-emerald-700 font-mono text-sm">
                              ${Number(group.grand_total).toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                </div>
              );
            })
          )}
        </div>
      )}

      {/* REVIEW & SAVE STORE REQUEST MODAL */}
      {isAddSrOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl p-6 animate-in zoom-in-95 border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Review & Save Store Request</h3>
                <p className="text-xs text-slate-400 font-bold">Verify parsed details from PDF before committing</p>
              </div>
              <button onClick={() => setIsAddSrOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto pr-1">
              {/* HEADER DETAILS */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-purple-50/70 p-4 rounded-2xl border border-purple-100 text-xs">
                <div>
                  <label className="text-[10px] font-black uppercase text-[#6D2158] block mb-1">LA Request No *</label>
                  <input
                    type="text"
                    placeholder="LA2610-00119"
                    required
                    className="w-full p-2 bg-white border border-purple-200 rounded-xl font-black text-xs text-[#6D2158] outline-none"
                    value={srHeader.request_no}
                    onChange={e => setSrHeader({ ...srHeader, request_no: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-[#6D2158] block mb-1">Delivery Date *</label>
                  <input
                    type="date"
                    className="w-full p-2 bg-white border border-purple-200 rounded-xl font-bold text-xs text-slate-700 outline-none"
                    value={srHeader.delivery_date}
                    onChange={e => setSrHeader({ ...srHeader, delivery_date: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-[#6D2158] block mb-1">To Cost Center *</label>
                  <select
                    className="w-full p-2 bg-white border border-purple-200 rounded-xl font-bold text-xs text-slate-700 outline-none"
                    value={srHeader.to_cost_center}
                    onChange={e => setSrHeader({ ...srHeader, to_cost_center: e.target.value })}
                  >
                    {COST_CENTERS.map(cc => <option key={cc} value={cc}>{cc}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-[#6D2158] block mb-1">From Store *</label>
                  <select
                    className="w-full p-2 bg-white border border-purple-200 rounded-xl font-bold text-xs text-slate-700 outline-none"
                    value={srHeader.from_store}
                    onChange={e => setSrHeader({ ...srHeader, from_store: e.target.value })}
                  >
                    {FROM_STORES.map(fs => <option key={fs} value={fs}>{fs}</option>)}
                  </select>
                </div>
              </div>

              {/* LINE ITEMS */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-black uppercase text-slate-700 tracking-wider">
                    Extracted Items ({srItems.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="text-xs font-bold text-[#6D2158] hover:bg-[#6D2158]/10 px-2.5 py-1 rounded-lg border border-[#6D2158]/20 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={14} /> Add Line Item
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {srItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 items-center text-xs">
                      <div className="col-span-2">
                        <input
                          type="text"
                          placeholder="Art No."
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-xs text-slate-800 outline-none"
                          value={item.article_number}
                          onChange={e => handleItemChange(idx, 'article_number', e.target.value)}
                        />
                      </div>

                      <div className="col-span-4">
                        <input
                          type="text"
                          placeholder="Item Description"
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-bold text-xs text-slate-800 outline-none"
                          value={item.item_description}
                          onChange={e => handleItemChange(idx, 'item_description', e.target.value)}
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          placeholder="Qty"
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-black text-center text-xs text-slate-800 outline-none"
                          value={item.req_qty}
                          onChange={e => handleItemChange(idx, 'req_qty', e.target.value)}
                        />
                      </div>

                      <div className="col-span-1">
                        <input
                          type="text"
                          placeholder="Unit"
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-bold text-center text-xs text-slate-600 outline-none"
                          value={item.unit}
                          onChange={e => handleItemChange(idx, 'unit', e.target.value)}
                        />
                      </div>

                      <div className="col-span-1">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="AVE"
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-mono text-center text-xs text-slate-600 outline-none"
                          value={item.ave_cost || ''}
                          onChange={e => handleItemChange(idx, 'ave_cost', e.target.value)}
                        />
                      </div>

                      <div className="col-span-1 text-right font-mono font-black text-slate-700">
                        ${Number(item.total_cost || 0).toFixed(2)}
                      </div>

                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* GRAND TOTAL */}
              <div className="flex justify-between items-center bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-xs font-black uppercase text-slate-500">Voucher Grand Total:</span>
                <span className="text-lg font-black text-emerald-700 font-mono">
                  ${srItems.reduce((acc, curr) => acc + (Number(curr.total_cost) || 0), 0).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 mt-4">
              <button
                type="button"
                onClick={() => setIsAddSrOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveStoreRequest}
                className="px-6 py-2.5 bg-[#6D2158] hover:bg-[#521643] text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md cursor-pointer"
              >
                Confirm & Save Voucher
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}