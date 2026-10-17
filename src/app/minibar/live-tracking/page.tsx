"use client";

import React, { useState } from "react";
import { 
  RotateCcw, 
  ShoppingCart, 
  Minus, 
  Plus, 
  CheckCircle2, 
  ChevronUp 
} from "lucide-react";

export interface MinibarItem {
  id: string;
  name: string;
  category: "Plush" | "Dry Snack" | "Spirit" | "Soft Drink" | "Beer" | "Wine";
  par: number;
  price: number;
  shelf: "shelf1" | "shelf2" | "shelf3" | "shelf4";
  x: number;
  y: number;
  width: number;
  height: number;
}

const MINIBAR_ITEMS: MinibarItem[] = [
  // --- SHELF 1: PLUSHIES & AMENITIES ---
  { id: "whale_plush", name: "Whale / Dolphin Plush", category: "Plush", par: 1, price: 35, shelf: "shelf1", x: 15.0, y: 11.0, width: 30.0, height: 7.0 },
  { id: "turtle_plush", name: "Sea Turtle Plush", category: "Plush", par: 1, price: 30, shelf: "shelf1", x: 47.0, y: 11.0, width: 17.0, height: 7.0 },

  // --- SHELF 2: DRY SNACKS & SPIRITS ---
  { id: "chips_red", name: "John John Crisps (Red)", category: "Dry Snack", par: 1, price: 8, shelf: "shelf2", x: 12.2, y: 27.0, width: 11.5, height: 11.5 },
  { id: "chips_yellow", name: "John John Crisps (Yellow)", category: "Dry Snack", par: 1, price: 8, shelf: "shelf2", x: 24.2, y: 27.0, width: 11.5, height: 11.5 },
  { id: "chips_blue", name: "John John Crisps (Blue)", category: "Dry Snack", par: 1, price: 8, shelf: "shelf2", x: 36.2, y: 27.0, width: 11.5, height: 11.5 },
  { id: "nuts_tins", name: "Assorted Nut Tins & Jars", category: "Dry Snack", par: 3, price: 12, shelf: "shelf2", x: 17.5, y: 31.0, width: 22.5, height: 8.5 },
  { id: "red_wine", name: "Red Wine (Stoneburn)", category: "Wine", par: 1, price: 65, shelf: "shelf2", x: 47.0, y: 20.0, width: 7.5, height: 19.5 },
  { id: "whisky", name: "Liqueur / Whisky", category: "Spirit", par: 1, price: 85, shelf: "shelf2", x: 54.5, y: 19.0, width: 7.5, height: 20.5 },
  { id: "bacardi_rum", name: "Bacardi White Rum", category: "Spirit", par: 1, price: 75, shelf: "shelf2", x: 62.5, y: 21.0, width: 7.0, height: 18.5 },
  { id: "absolut_vodka", name: "Absolut Vodka", category: "Spirit", par: 1, price: 75, shelf: "shelf2", x: 69.5, y: 23.5, width: 7.5, height: 16.0 },
  { id: "gordons_gin", name: "Gordon's London Dry Gin", category: "Spirit", par: 1, price: 75, shelf: "shelf2", x: 77.0, y: 22.8, width: 10.0, height: 16.5 },

  // --- SHELF 3: FRIDGE TOP (SOFT DRINKS & JUICES) ---
  { id: "coca_cola", name: "Coca-Cola", category: "Soft Drink", par: 2, price: 6, shelf: "shelf3", x: 23.5, y: 58.2, width: 9.5, height: 12.8 },
  { id: "coca_cola_diet", name: "Diet Coke / Zero", category: "Soft Drink", par: 2, price: 6, shelf: "shelf3", x: 33.0, y: 58.2, width: 10.0, height: 12.8 },
  { id: "cool_ring_juice", name: "Fresh Juice (Cool Ring)", category: "Soft Drink", par: 2, price: 8, shelf: "shelf3", x: 43.8, y: 57.2, width: 8.8, height: 13.8 },
  { id: "chilled_tea_1", name: "Fruit Juice / Tea (Left)", category: "Soft Drink", par: 2, price: 8, shelf: "shelf3", x: 52.5, y: 56.5, width: 6.5, height: 14.5 },
  { id: "chilled_tea_2", name: "Fruit Juice / Tea (Center)", category: "Soft Drink", par: 2, price: 8, shelf: "shelf3", x: 59.0, y: 56.5, width: 6.5, height: 14.5 },
  { id: "chilled_tea_3", name: "Fruit Juice / Tea (Right)", category: "Soft Drink", par: 2, price: 8, shelf: "shelf3", x: 65.5, y: 56.5, width: 6.5, height: 14.5 },

  // --- SHELF 4: FRIDGE BOTTOM (BEERS, WINE & CHAMPAGNE) ---
  { id: "fever_tree_blue", name: "Fever-Tree Tonic", category: "Soft Drink", par: 1, price: 7, shelf: "shelf4", x: 16.5, y: 79.5, width: 5.5, height: 13.0 },
  { id: "fever_tree_green", name: "Fever-Tree Ginger Ale", category: "Soft Drink", par: 1, price: 7, shelf: "shelf4", x: 22.0, y: 79.5, width: 5.5, height: 13.0 },
  { id: "fever_tree_yellow", name: "Fever-Tree Soda Water", category: "Soft Drink", par: 1, price: 7, shelf: "shelf4", x: 27.5, y: 79.5, width: 5.5, height: 13.0 },
  { id: "white_wine", name: "White Wine (Stoneburn)", category: "Wine", par: 1, price: 65, shelf: "shelf4", x: 34.5, y: 73.0, width: 7.5, height: 19.5 },
  { id: "taittinger_champagne", name: "Taittinger Champagne", category: "Wine", par: 1, price: 140, shelf: "shelf4", x: 43.5, y: 72.0, width: 7.5, height: 20.5 },
  { id: "heineken", name: "Heineken Beer", category: "Beer", par: 2, price: 9, shelf: "shelf4", x: 52.5, y: 73.5, width: 8.5, height: 19.0 },
  { id: "tiger_beer", name: "Tiger Beer", category: "Beer", par: 2, price: 9, shelf: "shelf4", x: 61.0, y: 73.5, width: 8.5, height: 19.0 },
  { id: "corona_extra", name: "Corona Extra Beer", category: "Beer", par: 2, price: 10, shelf: "shelf4", x: 69.5, y: 73.5, width: 8.5, height: 19.0 },
];

export default function MinibarLiveTrackingPage() {
  const [villaNumber] = useState(24);
  const [stock, setStock] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    MINIBAR_ITEMS.forEach((item) => {
      initial[item.id] = item.par;
    });
    return initial;
  });

  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [activeZoom, setActiveZoom] = useState<"all" | "shelf1" | "shelf2" | "shelf3" | "shelf4">("all");
  const [selectedItem, setSelectedItem] = useState<MinibarItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleItemTap = (item: MinibarItem) => {
    if (excludedIds.includes(item.id)) {
      setSelectedItem(item);
      return;
    }

    setStock((prev) => {
      const current = prev[item.id] ?? item.par;
      const next = current > 0 ? current - 1 : item.par;
      return { ...prev, [item.id]: next };
    });
    setSelectedItem(item);
  };

  const adjustStock = (itemId: string, delta: number, maxPar: number) => {
    setStock((prev) => {
      const current = prev[itemId] ?? maxPar;
      const next = Math.max(0, Math.min(maxPar, current + delta));
      return { ...prev, [itemId]: next };
    });
  };

  const toggleExcludeItem = (itemId: string) => {
    setExcludedIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const resetAllToPar = () => {
    const full: Record<string, number> = {};
    MINIBAR_ITEMS.forEach((item) => {
      full[item.id] = item.par;
    });
    setStock(full);
    setExcludedIds([]);
    setSelectedItem(null);
  };

  const consumedList = MINIBAR_ITEMS.filter((item) => {
    if (excludedIds.includes(item.id)) return false;
    const current = stock[item.id] ?? item.par;
    return current < item.par;
  }).map((item) => {
    const current = stock[item.id] ?? item.par;
    const missing = item.par - current;
    return {
      ...item,
      missing,
      subtotal: missing * item.price,
    };
  });

  const totalBill = consumedList.reduce((acc, curr) => acc + curr.subtotal, 0);
  const totalMissingCount = consumedList.reduce((acc, curr) => acc + curr.missing, 0);

  const getZoomStyle = () => {
    switch (activeZoom) {
      case "shelf1":
        return { transform: "scale(2.2) translateY(28%)", transformOrigin: "top center" };
      case "shelf2":
        return { transform: "scale(2.0) translateY(12%)", transformOrigin: "top center" };
      case "shelf3":
        return { transform: "scale(2.1) translateY(-14%)", transformOrigin: "center center" };
      case "shelf4":
        return { transform: "scale(2.0) translateY(-24%)", transformOrigin: "bottom center" };
      default:
        return { transform: "scale(1.0)", transformOrigin: "center center" };
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-3 md:p-6 select-none pb-32">
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center">
        
        {/* TOP CONTROL BAR */}
        <div className="w-full bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase text-[#6D2158] tracking-wider">
                Villa {villaNumber} Minibar
              </span>
              <span className="text-[10px] font-black bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">
                {totalMissingCount} To Refill
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">
              Tap any bottle to report consumption or restock
            </p>
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveZoom("all")}
              className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all ${
                activeZoom === "all" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Full View
            </button>
            <button
              onClick={() => setActiveZoom("shelf1")}
              className={`px-2 py-1 text-[10px] font-black rounded-lg transition-all ${
                activeZoom === "shelf1" ? "bg-white text-[#6D2158] shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Plush
            </button>
            <button
              onClick={() => setActiveZoom("shelf2")}
              className={`px-2 py-1 text-[10px] font-black rounded-lg transition-all ${
                activeZoom === "shelf2" ? "bg-white text-[#6D2158] shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Snacks & Spirits
            </button>
            <button
              onClick={() => setActiveZoom("shelf3")}
              className={`px-2 py-1 text-[10px] font-black rounded-lg transition-all ${
                activeZoom === "shelf3" ? "bg-white text-sky-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Fridge Top
            </button>
            <button
              onClick={() => setActiveZoom("shelf4")}
              className={`px-2 py-1 text-[10px] font-black rounded-lg transition-all ${
                activeZoom === "shelf4" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Fridge Bottom
            </button>
          </div>

          <button
            onClick={resetAllToPar}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl transition-all"
          >
            <RotateCcw size={13} />
            <span>Reset Par</span>
          </button>
        </div>

        {/* INTERACTIVE CABINET STAGE */}
        <div className="relative w-full max-w-[500px] aspect-[1200/1800] rounded-3xl overflow-hidden shadow-2xl border-4 border-amber-950/20 bg-stone-900 transition-all duration-300">
          <div
            className="relative w-full h-full transition-transform duration-500 ease-out will-change-transform"
            style={getZoomStyle()}
          >
            <img
              src="/minibar/minibar_cabinet.png"
              alt="Minibar Cabinet"
              className="w-full h-full object-cover pointer-events-none select-none"
            />

            <svg
              className="absolute inset-0 w-full h-full z-10"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {MINIBAR_ITEMS.map((item) => {
                const currentStock = stock[item.id] ?? item.par;
                const isExcluded = excludedIds.includes(item.id);
                const isMissing = !isExcluded && currentStock < item.par;
                const isCompletelyEmpty = !isExcluded && currentStock === 0;

                return (
                  <g key={item.id} className="cursor-pointer">
                    <rect
                      x={item.x}
                      y={item.y}
                      width={item.width}
                      height={item.height}
                      rx="1.2"
                      onClick={() => handleItemTap(item)}
                      fill={
                        isExcluded
                          ? "rgba(15, 23, 42, 0.75)"
                          : isCompletelyEmpty
                          ? "rgba(225, 29, 72, 0.65)"
                          : isMissing
                          ? "rgba(217, 119, 6, 0.50)"
                          : "transparent"
                      }
                      stroke={
                        isExcluded
                          ? "rgba(100, 116, 139, 0.8)"
                          : isCompletelyEmpty
                          ? "rgba(244, 63, 94, 0.95)"
                          : isMissing
                          ? "rgba(245, 158, 11, 0.9)"
                          : "rgba(255, 255, 255, 0.0)"
                      }
                      strokeWidth="0.5"
                      strokeDasharray={isMissing || isExcluded ? "1.5 1" : undefined}
                      className="transition-colors duration-200"
                    />

                    {isExcluded ? (
                      <text
                        x={item.x + item.width / 2}
                        y={item.y + item.height / 2 + 0.8}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="2.4"
                        fontWeight="900"
                        className="pointer-events-none select-none drop-shadow"
                      >
                        N/A
                      </text>
                    ) : isCompletelyEmpty ? (
                      <text
                        x={item.x + item.width / 2}
                        y={item.y + item.height / 2 + 0.8}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="2.4"
                        fontWeight="900"
                        className="pointer-events-none select-none drop-shadow"
                      >
                        MISSING
                      </text>
                    ) : isMissing ? (
                      <text
                        x={item.x + item.width / 2}
                        y={item.y + item.height / 2 + 0.8}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="2.4"
                        fontWeight="900"
                        className="pointer-events-none select-none drop-shadow"
                      >
                        -{item.par - currentStock}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* SELECTED ITEM CONTROLLER */}
        {selectedItem && (
          <div className="w-full max-w-[500px] bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xl mt-3 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 truncate">
                <span className="text-xs font-black text-slate-800 truncate">{selectedItem.name}</span>
                <span className="text-[10px] font-bold text-slate-400 font-mono">${selectedItem.price}</span>
              </div>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                Standard Par: <strong className="text-slate-700">{selectedItem.par}</strong> | 
                In Room: <strong className="text-[#6D2158]">{stock[selectedItem.id] ?? selectedItem.par}</strong>
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => adjustStock(selectedItem.id, -1, selectedItem.par)}
                disabled={(stock[selectedItem.id] ?? selectedItem.par) <= 0}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center disabled:opacity-40 transition-all"
              >
                <Minus size={13} />
              </button>
              <span className="w-4 text-center font-black text-xs text-slate-800">
                {stock[selectedItem.id] ?? selectedItem.par}
              </span>
              <button
                onClick={() => adjustStock(selectedItem.id, 1, selectedItem.par)}
                disabled={(stock[selectedItem.id] ?? selectedItem.par) >= selectedItem.par}
                className="w-7 h-7 rounded-lg bg-[#6D2158] hover:bg-[#521742] text-white font-black flex items-center justify-center disabled:opacity-40 transition-all"
              >
                <Plus size={13} />
              </button>
            </div>

            <button
              onClick={() => toggleExcludeItem(selectedItem.id)}
              className={`px-2 py-1 rounded-lg text-[10px] font-black border transition-all ${
                excludedIds.includes(selectedItem.id)
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              {excludedIds.includes(selectedItem.id) ? "Excluded" : "Exclude"}
            </button>
          </div>
        )}

        {/* BOTTOM PERSISTENT REFILL & BILLING DRAWER */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-2xl p-3 md:px-6">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <div
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              className="flex items-center gap-3 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-2xl bg-[#6D2158]/10 text-[#6D2158] flex items-center justify-center font-black">
                <ShoppingCart size={18} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-slate-800">
                    {totalMissingCount} {totalMissingCount === 1 ? "Item" : "Items"} To Refill
                  </span>
                  <ChevronUp
                    size={14}
                    className={`text-slate-400 transition-transform ${isDrawerOpen ? "rotate-180" : ""}`}
                  />
                </div>
                <p className="text-[10px] font-bold text-slate-500">
                  Total Charge: <span className="font-black text-[#6D2158]">${totalBill.toFixed(2)}</span>
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                if (consumedList.length === 0) return alert("Minibar is at 100% full par!");
                alert(`Recorded ${totalMissingCount} refilled items for Villa ${villaNumber}. Total: $${totalBill}`);
              }}
              className="bg-[#6D2158] hover:bg-[#521742] text-white px-5 py-2.5 rounded-2xl text-xs font-black shadow-md flex items-center gap-2 transition-all active:scale-95"
            >
              <CheckCircle2 size={16} />
              <span>Confirm Refill & Bill</span>
            </button>
          </div>

          {/* Expanded Drawer Checklist */}
          {isDrawerOpen && (
            <div className="max-w-4xl mx-auto mt-3 pt-3 border-t border-slate-100 max-h-52 overflow-y-auto space-y-2">
              {consumedList.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold text-center py-2">
                  All items are in stock. No billing or replenishment needed.
                </p>
              ) : (
                consumedList.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50 border border-slate-100 font-bold text-slate-700"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-rose-600 font-black">x{item.missing}</span>
                      <span>{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400 text-[10px] font-mono">${item.price} ea</span>
                      <span className="font-black text-slate-800 font-mono">${item.subtotal}</span>
                      <button
                        onClick={() => adjustStock(item.id, item.missing, item.par)}
                        className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-lg hover:bg-emerald-200"
                      >
                        Restocked
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}