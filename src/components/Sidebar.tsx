"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, Users, ClipboardList, 
  Printer, Settings, LogOut, Warehouse, 
  Clock, ShoppingCart // 👈 Import ShoppingCart Icon
} from "lucide-react";

const MENU_ITEMS = [
  { name: "Dashboard", icon: LayoutDashboard, path: "/" },
  { name: "Guest List", icon: Users, path: "/guests" },
  { name: "Request Log", icon: ClipboardList, path: "/requests" },
  { name: "Order Tracking", icon: ShoppingCart, path: "/orders" }, // 👈 ADD THIS LINE
  { name: "Overtime", icon: Clock, path: "/overtime" },
  { name: "Print Hub", icon: Printer, path: "/print" },
  { name: "Inventory", icon: Warehouse, path: "/inventory/store" },
  { name: "Settings", icon: Settings, path: "/settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-slate-100 flex flex-col z-50 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      
      {/* BRAND */}
      <div className="h-20 flex items-center px-8 border-b border-slate-50">
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
  );
}