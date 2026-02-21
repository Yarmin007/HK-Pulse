"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, Users, ClipboardList, 
  Printer, Settings, LogOut, Warehouse, 
  Clock, ShoppingCart, ListChecks, Droplets,
  Calendar, Menu, X, Wine, Box, Zap, UtensilsCrossed, ChevronDown, ChevronRight
} from "lucide-react";

const MENU_ITEMS = [
  { name: "Dashboard", icon: LayoutDashboard, path: "/" },
  { name: "Guest List", icon: Users, path: "/guests" },
  { name: "Allocation", icon: ListChecks, path: "/allocation" },
  { name: "Water Production", icon: Droplets, path: "/water" },
  { name: "Request Log", icon: ClipboardList, path: "/requests" },
  { name: "Order Tracking", icon: ShoppingCart, path: "/orders" },
  { name: "Overtime", icon: Clock, path: "/overtime" },
  { name: "Print Hub", icon: Printer, path: "/print" },
  { name: "Inventory", icon: Warehouse, path: "/inventory/store" },
  { name: "Settings", icon: Settings, path: "/settings" },
];

const MINIBAR_ITEMS = [
  { name: "Expiry Control", icon: Calendar, path: "/minibar/expiry" },
  { name: "Minibar Inventory", icon: Box, path: "/minibar/inventory" },
  { name: "Minibar Sales", icon: Zap, path: "/minibar/sales" },
  { name: "Minibar Consumption", icon: UtensilsCrossed, path: "/minibar/consumption" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  
  // Auto-open dropdown if we are currently on a minibar page
  const isMinibarRoute = pathname.includes('/minibar');
  const [isMinibarOpen, setIsMinibarOpen] = useState(isMinibarRoute);

  useEffect(() => {
      if (isMinibarRoute) setIsMinibarOpen(true);
  }, [pathname, isMinibarRoute]);

  return (
    <>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md md:hidden text-[#6D2158]"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`
        fixed top-0 left-0 h-screen w-64 bg-white border-r border-slate-100 flex flex-col z-50 shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-transform duration-300 ease-in-out
        ${isOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0
      `}>
        
        <div className="h-20 flex items-center px-8 border-b border-slate-50 mt-12 md:mt-0">
          <h1 className="text-2xl font-bold text-[#6D2158] tracking-tight">
            HK<span className="text-slate-300">Pulse</span>
          </h1>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto no-scrollbar">
          {MENU_ITEMS.map((item) => {
            const isActive = pathname === item.path || pathname.startsWith(`${item.path}/`);
            return (
              <Link 
                key={item.path} 
                href={item.path}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                  isActive 
                    ? "bg-[#6D2158] text-white shadow-lg shadow-[#6D2158]/20" 
                    : "text-slate-400 hover:bg-slate-50 hover:text-[#6D2158]"
                }`}
              >
                <item.icon size={20} className={isActive ? "text-white" : "group-hover:text-[#6D2158] transition-colors"} strokeWidth={2} />
                <span className="text-sm font-bold tracking-wide">{item.name}</span>
              </Link>
            );
          })}

          {/* --- MINIBAR DROPDOWN --- */}
          <div className="pt-2">
            <button 
              onClick={() => setIsMinibarOpen(!isMinibarOpen)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group ${
                isMinibarRoute && !isMinibarOpen
                  ? "bg-rose-50 text-rose-600 border border-rose-100" 
                  : "text-slate-400 hover:bg-slate-50 hover:text-[#6D2158]"
              }`}
            >
              <div className="flex items-center gap-3">
                <Wine size={20} className={isMinibarRoute ? "text-rose-600" : "group-hover:text-[#6D2158] transition-colors"} strokeWidth={2} />
                <span className="text-sm font-bold tracking-wide">Minibar</span>
              </div>
              {isMinibarOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>

            {/* Dropdown Items */}
            {isMinibarOpen && (
              <div className="mt-1 ml-4 pl-4 border-l-2 border-slate-100 space-y-1 animate-in slide-in-from-top-2 duration-200">
                {MINIBAR_ITEMS.map((item) => {
                  const isActive = pathname === item.path;
                  return (
                    <Link 
                      key={item.path} 
                      href={item.path}
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 group ${
                        isActive 
                          ? "bg-rose-50 text-rose-600 font-black" 
                          : "text-slate-400 hover:text-rose-600 hover:bg-slate-50"
                      }`}
                    >
                      <item.icon size={16} className={isActive ? "text-rose-600" : "group-hover:text-rose-600 transition-colors"} strokeWidth={isActive ? 2.5 : 2} />
                      <span className="text-xs tracking-wide">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        <div className="p-4 border-t border-slate-50">
          <button className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all">
            <LogOut size={20} strokeWidth={2} />
            <span className="text-sm font-bold">Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}