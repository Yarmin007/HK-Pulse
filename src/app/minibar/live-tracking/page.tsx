"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Wine,
  PackageCheck,
  AlertTriangle,
  RotateCcw,
  Clock,
  Search,
  History,
  Loader2,
  Sparkles,
  Snowflake,
  Coffee,
} from "lucide-react";
import { Toaster, toast } from "react-hot-toast";
import { supabase } from "@/lib/supabase";

interface StockItem {
  id: string;
  villa_no: string;
  item_id: string;
  item_name: string;
  category: string;
  current_qty: number;
  par_qty: number;
}

interface MinibarTransaction {
  id: string;
  villa_no: string;
  item_id: string;
  item_name?: string;
  quantity: number;
  reason: "Consumption" | "Expiry";
  status: "PENDING" | "DISPATCHED" | "REFILLED";
  removed_by: string;
  removed_at: string;
  dispatched_by?: string;
  dispatched_at?: string;
  refilled_by?: string;
  refilled_at?: string;
  notes?: string;
}

interface DualSlotProps {
  item: StockItem;
  imageSrc: string;
  label: string;
  heightClass?: string;
  onConsume: (item: StockItem, reason: "Consumption") => void;
  onExpiry: (item: StockItem, reason: "Expiry") => void;
  onRefill: (tx: any) => void;
  transactions: MinibarTransaction[];
}

function findItem(stock: StockItem[], query: string, fallbackPar = 1): StockItem {
  const found = (stock || []).find((s) =>
    s?.item_name?.toLowerCase().includes(query.toLowerCase())
  );
  return (
    found || {
      id: `mock-${query}`,
      villa_no: "",
      item_id: `mock-item-${query}`,
      item_name: query,
      category: "General",
      current_qty: fallbackPar,
      par_qty: fallbackPar,
    }
  );
}

function ActionPopover({ item, onConsume, onExpiry, onRefill, transactions }: any) {
  const isPresent = item.current_qty > 0;
  return (
    <div className="absolute -top-14 opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto pointer-events-none transition-all duration-150 z-30 bg-slate-900/95 text-white backdrop-blur-md rounded-xl p-1.5 shadow-xl border border-white/10 flex items-center gap-1">
      {isPresent ? (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onConsume(item, "Consumption");
            }}
            className="px-2 py-1 bg-[#6D2158] hover:bg-[#5a1b49] rounded-lg text-[9px] font-black uppercase tracking-wider whitespace-nowrap active:scale-95"
          >
            Consumed (-1)
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExpiry(item, "Expiry");
            }}
            className="p-1 bg-rose-600 hover:bg-rose-700 rounded-lg text-white active:scale-95"
            title="Mark Expired"
          >
            <AlertTriangle size={11} />
          </button>
        </>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const pendingTx = (transactions || []).find(
              (t: any) => t.item_id === item.item_id && t.status === "DISPATCHED"
            );
            if (pendingTx) onRefill(pendingTx);
            else toast.error("Awaiting coordinator dispatch first!");
          }}
          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-[9px] font-black uppercase tracking-wider whitespace-nowrap flex items-center gap-1 active:scale-95"
        >
          <PackageCheck size={11} /> Refill (+1)
        </button>
      )}
    </div>
  );
}

// REAL TEXTURE COMPONENT: Grounded at bottom (no floating)
function RealTextureSlot({
  item,
  imageSrc,
  label,
  heightClass = "h-24", // Benchmark tall size (72px)
  onConsume,
  onExpiry,
  onRefill,
  transactions,
}: DualSlotProps) {
  const isDualPar = (item.par_qty || 1) >= 2;
  const count = item.current_qty || 0;
  const backIsPresent = isDualPar ? count >= 2 : false;
  const frontIsPresent = count >= 1;

  return (
    <div className="group relative flex flex-col items-center justify-end cursor-pointer transition-transform hover:-translate-y-1 active:scale-95 shrink-0 px-0.5">
      <ActionPopover
        item={item}
        onConsume={onConsume}
        onExpiry={onExpiry}
        onRefill={onRefill}
        transactions={transactions}
      />

      {/* Anchor container with unified baseline height */}
      <div className="relative flex items-end justify-center w-11 sm:w-12 h-24">
        {/* Rear stacked item */}
        {isDualPar && (
          <div
            className={`absolute bottom-1 -right-1 transition-all origin-bottom scale-[0.84] z-0 ${
              backIsPresent
                ? "opacity-95 filter brightness-[0.75] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
                : "opacity-20 grayscale brightness-[0.3]"
            }`}
          >
            <img
              src={imageSrc}
              alt={`${label} Back`}
              className={`${heightClass} w-auto object-contain pointer-events-none select-none`}
              loading="eager"
            />
            <div className="w-5 h-1 bg-black/80 rounded-full blur-[0.6px] -mt-1 mx-auto" />
          </div>
        )}

        {/* Front item */}
        <div
          className={`relative z-10 flex flex-col items-center justify-end transition-all ${
            frontIsPresent
              ? "opacity-100 filter drop-shadow-[0_6px_12px_rgba(0,0,0,0.5)]"
              : "opacity-25 grayscale"
          }`}
        >
          <img
            src={imageSrc}
            alt={`${label} Front`}
            className={`${heightClass} w-auto object-contain pointer-events-none select-none`}
            loading="eager"
          />
          {/* Ground contact shadow sitting directly on shelf */}
          <div className="w-6 h-1 bg-black/90 rounded-full blur-[0.6px] -mt-0.5" />
          <div className="w-8 h-2 bg-black/40 rounded-full blur-[1.5px] -mt-1" />
        </div>
      </div>

      <div className="mt-0.5 text-center">
        <span
          className={`text-[8px] font-mono font-black px-1.5 py-0.2 rounded-full border ${
            count > 0
              ? "bg-amber-100/90 text-amber-950 border-amber-200"
              : "bg-rose-950/90 text-rose-300 border-rose-800"
          }`}
        >
          {item.current_qty}/{item.par_qty}
        </span>
        <span className="block text-[7.5px] font-bold text-amber-200/90 truncate max-w-[46px] mt-0.5 leading-tight">
          {label}
        </span>
      </div>
    </div>
  );
}

// BOTTLE SHAPE COMPONENT: Grounded baseline
function BottleSlot({
  item,
  onConsume,
  onExpiry,
  onRefill,
  transactions,
  shape,
  liquidColor,
  capColor,
  label,
  labelBg,
}: any) {
  const isDualPar = (item.par_qty || 1) >= 2;
  const count = item.current_qty || 0;
  const backIsPresent = isDualPar ? count >= 2 : false;
  const frontIsPresent = count >= 1;
  const isFlask = shape === "flask";

  const renderBottleGraphic = (isBack = false) => (
    <div
      className={`relative flex flex-col items-center justify-end transition-all ${
        (isBack ? backIsPresent : frontIsPresent)
          ? isBack
            ? "opacity-95 filter brightness-[0.75]"
            : "opacity-100 filter drop-shadow-[0_6px_10px_rgba(0,0,0,0.5)]"
          : "opacity-20 grayscale"
      }`}
    >
      <div className={`w-2.5 h-2 rounded-t-xs shadow-inner ${capColor}`} />
      <div className={`w-2 h-4 bg-gradient-to-r ${liquidColor} shadow-inner`} />
      <div className={`${isFlask ? "w-8 h-2 rounded-t-sm" : "w-7 h-2.5 rounded-t-lg"} bg-gradient-to-r ${liquidColor}`} />
      <div
        className={`${
          isFlask ? "w-8 h-12" : "w-7 h-12"
        } rounded-b-sm bg-gradient-to-r ${liquidColor} relative shadow-[inset_-2px_0_3px_rgba(0,0,0,0.5),inset_2px_0_3px_rgba(255,255,255,0.25)] flex items-center justify-center`}
      >
        <div className="absolute left-0.5 inset-y-1 w-0.5 bg-white/25 rounded-full" />
        <div className={`w-5 h-6 rounded-xs ${labelBg} shadow-xs flex items-center justify-center p-0.5 text-center overflow-hidden`}>
          <span className="text-[6.5px] font-black uppercase tracking-tight leading-none truncate w-full">
            {label}
          </span>
        </div>
      </div>
      <div className="w-6 h-1 bg-black/85 rounded-full blur-[0.6px] -mt-0.5" />
    </div>
  );

  return (
    <div className="group relative flex flex-col items-center justify-end cursor-pointer transition-transform hover:-translate-y-1 active:scale-95 shrink-0 px-0.5">
      <ActionPopover
        item={item}
        onConsume={onConsume}
        onExpiry={onExpiry}
        onRefill={onRefill}
        transactions={transactions}
      />

      <div className="relative flex items-end justify-center w-11 sm:w-12 h-24">
        {isDualPar && (
          <div className="absolute bottom-1 -right-1 origin-bottom scale-[0.84] z-0">
            {renderBottleGraphic(true)}
          </div>
        )}
        <div className="relative z-10">
          {renderBottleGraphic(false)}
        </div>
      </div>

      <div className="mt-0.5 text-center">
        <span
          className={`text-[8px] font-mono font-black px-1.5 py-0.2 rounded-full border ${
            count > 0 ? "bg-amber-100/90 text-amber-950 border-amber-200" : "bg-rose-950/90 text-rose-300 border-rose-800"
          }`}
        >
          {item.current_qty}/{item.par_qty}
        </span>
        <span className="block text-[7.5px] font-bold text-amber-200/90 truncate max-w-[46px] mt-0.5 leading-tight">
          {label}
        </span>
      </div>
    </div>
  );
}

// CASHEW NUT JAR: Grounded baseline
function JarSlot({ item, onConsume, onExpiry, onRefill, transactions, lidColor, contentsColor, label }: any) {
  const isPresent = item.current_qty > 0;
  return (
    <div className="group relative flex flex-col items-center justify-end cursor-pointer transition-transform hover:-translate-y-1 active:scale-95 shrink-0 px-0.5">
      <ActionPopover
        item={item}
        onConsume={onConsume}
        onExpiry={onExpiry}
        onRefill={onRefill}
        transactions={transactions}
      />

      <div className="relative flex items-end justify-center w-10 h-24">
        <div className={`relative flex flex-col items-center transition-all ${isPresent ? "opacity-100 filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]" : "opacity-25 grayscale"}`}>
          <div className={`w-5 h-1.5 ${lidColor} rounded-t-xs shadow-xs border-b border-black/20`} />
          <div className="w-5 h-6 bg-white/20 backdrop-blur-xs border border-white/40 rounded-b-xs relative flex items-center justify-center overflow-hidden shadow-inner">
            <div className={`w-3.5 h-3.5 ${contentsColor} rounded-xs opacity-90`} />
            <span className="absolute text-[5.5px] font-black uppercase tracking-tight text-white/95">
              {label}
            </span>
          </div>
          <div className="w-5 h-1 bg-black/85 rounded-full blur-[0.6px] -mt-0.5" />
        </div>
      </div>

      <div className="mt-0.5 text-center">
        <span className="text-[8px] font-mono font-black px-1.5 py-0.2 rounded-full border bg-amber-100 text-amber-950 border-amber-200">
          {item.current_qty}/{item.par_qty}
        </span>
        <span className="block text-[7.5px] font-bold text-amber-200/90 truncate max-w-[46px] mt-0.5 leading-tight">
          {label}
        </span>
      </div>
    </div>
  );
}

// CRISPS POUCH: Grounded baseline
function PouchSlot({ item, onConsume, onExpiry, onRefill, transactions, label }: any) {
  const isDualPar = (item.par_qty || 1) >= 2;
  const count = item.current_qty || 0;
  const backIsPresent = isDualPar ? count >= 2 : false;
  const frontIsPresent = count >= 1;

  const renderPouchGraphic = (isBack = false) => (
    <div
      className={`relative flex flex-col items-center justify-end transition-all ${
        (isBack ? backIsPresent : frontIsPresent)
          ? isBack
            ? "opacity-95 filter brightness-[0.75]"
            : "opacity-100 filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]"
          : "opacity-20 grayscale"
      }`}
    >
      <div className="w-7 h-11 bg-gradient-to-br from-white via-slate-100 to-sky-100 rounded-t-md rounded-b-xs border border-slate-300 shadow-xs flex flex-col items-center justify-center p-0.5">
        <span className="text-[6px] font-black uppercase text-slate-800 leading-tight text-center">
          J&J
        </span>
        <span className="text-[5.5px] text-sky-700 font-bold uppercase mt-0.5">
          Crisps
        </span>
      </div>
      <div className="w-6 h-1 bg-black/80 rounded-full blur-[0.6px] -mt-0.5" />
    </div>
  );

  return (
    <div className="group relative flex flex-col items-center justify-end cursor-pointer transition-transform hover:-translate-y-1 active:scale-95 shrink-0 px-0.5">
      <ActionPopover
        item={item}
        onConsume={onConsume}
        onExpiry={onExpiry}
        onRefill={onRefill}
        transactions={transactions}
      />

      <div className="relative flex items-end justify-center w-11 h-24">
        {isDualPar && (
          <div className="absolute bottom-1 -right-1 origin-bottom scale-[0.84] z-0">
            {renderPouchGraphic(true)}
          </div>
        )}
        <div className="relative z-10">
          {renderPouchGraphic(false)}
        </div>
      </div>

      <div className="mt-0.5 text-center">
        <span className="text-[8px] font-mono font-black px-1.5 py-0.2 rounded-full border bg-amber-100 text-amber-950 border-amber-200">
          {item.current_qty}/{item.par_qty}
        </span>
        <span className="block text-[7.5px] font-bold text-amber-200/90 truncate max-w-[46px] mt-0.5 leading-tight">
          {label}
        </span>
      </div>
    </div>
  );
}

function LiveMinibarPage() {
  const [allocatedVillas, setAllocatedVillas] = useState<string[]>([]);
  const [selectedVilla, setSelectedVilla] = useState<string>("");
  const [stock, setStock] = useState<StockItem[]>([]);
  const [transactions, setTransactions] = useState<MinibarTransaction[]>([]);
  const [currentUser, setCurrentUser] = useState<string>("Attendant");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>("");

  useEffect(() => {
    const sessionStr = localStorage.getItem("hk_pulse_session");
    if (sessionStr) {
      try {
        const parsed = JSON.parse(sessionStr);
        setCurrentUser(parsed.name || "Attendant");
        const adminCheck = parsed.system_role === "admin";
        setIsAdmin(adminCheck);

        const myVillas: string[] =
          parsed.allocated_villas && parsed.allocated_villas.length > 0
            ? parsed.allocated_villas
            : ["201", "202", "203", "204", "205", "206"];

        setAllocatedVillas(myVillas);
        if (myVillas.length > 0) setSelectedVilla(myVillas[0]);
      } catch (e) {
        setAllocatedVillas(["201", "202"]);
        setSelectedVilla("201");
      }
    } else {
      const adminAuth = localStorage.getItem("hk_pulse_admin_auth");
      if (adminAuth === "true") {
        setIsAdmin(true);
        setAllocatedVillas(["201", "202", "203", "204", "205"]);
        setSelectedVilla("201");
      }
    }
    setIsLoading(false);
  }, []);

  const fetchVillaData = useCallback(async (villaNo: string) => {
    if (!villaNo) return;
    setIsLoading(true);

    try {
      const { data: stockData, error: stockErr } = await supabase
        .from("hsk_minibar_villa_stock")
        .select(`
          id, villa_no, item_id, current_qty, par_qty,
          hsk_minibar_items (name, category)
        `)
        .eq("villa_no", villaNo);

      if (stockErr) throw stockErr;

      const { data: txData, error: txErr } = await supabase
        .from("hsk_minibar_transactions")
        .select(`
          id, villa_no, item_id, quantity, reason, status,
          removed_by, removed_at, dispatched_by, dispatched_at,
          refilled_by, refilled_at, notes,
          hsk_minibar_items (name)
        `)
        .eq("villa_no", villaNo)
        .order("removed_at", { ascending: false })
        .limit(20);

      if (txErr) throw txErr;

      setStock(
        (stockData || []).map((s: any) => ({
          id: s.id,
          villa_no: s.villa_no,
          item_id: s.item_id,
          item_name: s.hsk_minibar_items?.name || "Item",
          category: s.hsk_minibar_items?.category || "Beverage",
          current_qty: s.current_qty,
          par_qty: s.par_qty,
        }))
      );

      setTransactions(
        (txData || []).map((t: any) => ({
          ...t,
          item_name: t.hsk_minibar_items?.name || "Item",
        }))
      );
    } catch (err: any) {
      toast.error("Failed to load villa data: " + err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedVilla) {
      fetchVillaData(selectedVilla);
    }
  }, [selectedVilla, fetchVillaData]);

  const filteredStock = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return stock;
    return (stock || []).filter(
      (item) =>
        item.item_name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [stock, searchTerm]);

  const pendingOrDispatchedTx = useMemo(() => {
    return (transactions || []).filter(
      (t) => t.status === "PENDING" || t.status === "DISPATCHED"
    );
  }, [transactions]);

  const handleReconcileVilla = async () => {
    if (!confirm(`Reconcile Villa ${selectedVilla}? Resets all items to full par count.`)) {
      return;
    }

    setIsActionLoading(true);
    try {
      const updates = (stock || []).map((s) => ({
        id: s.id,
        villa_no: s.villa_no,
        item_id: s.item_id,
        current_qty: s.par_qty,
        last_reconciled_at: new Date().toISOString(),
        last_reconciled_by: currentUser,
      }));

      const { error } = await supabase
        .from("hsk_minibar_villa_stock")
        .upsert(updates, { onConflict: "villa_no,item_id" });

      if (error) throw error;

      toast.success(`Villa ${selectedVilla} reconciled to full par!`);
      fetchVillaData(selectedVilla);
    } catch (err: any) {
      toast.error("Reconciliation failed: " + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRemoveItem = async (item: StockItem, reason: "Consumption" | "Expiry") => {
    if (item.current_qty <= 0) {
      toast.error(`${item.item_name} is already at 0 count in Villa ${selectedVilla}!`);
      return;
    }

    setIsActionLoading(true);
    try {
      const { error: txErr } = await supabase
        .from("hsk_minibar_transactions")
        .insert({
          villa_no: item.villa_no,
          item_id: item.item_id,
          quantity: 1,
          reason,
          status: "PENDING",
          removed_by: currentUser,
          removed_at: new Date().toISOString(),
        });

      if (txErr) throw txErr;

      const { error: stockErr } = await supabase
        .from("hsk_minibar_villa_stock")
        .update({ current_qty: item.current_qty - 1 })
        .eq("id", item.id);

      if (stockErr) throw stockErr;

      toast.success(`Logged 1x ${item.item_name} (${reason}). Removed from Villa immediately.`);
      fetchVillaData(selectedVilla);
    } catch (err: any) {
      toast.error("Failed to log removal: " + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleConfirmRefill = async (tx: MinibarTransaction) => {
    setIsActionLoading(true);
    try {
      const { error: txErr } = await supabase
        .from("hsk_minibar_transactions")
        .update({
          status: "REFILLED",
          refilled_by: currentUser,
          refilled_at: new Date().toISOString(),
        })
        .eq("id", tx.id);

      if (txErr) throw txErr;

      const currentStockItem = (stock || []).find((s) => s.item_id === tx.item_id);
      if (currentStockItem) {
        const newQty = Math.min(
          currentStockItem.par_qty,
          currentStockItem.current_qty + tx.quantity
        );
        const { error: stockErr } = await supabase
          .from("hsk_minibar_villa_stock")
          .update({ current_qty: newQty })
          .eq("id", currentStockItem.id);

        if (stockErr) throw stockErr;
      }

      toast.success(`Refill confirmed! Stock updated for Villa ${tx.villa_no}.`);
      fetchVillaData(selectedVilla);
    } catch (err: any) {
      toast.error("Failed to confirm refill: " + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleQuickDispatch = async (tx: MinibarTransaction) => {
    setIsActionLoading(true);
    try {
      const { error } = await supabase
        .from("hsk_minibar_transactions")
        .update({
          status: "DISPATCHED",
          dispatched_by: currentUser,
          dispatched_at: new Date().toISOString(),
        })
        .eq("id", tx.id);

      if (error) throw error;

      toast.success(`Dispatched ${tx.item_name}! Ready for attendant refill.`);
      fetchVillaData(selectedVilla);
    } catch (err: any) {
      toast.error("Dispatch failed: " + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="p-3 sm:p-5 w-full max-w-5xl mx-auto space-y-4 pb-20 text-slate-800">
      <Toaster position="top-right" />

      {/* TOP HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200/80 pb-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#6D2158] flex items-center gap-2">
            <Wine className="w-6 h-6 text-[#6D2158]" /> Live Minibar Management
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
            Active Host: <span className="text-slate-700">{currentUser}</span>
            {isAdmin && " • Admin Override"}
          </p>
        </div>

        <button
          onClick={handleReconcileVilla}
          disabled={isActionLoading || stock.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-2xs active:scale-95 disabled:opacity-50"
        >
          <RotateCcw size={13} />
          <span>Reconcile Par</span>
        </button>
      </div>

      {/* VILLA SELECTOR */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
          <span>Assigned Villas</span>
          <span>{allocatedVillas.length} Allocated</span>
        </div>

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {allocatedVillas.map((villa) => {
            const isSelected = selectedVilla === villa;
            return (
              <button
                key={villa}
                onClick={() => setSelectedVilla(villa)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider shrink-0 transition-all border ${
                  isSelected
                    ? "bg-[#6D2158] text-white border-[#6D2158] shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Villa {villa}
              </button>
            );
          })}
        </div>
      </div>

      {/* PENDING TRAY */}
      {pendingOrDispatchedTx.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between text-amber-900 font-black text-xs uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Pending Refills (Villa {selectedVilla})</span>
            </span>
            <span className="text-[10px] bg-amber-200/60 px-2 py-0.5 rounded-full font-bold">
              {pendingOrDispatchedTx.length}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {pendingOrDispatchedTx.map((tx) => (
              <div
                key={tx.id}
                className="bg-white border border-amber-100 rounded-lg p-2.5 flex items-center justify-between shadow-2xs"
              >
                <div>
                  <div className="font-black text-xs text-slate-800">
                    {tx.quantity}x {tx.item_name}
                  </div>
                  <div className="text-[9px] text-amber-700 font-black uppercase tracking-wider">
                    Status: {tx.status}
                  </div>
                </div>

                <div>
                  {tx.status === "PENDING" && isAdmin && (
                    <button
                      onClick={() => handleQuickDispatch(tx)}
                      disabled={isActionLoading}
                      className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-black text-[10px] rounded uppercase"
                    >
                      Dispatch
                    </button>
                  )}

                  {tx.status === "DISPATCHED" ? (
                    <button
                      onClick={() => handleConfirmRefill(tx)}
                      disabled={isActionLoading}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] rounded uppercase flex items-center gap-1 shadow-2xs"
                    >
                      <PackageCheck className="w-3 h-3" /> Refill
                    </button>
                  ) : tx.status === "PENDING" && !isAdmin ? (
                    <span className="text-[9px] bg-slate-100 text-slate-400 font-bold px-1.5 py-0.5 rounded">
                      Pending
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==============================================================
          THE ALL-IN-ONE COMPACT VILLA CUPBOARD UNIT (NARROWED & GROUNDED)
          ============================================================== */}
      <div className="relative w-full max-w-4xl mx-auto rounded-2xl overflow-hidden p-3 sm:p-5 bg-gradient-to-br from-[#734326] via-[#4d2d18] to-[#2a160b] border-[4px] border-[#381e0f] shadow-xl select-none flex flex-col space-y-3.5">
        
        {/* Slanted ceiling ambient shadows */}
        <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-black/70 via-black/25 to-transparent pointer-events-none" />
        <div className="absolute top-0 left-0 w-28 h-full bg-gradient-to-r from-black/40 to-transparent pointer-events-none" />

        {/* 1. TOP DRY BAR SHELF */}
        <div className="relative z-10 w-full">
          <div className="flex items-center justify-between pb-1 border-b border-amber-950/70 mb-2 px-1">
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-300" />
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-200/90">
                Upper Dry Bar • Spirits & Snacks
              </span>
            </div>
            <span className="text-[9px] font-bold text-amber-400/60 uppercase">
              Tap item to log
            </span>
          </div>

          {/* Centered, grounded cluster sitting flush on shelf line */}
          <div className="flex items-end justify-center -space-x-1 sm:space-x-0.5 px-1 pb-0 overflow-x-auto no-scrollbar">
            
            <BottleSlot
              item={findItem(stock, "Gordon", 1)}
              onConsume={handleRemoveItem}
              onExpiry={handleRemoveItem}
              onRefill={handleConfirmRefill}
              transactions={transactions}
              shape="flask"
              liquidColor="from-slate-200 via-white to-slate-300"
              capColor="bg-amber-400"
              label="Gordon's"
              labelBg="bg-amber-100 text-amber-950"
            />

            <BottleSlot
              item={findItem(stock, "Absolut", 1)}
              onConsume={handleRemoveItem}
              onExpiry={handleRemoveItem}
              onRefill={handleConfirmRefill}
              transactions={transactions}
              shape="cylinder"
              liquidColor="from-slate-100 via-white to-blue-50"
              capColor="bg-slate-300"
              label="Absolut"
              labelBg="bg-white text-blue-900"
            />

            <BottleSlot
              item={findItem(stock, "Bacardi", 1)}
              onConsume={handleRemoveItem}
              onExpiry={handleRemoveItem}
              onRefill={handleConfirmRefill}
              transactions={transactions}
              shape="tall"
              liquidColor="from-slate-100 via-white to-emerald-50"
              capColor="bg-red-700"
              label="Bacardi"
              labelBg="bg-white text-red-900"
            />

            {/* Glenmorangie (Benchmark tall height: h-24) */}
            <RealTextureSlot
              item={findItem(stock, "Glen", 1)}
              imageSrc="/images/minibar/glen.png"
              label="Glenmor."
              heightClass="h-24"
              onConsume={handleRemoveItem}
              onExpiry={handleRemoveItem}
              onRefill={handleConfirmRefill}
              transactions={transactions}
            />

            <BottleSlot
              item={findItem(stock, "Stoneburn Red", 1)}
              onConsume={handleRemoveItem}
              onExpiry={handleRemoveItem}
              onRefill={handleConfirmRefill}
              transactions={transactions}
              shape="wine"
              liquidColor="from-red-950 via-red-900 to-black"
              capColor="bg-slate-900"
              label="Stoneburn"
              labelBg="bg-slate-100 text-slate-900"
            />

            {/* Green Peas (Jar height: h-14) */}
            <RealTextureSlot
              item={findItem(stock, "Peas", 1)}
              imageSrc="/images/minibar/green-peas.png"
              label="Green Peas"
              heightClass="h-14"
              onConsume={handleRemoveItem}
              onExpiry={handleRemoveItem}
              onRefill={handleConfirmRefill}
              transactions={transactions}
            />

            {/* Cookies (Tin height: h-16) */}
            <RealTextureSlot
              item={findItem(stock, "Cookie", 1)}
              imageSrc="/images/minibar/cookies.png"
              label="Cookies"
              heightClass="h-16"
              onConsume={handleRemoveItem}
              onExpiry={handleRemoveItem}
              onRefill={handleConfirmRefill}
              transactions={transactions}
            />

            <JarSlot
              item={findItem(stock, "Nut", 1)}
              onConsume={handleRemoveItem}
              onExpiry={handleRemoveItem}
              onRefill={handleConfirmRefill}
              transactions={transactions}
              lidColor="bg-amber-200"
              contentsColor="bg-amber-700"
              label="Cashews"
            />

            <PouchSlot
              item={findItem(stock, "John", 2)}
              onConsume={handleRemoveItem}
              onExpiry={handleRemoveItem}
              onRefill={handleConfirmRefill}
              transactions={transactions}
              label="Crisps"
            />
          </div>

          {/* Floating glass shelf plank */}
          <div className="relative w-full -mt-0.5">
            <div className="h-1.5 w-full bg-cyan-100/25 backdrop-blur-md border-t border-cyan-100/70 shadow-[0_2px_6px_rgba(0,0,0,0.5)]" />
            <div className="h-3 w-full bg-gradient-to-b from-[#8b5533] via-[#613a21] to-[#361f11] border-t border-amber-300/40 shadow-[0_8px_14px_rgba(0,0,0,0.8)] rounded-b-xs" />
          </div>
        </div>

        {/* 2. MIDDLE COMPACT COUNTERTOP DIVIDER */}
        <div className="relative z-10 w-full py-1.5 bg-[#2c160b]/90 border-y border-[#3f2111] px-3 rounded-lg flex items-center justify-between text-amber-200/70 text-xs shadow-inner">
          <div className="flex items-center gap-1.5">
            <Coffee size={13} className="text-amber-400" />
            <span className="font-bold uppercase tracking-wider text-[9px]">
              Nespresso & Prep Countertop
            </span>
          </div>
          <span className="text-[9px] uppercase font-bold text-amber-400/50">
            Refrigerator Below ↓
          </span>
        </div>

        {/* 3. LOWER BUILT-IN COMPACT REFRIGERATOR */}
        <div className="relative z-10 w-full rounded-xl overflow-hidden p-2.5 sm:p-4 bg-gradient-to-b from-slate-100 via-slate-50 to-slate-200 border-3 border-slate-300/90 shadow-[inset_0_3px_15px_rgba(0,0,0,0.2)]">
          <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-amber-100/50 via-white/30 to-transparent pointer-events-none" />

          {/* UPPER WIRE RACK */}
          <div className="relative z-10 w-full mb-3">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 flex items-center gap-1 px-1">
              <Snowflake size={11} className="text-sky-500" /> Upper Chilled Rack (Cans & Juices)
            </div>

            <div className="flex items-end justify-center -space-x-1 sm:space-x-0.5 px-1 pb-0 overflow-x-auto no-scrollbar">
              {/* Can height: h-16 */}
              <RealTextureSlot
                item={findItem(stock, "Coca-Cola", 2)}
                imageSrc="/images/minibar/coca-cola.png"
                label="Coca-Cola"
                heightClass="h-16"
                onConsume={handleRemoveItem}
                onExpiry={handleRemoveItem}
                onRefill={handleConfirmRefill}
                transactions={transactions}
              />

              <RealTextureSlot
                item={findItem(stock, "Diet Coke", 2)}
                imageSrc="/images/minibar/diet-coke.png"
                label="Diet Coke"
                heightClass="h-16"
                onConsume={handleRemoveItem}
                onExpiry={handleRemoveItem}
                onRefill={handleConfirmRefill}
                transactions={transactions}
              />

              <BottleSlot
                item={findItem(stock, "Tea", 1)}
                onConsume={handleRemoveItem}
                onExpiry={handleRemoveItem}
                onRefill={handleConfirmRefill}
                transactions={transactions}
                shape="cylinder"
                liquidColor="from-amber-100 via-orange-100 to-amber-200"
                capColor="bg-amber-500"
                label="Ceylon Tea"
                labelBg="bg-white text-slate-800"
              />

              {/* Juice bottle height: h-20 */}
              <RealTextureSlot
                item={findItem(stock, "Orange", 2)}
                imageSrc="/images/minibar/orange-juice.png"
                label="Alain Orange"
                heightClass="h-20"
                onConsume={handleRemoveItem}
                onExpiry={handleRemoveItem}
                onRefill={handleConfirmRefill}
                transactions={transactions}
              />

              <RealTextureSlot
                item={findItem(stock, "Mango", 2)}
                imageSrc="/images/minibar/mango-juice.png"
                label="Alain Mango"
                heightClass="h-20"
                onConsume={handleRemoveItem}
                onExpiry={handleRemoveItem}
                onRefill={handleConfirmRefill}
                transactions={transactions}
              />
            </div>

            <div className="relative w-full h-2.5 border-y border-slate-300 bg-[repeating-linear-gradient(90deg,#94a3b8_0px,#94a3b8_2px,transparent_2px,transparent_12px)] shadow-xs" />
          </div>

          {/* LOWER DECK */}
          <div className="relative z-10 w-full">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 flex items-center gap-1 px-1">
              <Wine size={11} className="text-slate-600" /> Lower Deck (Wines & Beers)
            </div>

            <div className="flex items-end justify-center -space-x-1 sm:space-x-0.5 px-1 pb-0 overflow-x-auto no-scrollbar">
              <BottleSlot
                item={findItem(stock, "Stoneburn White", 1)}
                onConsume={handleRemoveItem}
                onExpiry={handleRemoveItem}
                onRefill={handleConfirmRefill}
                transactions={transactions}
                shape="wine"
                liquidColor="from-amber-200 via-yellow-100 to-amber-300"
                capColor="bg-slate-900"
                label="Stoneburn W."
                labelBg="bg-slate-100 text-slate-900"
              />

              {/* Benchmark tall height: h-24 */}
              <RealTextureSlot
                item={findItem(stock, "Taittinger", 1)}
                imageSrc="/images/minibar/taittinger.png"
                label="Taittinger"
                heightClass="h-24"
                onConsume={handleRemoveItem}
                onExpiry={handleRemoveItem}
                onRefill={handleConfirmRefill}
                transactions={transactions}
              />

              <RealTextureSlot
                item={findItem(stock, "Heineken", 2)}
                imageSrc="/images/minibar/heineken.png"
                label="Heineken"
                heightClass="h-24"
                onConsume={handleRemoveItem}
                onExpiry={handleRemoveItem}
                onRefill={handleConfirmRefill}
                transactions={transactions}
              />

              <RealTextureSlot
                item={findItem(stock, "Tiger", 2)}
                imageSrc="/images/minibar/tiger-beer.png"
                label="Tiger"
                heightClass="h-24"
                onConsume={handleRemoveItem}
                onExpiry={handleRemoveItem}
                onRefill={handleConfirmRefill}
                transactions={transactions}
              />

              <RealTextureSlot
                item={findItem(stock, "Corona", 2)}
                imageSrc="/images/minibar/corona.png"
                label="Corona"
                heightClass="h-24"
                onConsume={handleRemoveItem}
                onExpiry={handleRemoveItem}
                onRefill={handleConfirmRefill}
                transactions={transactions}
              />
            </div>

            <div className="h-3 w-full bg-gradient-to-b from-slate-200 via-slate-300 to-slate-400 border-t border-slate-300/80 rounded-b-lg shadow-inner" />
          </div>
        </div>
      </div>

      {/* SEARCH WITHIN VILLA */}
      <div className="relative max-w-4xl mx-auto">
        <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
        <input
          type="text"
          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-[#6D2158] shadow-2xs placeholder:text-slate-400"
          placeholder={`Search items in Villa ${selectedVilla}...`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* DETAILED STOCK LIST & RECENT ACTIVITY GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 max-w-4xl mx-auto">
        {/* STOCK TABLE */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Wine size={13} className="text-[#6D2158]" /> Villa {selectedVilla} Inventory
            </h2>
            <span className="text-[9px] font-bold text-slate-400 uppercase">
              Quick removal
            </span>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="animate-spin text-[#6D2158]" size={20} />
            </div>
          ) : filteredStock.length === 0 ? (
            <div className="p-6 text-center text-slate-400 italic font-bold text-xs">
              No items registered.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {filteredStock.map((item) => {
                const isBelowPar = item.current_qty < item.par_qty;

                return (
                  <div
                    key={item.id}
                    className="p-2.5 px-3 flex items-center justify-between hover:bg-slate-50/70 transition-colors"
                  >
                    <div>
                      <h3 className="font-black text-xs text-slate-800">
                        {item.item_name}
                      </h3>
                      <span className="text-[9px] text-slate-400 font-bold uppercase">
                        {item.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="text-right">
                        <span
                          className={`font-mono font-black text-xs ${
                            isBelowPar ? "text-amber-600" : "text-emerald-700"
                          }`}
                        >
                          {item.current_qty} / {item.par_qty}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleRemoveItem(item, "Consumption")}
                          disabled={isActionLoading || item.current_qty <= 0}
                          className="px-2 py-1 bg-purple-50 text-[#6D2158] border border-purple-200 hover:bg-purple-100 rounded text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                        >
                          Consumed
                        </button>

                        <button
                          onClick={() => handleRemoveItem(item, "Expiry")}
                          disabled={isActionLoading || item.current_qty <= 0}
                          className="p-1 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded text-xs font-bold transition-all active:scale-95 disabled:opacity-40"
                          title="Remove Expired"
                        >
                          <AlertTriangle size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* AUDIT LOG TABLE */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <History size={13} className="text-[#6D2158]" /> Activity Audit
            </h3>
            <span className="text-[9px] font-bold text-slate-400 uppercase">Recent Moves</span>
          </div>

          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {transactions.length === 0 ? (
              <div className="p-6 text-center text-slate-400 italic font-bold text-xs">
                No recent activity for Villa {selectedVilla}.
              </div>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="p-2.5 px-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-black text-slate-800 text-[11px]">
                      {tx.quantity}x {tx.item_name} ({tx.reason})
                    </div>
                    <div className="text-[9px] text-slate-400 font-bold">
                      {tx.removed_by} • {new Date(tx.removed_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                        tx.status === "REFILLED"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : tx.status === "DISPATCHED"
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {tx.status}
                    </span>
                    {tx.refilled_by && (
                      <span className="block text-[8px] text-slate-400 font-semibold mt-0.5">
                        By {tx.refilled_by}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiveMinibarPage;