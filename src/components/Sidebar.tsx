import React from 'react';
import { 
  LayoutDashboard, ClipboardList, Package, 
  Users, FileText, Settings, LogOut, ShoppingBasket 
} from 'lucide-react';
import Link from 'next/link';

const menuItems = [
  { name: 'Dashboard', icon: LayoutDashboard, href: '/' },
  { name: 'Request Log', icon: ClipboardList, href: '/requests' },
  { name: 'Store Inventory', icon: ShoppingBasket, href: '/inventory/store' }, // Fixed Link
  { name: 'Minibar & Expiry', icon: Package, href: '/inventory/minibar' },
  { name: 'Hosts', icon: Users, href: '/hosts' }, // Fixed Link (was /staff)
  { name: 'Print Center', icon: FileText, href: '/reports' },
];

export default function Sidebar() {
  return (
    <div className="w-64 h-screen bg-[#6D2158] text-white flex flex-col fixed left-0 top-0 z-50 shadow-2xl font-antiqua">
      {/* Brand Header */}
      <div className="p-8 pb-6">
        <h1 className="text-3xl font-bold tracking-tight italic">HK PULSE</h1>
        <div className="flex items-center gap-2 mt-1 opacity-70">
          <div className="h-[1px] w-8 bg-white/50"></div>
          <p className="text-[9px] uppercase tracking-[0.3em] font-bold">Coordinator Hub</p>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-2 mt-2">
        {menuItems.map((item) => (
          <Link 
            key={item.name} 
            href={item.href}
            className="flex items-center gap-4 p-3.5 rounded-xl text-white/70 hover:bg-white/10 hover:text-white hover:shadow-lg transition-all duration-300 group"
          >
            <item.icon size={18} className="group-hover:scale-110 transition-transform opacity-70 group-hover:opacity-100" />
            <span className="text-sm font-bold tracking-wide">{item.name}</span>
          </Link>
        ))}
      </nav>

      {/* Footer Actions */}
      <div className="p-4 mx-4 mb-4 border-t border-white/10 space-y-1">
        <button className="flex items-center gap-3 p-3 w-full text-white/60 hover:text-white transition-colors rounded-lg hover:bg-white/5">
          <Settings size={16} />
          <span className="text-xs font-bold uppercase tracking-wider">Settings</span>
        </button>
        <button className="flex items-center gap-3 p-3 w-full text-rose-300 hover:bg-rose-500/20 hover:text-rose-100 rounded-lg transition-colors">
          <LogOut size={16} />
          <span className="text-xs font-bold uppercase tracking-wider">Logout</span>
        </button>
      </div>
    </div>
  );
}