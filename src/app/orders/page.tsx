"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, Truck, Warehouse,
  X, Trash2, Save, FileText,
  ChevronDown, ChevronRight, UploadCloud, Loader2, PackageCheck
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

  // Store Request Modal State
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

    const laMatch = fullText.match(/LA\d{4}-\d{5}/i);
    if (laMatch) request_no = laMatch[0].toUpperCase();

    for (const cc of COST_CENTERS) {
      if (fullText.toUpperCase().includes(`(${cc})`) || fullText.toUpperCase().includes(`TO ${cc}`)) {
        to_cost_center = cc;
        break;
      }
    }

    for (const fs of FROM_STORES) {
      const cleanFs = fs.replace(/[^A-Z]/gi, "").toUpperCase();
      const cleanDoc = fullText.replace(/[^A-Z]/gi, "").toUpperCase();
      if (cleanDoc.includes(cleanFs)) {
        from_store = fs;
        break;
      }
    }

    const delivMatch = fullText.match(/(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})\s*Delivery\s*Date/i) ||
                       fullText.match(/Delivery\s*Date:?\s*(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/i);
    if (delivMatch) {
      const d = delivMatch[1].padStart(2, '0');
      const m = delivMatch[2].padStart(2, '0');
      const y = delivMatch[3];
      delivery_date = `${y}-${m}-${d}`;
    }

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

    Object.keys(rowsMap)
      .map(Number)
      .sort((a, b) => b - a)
      .forEach((y) => {
        const rowItems = rowsMap[y].sort((a, b) => a.x - b.x);
        const rowText = rowItems.map(t => t.str).join(" ");

        const artMatch = rowText.match(/(\d{7})/);
        if (!artMatch) return;
        
        const artNo = artMatch[1];
        let reqQty = 0;
        let ave = 0;
        let total = 0;
        let unit = '';
        let desc = '';

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

  const handleSavePrOrder = async () => {
    if (!prFormData.article_number || !prFormData.item_name) {
      return toast.error("Please enter Article No and Item Description");
    }
    const { error } = await supabase.from('hsk_procurement_orders').insert([{
      order_type: 'Purchase Request',
      request_date: prFormData.request_date,
      request_no: prFormData.request_no,
      article_number: prFormData.article_number,
      item_name: prFormData.item_name,
      ordered_qty: parseFloat(prFormData.ordered_qty) || 1,
      unit: prFormData.unit || 'Each',
      received_qty: 0,
      remarks: prFormData.remarks || null,
      status: 'Pending'
    }]);

    if (error) return toast.error("Error saving PR: " + error.message);

    toast.success("Purchase Request created!");
    setIsAddPrOpen(false);
    setPrFormData({
      request_date: new Date().toISOString().split('T')[0],
      request_no: '',
      article_number: '',
      item_name: '',
      ordered_qty: '',
      unit: 'Each',
      remarks: ''
    });
    fetchPurchaseOrders();
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

  const filteredPurchaseOrders = purchaseOrders.filter(o => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (o.item_name && o.item_name.toLowerCase().includes(q)) ||
      (o.request_no && o.request_no.toLowerCase().includes(q)) ||
      (o.article_number && o.article_number.includes(q)) ||
      (o.remarks && o.remarks.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-3 sm:p-4 md:p-6 pb-28 font-sans text-slate-800">
      
      {/* Hidden File Input for PDF Upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="application/pdf"
        className="hidden"
        onChange={handlePdfUpload}
      />

      {/* UNIFIED EXECUTIVE HEADER (MATCHES GUEST SUMMARY) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm gap-4">
        <div className="flex items-center gap-3.5">
          <div className="h-10 w-1.5 bg-[#6D2158] rounded-full shrink-0" />
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight">
              Order & Store Tracking
            </h1>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
              Procurement & Internal Transfer Vouchers
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {activeTab === 'Store Request' && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsingPdf}
              className="flex-1 sm:flex-initial justify-center bg-slate-800 hover:bg-slate-900 active:scale-95 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {isParsingPdf ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15}/>}
              <span>{isParsingPdf ? "Reading..." : "Upload PDF"}</span>
            </button>
          )}

          <button
            onClick={() => {
              if (activeTab === 'Purchase Request') {
                setIsAddPrOpen(true);
              } else {
                setSrHeader({
                  request_no: '',
                  delivery_date: new Date().toISOString().split('T')[0],
                  from_store: 'MAIN STORE - GENERAL',
                  to_cost_center: 'HOUSE KEEPING',
                  reference: ''
                });
                setSrItems([{ article_number: '', item_description: '', req_qty: 1, iss_qty: 0, unit: 'Each', ave_cost: 0, total_cost: 0 }]);
                setIsAddSrOpen(true);
              }
            }}
            className="flex-1 sm:flex-initial justify-center bg-[#6D2158] hover:bg-[#5a1b49] active:scale-95 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus size={16}/>
            <span>{activeTab === 'Purchase Request' ? 'New PR' : 'New Voucher'}</span>
          </button>
        </div>
      </div>

      {/* UNIFIED SEGMENTED TABS */}
      <div className="grid grid-cols-2 gap-3 mb-5 bg-slate-200/70 p-1.5 rounded-2xl">
        <button 
          onClick={() => { setActiveTab('Store Request'); setCostCenterFilter('ALL'); }}
          className={`py-2.5 px-4 rounded-xl flex items-center justify-center gap-2.5 text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'Store Request' 
              ? 'bg-white text-[#6D2158] shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Warehouse size={16} />
          <span>Store Request (SR)</span>
        </button>

        <button 
          onClick={() => setActiveTab('Purchase Request')}
          className={`py-2.5 px-4 rounded-xl flex items-center justify-center gap-2.5 text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'Purchase Request' 
              ? 'bg-white text-[#6D2158] shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Truck size={16} />
          <span>Purchase Request (PR)</span>
        </button>
      </div>

      {/* SEARCH & HORIZONTAL PILL FILTERS */}
      <div className="flex flex-col lg:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 text-slate-400" size={16}/>
          <input 
            type="text" 
            placeholder={
              activeTab === 'Store Request'
                ? "Search LA No, Article No, Description, or Cost Center..."
                : "Search PR No, Article No, Description, or Remark..."
            }
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200/90 rounded-xl font-bold text-xs text-slate-700 outline-none focus:border-[#6D2158] shadow-xs"
          />
        </div>

        {activeTab === 'Store Request' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setCostCenterFilter('ALL')}
              className={`px-3 py-2 rounded-xl text-[11px] font-bold uppercase transition-all whitespace-nowrap cursor-pointer ${
                costCenterFilter === 'ALL'
                  ? 'bg-[#6D2158] text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              All
            </button>
            {COST_CENTERS.map((cc) => (
              <button
                key={cc}
                onClick={() => setCostCenterFilter(cc)}
                className={`px-3 py-2 rounded-xl text-[11px] font-bold uppercase transition-all whitespace-nowrap cursor-pointer ${
                  costCenterFilter === cc
                    ? 'bg-[#6D2158] text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                {cc}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. STORE REQUEST VOUCHERS VIEW (DESKTOP TABLE + NATIVE MOBILE CARDS)      */}
      {/* ========================================================================= */}
      {activeTab === 'Store Request' && (
        <div className="space-y-3.5">
          {filteredStoreRequests.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-bold text-xs bg-white rounded-2xl border border-slate-200/80">
              {isLoading ? "Loading store requests..." : "No requests found. Tap 'Upload PDF' to import a voucher."}
            </div>
          ) : (
            filteredStoreRequests.map((group) => {
              const isExpanded = expandedRequests[group.request_no];

              return (
                <div key={group.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden transition-all">
                  
                  {/* VOUCHER ACCORDION HEADER */}
                  <div 
                    onClick={() => toggleExpand(group.request_no)}
                    className="p-3.5 sm:p-4 bg-white hover:bg-slate-50/80 active:bg-slate-100/60 cursor-pointer flex items-center justify-between gap-3 transition-colors select-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-[#6D2158]/10 text-[#6D2158] flex items-center justify-center shrink-0">
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm sm:text-base font-black text-slate-800 font-mono tracking-tight">
                            {group.request_no}
                          </span>
                          <span className="bg-[#6D2158]/10 text-[#6D2158] px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider">
                            {group.to_cost_center}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-semibold mt-0.5 truncate">
                          {group.from_store} • <span className="font-mono text-slate-500">{group.delivery_date}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-5 shrink-0">
                      <div className="hidden sm:block text-right">
                        <span className="block text-[9px] font-bold uppercase text-slate-400">Items</span>
                        <span className="text-xs font-black text-slate-700">{group.items.length}</span>
                      </div>

                      <div className="text-right">
                        <span className="block text-[9px] font-bold uppercase text-slate-400">Total</span>
                        <span className="text-xs sm:text-sm font-black text-emerald-600 font-mono">
                          ${Number(group.grand_total).toFixed(2)}
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteStoreRequest(group.id, group.request_no);
                        }}
                        className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                        title="Delete Voucher"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* EXPANDED CONTENT */}
                  {isExpanded && (
                    <div className="border-t border-slate-100">
                      {/* MOBILE NATIVE CARD LIST */}
                      <div className="md:hidden divide-y divide-slate-100 bg-slate-50/40">
                        {group.items.map((item, idx) => (
                          <div key={item.id || idx} className="p-3.5 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[11px] font-black text-[#6D2158] bg-[#6D2158]/10 px-1.5 py-0.5 rounded">
                                  {item.article_number}
                                </span>
                                <span className="text-[10px] font-mono text-slate-400">
                                  {group.delivery_date}
                                </span>
                              </div>
                              <p className="text-xs font-bold text-slate-800 mt-1 truncate">
                                {item.item_description}
                              </p>
                              <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                                AVE: <span className="font-mono">${Number(item.ave_cost).toFixed(2)}</span> / {item.unit}
                              </p>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="inline-block px-2 py-0.5 bg-slate-100 rounded text-xs font-black text-slate-800">
                                {item.req_qty} <span className="text-[10px] font-bold text-slate-500">{item.unit}</span>
                              </span>
                              <span className="block text-xs font-black font-mono text-slate-800 mt-1">
                                ${Number(item.total_cost).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* DESKTOP TABLE */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-slate-50/80 text-[10px] font-bold uppercase text-slate-400 tracking-wider border-b border-slate-100">
                            <tr>
                              <th className="py-2.5 px-4 w-28">Date</th>
                              <th className="py-2.5 px-4 w-28">Art No.</th>
                              <th className="py-2.5 px-4">Item Description</th>
                              <th className="py-2.5 px-4 text-center w-24">Req. Qty</th>
                              <th className="py-2.5 px-4 text-center w-24">Unit</th>
                              <th className="py-2.5 px-4 text-right w-24">AVE ($)</th>
                              <th className="py-2.5 px-4 text-right w-28">Total ($)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {group.items.map((item, idx) => (
                              <tr key={item.id || idx} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-2.5 px-4 font-mono text-[11px] font-semibold text-slate-400 whitespace-nowrap">
                                  {group.delivery_date}
                                </td>
                                <td className="py-2.5 px-4 font-mono font-bold text-[#6D2158]">
                                  {item.article_number}
                                </td>
                                <td className="py-2.5 px-4 font-bold text-slate-800">
                                  {item.item_description}
                                </td>
                                <td className="py-2.5 px-4 font-black text-center text-slate-800">
                                  {item.req_qty}
                                </td>
                                <td className="py-2.5 px-4 text-center font-bold uppercase text-[11px] text-slate-500">
                                  {item.unit}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-500">
                                  ${Number(item.ave_cost).toFixed(2)}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono font-black text-slate-800">
                                  ${Number(item.total_cost).toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. PURCHASE REQUEST VIEW (DESKTOP TABLE + NATIVE MOBILE CARDS)            */}
      {/* ========================================================================= */}
      {activeTab === 'Purchase Request' && (
        <>
          {/* MOBILE CARDS */}
          <div className="md:hidden space-y-3">
            {filteredPurchaseOrders.map((order) => (
              <div key={order.id} className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col gap-2.5">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-mono text-xs font-black text-[#6D2158]">{order.request_no || 'PR'}</span>
                    <span className="text-[11px] font-mono text-slate-400 ml-2">{order.request_date}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    order.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {order.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">{order.item_name}</p>
                  <p className="text-[10px] font-mono text-slate-400">Art: {order.article_number}</p>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-xs">
                  <span className="font-bold text-slate-600">
                    Ordered: <strong className="text-slate-900">{order.ordered_qty} {order.unit}</strong>
                  </span>
                  <span className="font-bold text-emerald-600">
                    Recv: {order.received_qty || 0}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* DESKTOP TABLE */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[950px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  <tr>
                    <th className="py-3 px-4 w-28">PR Date</th>
                    <th className="py-3 px-4 w-32">PR / Req No</th>
                    <th className="py-3 px-4">Items & Description</th>
                    <th className="py-3 px-4 text-center w-28">Ordered Qty</th>
                    <th className="py-3 px-4 text-center w-20">Unit</th>
                    <th className="py-3 px-4 text-center w-28">Received Date</th>
                    <th className="py-3 px-4 text-center w-28">Received Qty</th>
                    <th className="py-3 px-4">Remark</th>
                    <th className="py-3 px-4 text-center w-24">Status</th>
                    <th className="py-3 px-4 text-right w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPurchaseOrders.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-10 text-center text-slate-400 font-bold">
                        No purchase requests found.
                      </td>
                    </tr>
                  ) : (
                    filteredPurchaseOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono text-[11px] font-semibold text-slate-500">{order.request_date}</td>
                        <td className="py-3 px-4 font-mono font-bold text-[#6D2158]">{order.request_no || '-'}</td>
                        <td className="py-3 px-4 font-bold text-slate-800">
                          <div>{order.item_name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">Art: {order.article_number}</div>
                        </td>
                        <td className="py-3 px-4 text-center font-black text-slate-800">{order.ordered_qty}</td>
                        <td className="py-3 px-4 text-center font-bold uppercase text-slate-500">{order.unit}</td>
                        <td className="py-3 px-4 text-center font-mono text-emerald-700 font-bold">{order.received_date || '-'}</td>
                        <td className="py-3 px-4 text-center font-black text-emerald-600">{order.received_qty || '-'}</td>
                        <td className="py-3 px-4 text-slate-500">{order.remarks || '-'}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            order.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button 
                            onClick={async () => {
                              if (!confirm("Delete this purchase order?")) return;
                              await supabase.from('hsk_procurement_orders').delete().eq('id', order.id);
                              fetchPurchaseOrders();
                            }}
                            className="p-1.5 text-slate-300 hover:text-rose-600 rounded-lg"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* NATIVE BOTTOM-SHEET / DESKTOP MODAL: STORE REQUEST VOUCHER                */}
      {/* ========================================================================= */}
      {isAddSrOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-t-3xl md:rounded-3xl shadow-2xl w-full max-w-3xl p-5 sm:p-6 animate-in slide-in-from-bottom-6 md:zoom-in-95 border border-slate-200 max-h-[92vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3.5 mb-4">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-800">Review & Save Store Request</h3>
                <p className="text-[11px] text-slate-400 font-bold">Verify voucher header and line items</p>
              </div>
              <button onClick={() => setIsAddSrOpen(false)} className="bg-slate-100 p-1.5 rounded-full text-slate-500 hover:text-slate-800">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-xs">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">LA Request No *</label>
                  <input
                    type="text"
                    placeholder="LA2610-00119"
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl font-mono font-black text-xs text-[#6D2158] outline-none focus:border-[#6D2158]"
                    value={srHeader.request_no}
                    onChange={e => setSrHeader({ ...srHeader, request_no: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Delivery Date *</label>
                  <input
                    type="date"
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-700 outline-none focus:border-[#6D2158]"
                    value={srHeader.delivery_date}
                    onChange={e => setSrHeader({ ...srHeader, delivery_date: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">To Cost Center *</label>
                  <select
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-700 outline-none focus:border-[#6D2158]"
                    value={srHeader.to_cost_center}
                    onChange={e => setSrHeader({ ...srHeader, to_cost_center: e.target.value })}
                  >
                    {COST_CENTERS.map(cc => <option key={cc} value={cc}>{cc}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">From Store *</label>
                  <select
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-700 outline-none focus:border-[#6D2158]"
                    value={srHeader.from_store}
                    onChange={e => setSrHeader({ ...srHeader, from_store: e.target.value })}
                  >
                    {FROM_STORES.map(fs => <option key={fs} value={fs}>{fs}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[11px] font-black uppercase text-slate-500 tracking-wider">
                    Extracted Items ({srItems.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="text-xs font-bold text-[#6D2158] hover:bg-[#6D2158]/10 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={14} /> Add Line
                  </button>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {srItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 items-center text-xs">
                      <div className="col-span-3 sm:col-span-2">
                        <input
                          type="text"
                          placeholder="Art No."
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg font-mono font-bold text-xs text-slate-800 outline-none"
                          value={item.article_number}
                          onChange={e => handleItemChange(idx, 'article_number', e.target.value)}
                        />
                      </div>

                      <div className="col-span-9 sm:col-span-4">
                        <input
                          type="text"
                          placeholder="Item Description"
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold text-xs text-slate-800 outline-none"
                          value={item.item_description}
                          onChange={e => handleItemChange(idx, 'item_description', e.target.value)}
                        />
                      </div>

                      <div className="col-span-3 sm:col-span-2">
                        <input
                          type="number"
                          placeholder="Qty"
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg font-black text-center text-xs text-slate-800 outline-none"
                          value={item.req_qty}
                          onChange={e => handleItemChange(idx, 'req_qty', e.target.value)}
                        />
                      </div>

                      <div className="col-span-3 sm:col-span-1">
                        <input
                          type="text"
                          placeholder="Unit"
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold text-center text-xs text-slate-600 outline-none"
                          value={item.unit}
                          onChange={e => handleItemChange(idx, 'unit', e.target.value)}
                        />
                      </div>

                      <div className="col-span-3 sm:col-span-1">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="AVE"
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg font-mono text-center text-xs text-slate-600 outline-none"
                          value={item.ave_cost || ''}
                          onChange={e => handleItemChange(idx, 'ave_cost', e.target.value)}
                        />
                      </div>

                      <div className="col-span-2 sm:col-span-1 text-right font-mono font-black text-slate-700">
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

              <div className="flex justify-between items-center bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                <span className="text-xs font-black uppercase text-slate-500">Voucher Grand Total</span>
                <span className="text-lg font-black text-emerald-600 font-mono">
                  ${srItems.reduce((acc, curr) => acc + (Number(curr.total_cost) || 0), 0).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 mt-4">
              <button
                type="button"
                onClick={() => setIsAddSrOpen(false)}
                className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveStoreRequest}
                className="px-6 py-2.5 bg-[#6D2158] hover:bg-[#5a1b49] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md cursor-pointer"
              >
                Confirm & Save Voucher
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* NATIVE BOTTOM-SHEET / DESKTOP MODAL: NEW PURCHASE REQUEST (PR)            */}
      {/* ========================================================================= */}
      {isAddPrOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-t-3xl md:rounded-3xl shadow-2xl w-full max-w-lg p-6 animate-in slide-in-from-bottom-6 md:zoom-in-95 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3.5 mb-4">
              <h3 className="text-lg font-black text-slate-800">New Purchase Request (PR)</h3>
              <button onClick={() => setIsAddPrOpen(false)} className="bg-slate-100 p-1.5 rounded-full text-slate-500 hover:text-slate-800">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
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
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">PR No</label>
                  <input
                    type="text"
                    placeholder="PR-2026-081"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-700 outline-none"
                    value={prFormData.request_no}
                    onChange={e => setPrFormData({ ...prFormData, request_no: e.target.value })}
                  />
                </div>
              </div>

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
                  onClick={() => setIsAddPrOpen(false)}
                  className="px-4 py-2.5 font-bold text-slate-500 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePrOrder}
                  className="px-5 py-2.5 bg-[#6D2158] hover:bg-[#5a1b49] text-white rounded-xl font-bold uppercase tracking-wider shadow-md"
                >
                  Save PR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}