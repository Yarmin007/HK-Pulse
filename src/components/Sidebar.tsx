"use client";
import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, Users, ClipboardList, 
  Printer, Settings, LogOut, Warehouse, 
  Clock, ShoppingCart, ListChecks, Droplets,
  Calendar, Menu, X // 👈 Added Menu & X icons
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
  { name: "Expiry Control", icon: Calendar, path: "/expiry" },
  { name: "Settings", icon: Settings, path: "/settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false); // Mobile state

  return (
    <>
      {/* MOBILE HAMBURGER BUTTON (Visible only on small screens) */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md md:hidden text-[#6D2158]"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* OVERLAY (Closes sidebar when clicking outside on mobile) */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* SIDEBAR CONTAINER */}
      <aside className={`
        fixed top-0 left-0 h-screen w-64 bg-white border-r border-slate-100 flex flex-col z-50 shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-transform duration-300 ease-in-out
        ${isOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0
      `}>
        
        {/* BRAND */}
        <div className="h-20 flex items-center px-8 border-b border-slate-50 mt-12 md:mt-0">
          <h1 className="text-2xl font-bold text-[#6D2158] tracking-tight">
            HK<span className="text-slate-300">Pulse</span>
          </h1>
        </div>

        {/* NAVIGATION */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {MENU_ITEMS.map((item) => {
            const isActive = pathname === item.path || pathname.startsWith(`${item.path}/`);
            return (
              <Link 
                key={item.path} 
                href={item.path}
                onClick={() => setIsOpen(false)} // Close on click (mobile)
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
        </nav>

        {/* FOOTER */}
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