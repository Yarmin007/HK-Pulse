"use client";

import React from "react";
import { AlertTriangle, PackageCheck, Wine, Plus } from "lucide-react";

interface StockItem {
  id: string;
  villa_no: string;
  item_id: string;
  item_name: string;
  category: string;
  current_qty: number;
  par_qty: number;
}

interface CupboardShelfViewProps {
  villaNo: string;
  stock: StockItem[];
  onConsume: (item: StockItem) => void;
  onExpiry: (item: StockItem) => void;
  onRefill?: (item: StockItem) => void;
  isLoading?: boolean;
}

// Bottle color themes by product category
const getItemAppearance = (name: string, category: string) => {
  const n = name.toLowerCase();
  const c = category.toLowerCase();

  if (n.includes("red") || (c.includes("wine") && !n.includes("white"))) {
    return {
      liquid: "from-red-950 via-red-800 to-rose-950",
      foil: "bg-red-800",
      type: "wine",
      labelColor: "bg-amber-50 text-red-950",
    };
  }
  if (n.includes("white") || n.includes("sauvignon") || n.includes("chardonnay")) {
    return {
      liquid: "from-amber-200 via-amber-300 to-yellow-500",
      foil: "bg-amber-600",
      type: "wine",
      labelColor: "bg-amber-50 text-amber-900",
    };
  }
  if (n.includes("champagne") || n.includes("prosecco") || n.includes("sparkling")) {
    return {
      liquid: "from-amber-400 via-yellow-300 to-emerald-950",
      foil: "bg-amber-300",
      type: "champagne",
      labelColor: "bg-slate-900 text-amber-300",
    };
  }
  if (c.includes("beer") || n.includes("beer") || n.includes("lager") || n.includes("cider")) {
    return {
      liquid: "from-amber-500 via-amber-400 to-amber-700",
      foil: "bg-amber-500",
      type: "beer",
      labelColor: "bg-white text-slate-900",
    };
  }
  if (c.includes("soft") || n.includes("coke") || n.includes("sprite") || n.includes("soda")) {
    return {
      liquid: n.includes("coke") ? "from-red-600 to-red-800" : "from-emerald-500 to-emerald-700",
      foil: "bg-slate-300",
      type: "can",
      labelColor: "bg-white text-slate-900",
    };
  }
  // Spirits / Liquor default
  return {
    liquid: "from-amber-600 via-amber-700 to-amber-950",
    foil: "bg-slate-800",
    type: "spirit",
    labelColor: "bg-amber-100 text-slate-900",
  };
};

export default function CupboardShelfView({
  villaNo,
  stock,
  onConsume,
  onExpiry,
  onRefill,
  isLoading,
}: CupboardShelfViewProps) {
  // Group items onto 3 realistic shelves:
  // Shelf 1: Wines & Champagnes
  // Shelf 2: Beers & Spirits
  // Shelf 3: Soft Drinks & Snacks / Water
  const shelves = React.useMemo(() => {
    const s1: StockItem[] = [];
    const s2: StockItem[] = [];
    const s3: StockItem[] = [];

    stock.forEach((item) => {
      const c = item.category.toLowerCase();
      const n = item.item_name.toLowerCase();

      if (c.includes("wine") || n.includes("wine") || n.includes("champagne")) {
        s1.push(item);
      } else if (c.includes("beer") || c.includes("spirit") || c.includes("liquor") || n.includes("beer")) {
        s2.push(item);
      } else {
        s3.push(item);
      }
    });

    // If a shelf is empty, balance them evenly
    if (s1.length === 0 && s2.length === 0 && s3.length === 0) {
      return [stock.slice(0, 4), stock.slice(4, 8), stock.slice(8)];
    }

    return [
      s1.length > 0 ? s1 : stock.slice(0, 3),
      s2.length > 0 ? s2 : stock.slice(3, 7),
      s3.length > 0 ? s3 : stock.slice(7),
    ];
  }, [stock]);

  return (
    <div className="w-full select-none">
      {/* 3D WOODEN CUPBOARD CABINET */}
      <div className="relative w-full rounded-3xl overflow-hidden p-3 sm:p-6 bg-gradient-to-b from-[#2D1B14] via-[#1F120D] to-[#120A07] border-4 border-[#3D261C] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.7)]">
        
        {/* Cupboard Roof Depth Shadow */}
        <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-black/80 to-transparent pointer-events-none z-10" />

        {/* Cupboard Inner Side Shading for 3D Perspective */}
        <div className="absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-black/60 to-transparent pointer-events-none z-10" />
        <div className="absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-black/60 to-transparent pointer-events-none z-10" />

        {/* Villa Header Badge Inside Cabinet */}
        <div className="flex items-center justify-between pb-3 border-b border-amber-950/50 mb-4 px-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-200/80">
              Villa {villaNo} • Visual Stock Cabinet
            </span>
          </div>
          <span className="text-[10px] font-bold text-amber-400/60 uppercase tracking-wider">
            Tap bottle to adjust
          </span>
        </div>

        {/* 3 SHELVES CONTAINER */}
        <div className="space-y-8">
          {shelves.map((shelfItems, shelfIndex) => (
            <div key={`shelf-${shelfIndex}`} className="relative pt-2">
              
              {/* BOTTLES ROW */}
              <div className="flex items-end justify-around gap-2 px-2 pb-2 min-h-[140px] sm:min-h-[160px] overflow-x-auto no-scrollbar">
                {shelfItems.length === 0 ? (
                  <div className="text-[11px] font-bold text-amber-900/40 italic py-8">
                    Shelf {shelfIndex + 1} Empty
                  </div>
                ) : (
                  shelfItems.map((item) => {
                    const isPresent = item.current_qty > 0;
                    const style = getItemAppearance(item.item_name, item.category);

                    return (
                      <div
                        key={item.id}
                        className="group relative flex flex-col items-center justify-end cursor-pointer transition-transform hover:-translate-y-1.5 active:scale-95 shrink-0"
                      >
                        {/* FLOATING ACTION POPOVER (Hover on Desktop / Visible on Tap) */}
                        <div className="absolute -top-16 opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto pointer-events-none transition-all duration-150 z-30 bg-slate-900/95 text-white backdrop-blur-md rounded-xl p-1.5 shadow-xl border border-white/10 flex items-center gap-1">
                          {isPresent ? (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onConsume(item);
                                }}
                                className="px-2 py-1 bg-[#6D2158] hover:bg-[#5a1b49] rounded-lg text-[10px] font-black uppercase tracking-wider whitespace-nowrap active:scale-95"
                              >
                                Consumed (-1)
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onExpiry(item);
                                }}
                                className="p-1 bg-rose-600 hover:bg-rose-700 rounded-lg text-white active:scale-95"
                                title="Mark Expired"
                              >
                                <AlertTriangle size={12} />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRefill && onRefill(item);
                              }}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-wider whitespace-nowrap flex items-center gap-1 active:scale-95"
                            >
                              <PackageCheck size={11} /> Refill (+1)
                            </button>
                          )}
                        </div>

                        {/* --- REALISTIC 2.5D BOTTLE / CAN CONTAINER --- */}
                        <div
                          className={`relative flex flex-col items-center transition-all ${
                            isPresent ? "opacity-100" : "opacity-25 grayscale"
                          }`}
                        >
                          {/* Bottle Cap / Foil */}
                          <div
                            className={`w-3.5 h-3 rounded-t-sm shadow-inner ${style.foil}`}
                          />

                          {/* Bottle Neck */}
                          <div
                            className={`w-2.5 h-6 bg-gradient-to-r ${style.liquid} shadow-inner`}
                          />

                          {/* Bottle Shoulder */}
                          <div
                            className={`w-8 h-3 rounded-t-xl bg-gradient-to-r ${style.liquid}`}
                          />

                          {/* Bottle Main Body & Glass Specular Highlights */}
                          <div
                            className={`w-8 sm:w-9 h-14 sm:h-16 rounded-b-md bg-gradient-to-r ${style.liquid} relative shadow-[inset_-3px_0_4px_rgba(0,0,0,0.5),inset_3px_0_4px_rgba(255,255,255,0.25)] flex items-center justify-center`}
                          >
                            {/* Glass Vertical Specular Reflection */}
                            <div className="absolute left-1 inset-y-1 w-1 bg-white/25 rounded-full blur-[0.5px]" />

                            {/* Bottle Label */}
                            <div
                              className={`w-6 sm:w-7 h-7 sm:h-8 rounded-sm ${style.labelColor} shadow-md flex flex-col items-center justify-center p-0.5 text-center overflow-hidden`}
                            >
                              <Wine size={9} className="opacity-70" />
                              <span className="text-[7px] font-black uppercase tracking-tight leading-none truncate w-full mt-0.5">
                                {item.item_name.split(" ")[0]}
                              </span>
                            </div>
                          </div>

                          {/* Base Oval Shadow On Glass Shelf */}
                          <div className="w-9 h-1.5 bg-black/60 rounded-full blur-[1px] -mt-0.5" />
                        </div>

                        {/* Quantity Pill Below Bottle */}
                        <div className="mt-1 text-center">
                          <span
                            className={`text-[9px] font-mono font-black px-1.5 py-0.2 rounded-full border ${
                              isPresent
                                ? "bg-amber-100/90 text-amber-950 border-amber-200"
                                : "bg-rose-950/90 text-rose-300 border-rose-800"
                            }`}
                          >
                            {item.current_qty}/{item.par_qty}
                          </span>
                          <span className="block text-[8px] font-bold text-amber-200/70 truncate max-w-[65px] mt-0.5">
                            {item.item_name}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* --- 2.5D WOOD & GLASS SHELF PLANK --- */}
              <div className="relative w-full">
                {/* Glass Layer with Top Edge Light Reflection */}
                <div className="h-2 w-full bg-cyan-200/20 backdrop-blur-xs border-t border-cyan-100/40 rounded-t-sm shadow-[0_2px_4px_rgba(0,0,0,0.4)]" />

                {/* Wooden Shelf Front Bevel */}
                <div className="h-3.5 w-full bg-gradient-to-b from-[#4A2F23] via-[#3D251B] to-[#25150E] border-t border-[#654333] shadow-[0_8px_12px_rgba(0,0,0,0.8)] rounded-b-sm" />

                {/* Shelf Underside Drop Shadow */}
                <div className="h-4 w-full bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}