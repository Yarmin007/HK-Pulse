"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Users, ClipboardList, Printer, Settings, LogOut, Warehouse, 
  ShoppingCart, ListChecks, Droplets, Calendar, Wine, Box, Zap, 
  UtensilsCrossed, ChevronRight, Briefcase, Contact, UserCheck, Clock, 
  RefreshCw, Share2, ClipboardCheck, FileSpreadsheet, PhoneCall, CheckSquare,
  User as UserIcon, Map, Wind, Key, Waves, Plane, LayoutDashboard, CalendarDays
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Helper to render iOS style grouped links
const MenuLink = ({ item, isLast, iconColor, bgColor }: any) => (
    <Link href={item.path} className={`flex items-center gap-4 p-4 active:bg-slate-100 transition-colors ${!isLast ? 'border-b border-slate-100' : ''}`}>
        <div className={`w-8 h-8 rounded-xl ${bgColor} ${iconColor} flex items-center justify-center shadow-sm shrink-0`}>
            <item.icon size={16} strokeWidth={2.5}/>
        </div>
        <span className="text-[15px] font-bold text-slate-800">{item.name}</span>
        <ChevronRight size={18} className="ml-auto text-slate-300"/>
    </Link>
);

export default function MobileMenu() {
    const [userRole, setUserRole] = useState<'admin' | 'staff' | null>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isPoolAttendant, setIsPoolAttendant] = useState(false);
    const [isStepCleaner, setIsStepCleaner] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const fetchUser = async () => {
            const sessionData = localStorage.getItem('hk_pulse_session');
            if (sessionData) {
                try {
                    const parsed = JSON.parse(sessionData);
                    setUserRole(parsed.system_role || 'staff');
                    
                    const roleLower = String(parsed.role || '').toLowerCase();
                    if (roleLower.includes('pool')) {
                        setIsPoolAttendant(true);
                    }
                    if (roleLower.includes('step cleaner')) {
                        setIsStepCleaner(true);
                    }

                    const { data } = await supabase.from('hsk_hosts').select('full_name, role, image_url').eq('host_id', parsed.host_id).single();
                    if (data) setCurrentUser(data);
                } catch (e) {
                    setUserRole('staff');
                }
            } else {
                const adminAuth = localStorage.getItem('hk_pulse_admin_auth');
                if (adminAuth === 'true') setUserRole('admin');
            }
            setIsLoaded(true);
        };
        fetchUser();
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('hk_pulse_session');
        localStorage.removeItem('hk_pulse_admin_auth');
        window.location.href = '/'; 
    };

    if (!isLoaded) return <div className="min-h-screen bg-[#FDFBFD] flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#6D2158]/20 border-t-[#6D2158] rounded-full animate-spin"></div></div>;

    const isAdmin = userRole === 'admin';

    // Data mapped directly from your sidebar structure
    const ADMIN_CORE_TABS = [
        { name: "Dashboard", icon: LayoutDashboard, path: "/" },
        { name: "Task Hub", icon: CheckSquare, path: "/tasks" },
        { name: "Requests", icon: ClipboardList, path: "/requests" },
    ];

    const ALLOCATION_ITEMS = [
        { name: "Live Board", icon: LayoutDashboard, path: "/allocation/board" },
        { name: "Forecast", icon: Plane, path: "/forecast" },
        { name: "Guest List", icon: Users, path: "/guests" },
        { name: "Allocations", icon: ListChecks, path: "/allocation" },
        { name: "Special Villas", icon: Key, path: "/allocation/special" },
        { name: "Allocation Sheet", icon: Map, path: "/allocation/sheet" },
    ];
    
    const INVENTORY_ITEMS = [
        { name: "Live Matrix", icon: FileSpreadsheet, path: "/inventory/matrix" },
        { name: "Monthly Setup", icon: ClipboardCheck, path: "/inventory/setup" },
        { name: "Housekeeping Store", icon: Warehouse, path: "/inventory/store" },
    ];
    
    const TEAM_ITEMS = [
        { name: "HK Directory", icon: PhoneCall, path: "/team/contacts" }, 
        { name: "Org Chart", icon: Share2, path: "/org-chart" },
        { name: "Host Profiles", icon: Contact, path: "/hosts" },
        { name: "Attendance", icon: UserCheck, path: "/attendance" },
        { name: "Overtime", icon: Clock, path: "/overtime" },
        { name: "Leave Planner", icon: Plane, path: "/leave-planner" },
        { name: "Leave Requests", icon: CalendarDays, path: "/leave-requests" },
    ];
    
    const MINIBAR_ITEMS = [
        { name: "Live Inventory Matrix", icon: Box, path: "/minibar/inventory" },
        { name: "Expiry Control", icon: Calendar, path: "/minibar/expiry" },
        { name: "Expiry Removals", icon: RefreshCw, path: "/minibar/removals" },
        { name: "Minibar Sales", icon: Zap, path: "/minibar/sales" },
        { name: "Finance P&L", icon: UtensilsCrossed, path: "/minibar/finance" },
    ];
    
    const OPS_ITEMS = [
        { name: "Over-Water Ops", icon: Waves, path: "/ladders" },
        { name: "Water Production", icon: Droplets, path: "/water" },
        { name: "AC Tracker", icon: Wind, path: "/ac-tracker" },
        { name: "Order Tracking", icon: ShoppingCart, path: "/orders" },
        { name: "Print Hub", icon: Printer, path: "/print" },
    ];
    
    // Base Staff Menus
    const STAFF_PROFILE = [
        { name: "My Profile", icon: Contact, path: "/profile" },
        { name: "HK Directory", icon: PhoneCall, path: "/team/contacts" },
        { name: "Org Chart", icon: Share2, path: "/org-chart" },
    ];
    
    const STAFF_OPS = [
        { name: "Guest List", icon: Users, path: "/guests" },
        { name: "Forecast", icon: Plane, path: "/forecast" },
        { name: "My Schedule", icon: Calendar, path: "/schedule" },
        { name: "Leave Requests", icon: CalendarDays, path: "/leave-requests" },
        { name: "AC Tracker", icon: Wind, path: "/ac-tracker" },
    ];

    // Dynamic Staff Menus
    if (isStepCleaner) {
        STAFF_OPS.unshift({ name: "Over-Water Ops", icon: Waves, path: "/ladders" });
    }

    const STAFF_CORE_BASE = [
        { name: "Dashboard", icon: LayoutDashboard, path: "/" },
        { name: "My Tasks", icon: ClipboardList, path: "/my-tasks" }, 
    ];

    const STAFF_CORE = isPoolAttendant ? [
        STAFF_CORE_BASE[0],
        { name: "Water Prod.", icon: Droplets, path: "/water" },
        STAFF_CORE_BASE[1]
    ] : STAFF_CORE_BASE;

    return (
        <div className="min-h-screen bg-[#F2F2F7] pb-32 animate-in fade-in md:hidden font-sans">
            
            {/* Header / Profile Card */}
            <div className="bg-white px-4 pt-6 pb-6 border-b border-slate-200 shadow-sm mb-6">
                <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-4">Menu</h1>
                
                <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="w-14 h-14 rounded-full bg-slate-200 text-slate-500 overflow-hidden flex items-center justify-center shrink-0 border-2 border-white shadow-sm">
                        {currentUser?.image_url ? (
                            <img src={currentUser.image_url} className="w-full h-full object-cover"/>
                        ) : (
                            <UserIcon size={28}/>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-black text-slate-800 truncate">{currentUser?.full_name || (isAdmin ? "System Admin" : "Staff Member")}</h2>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest truncate">{currentUser?.role || (isAdmin ? "Full Access" : "Restricted Access")}</p>
                    </div>
                </div>
            </div>

            <div className="px-4 space-y-6">
                {isAdmin ? (
                    <>
                        {/* CORE */}
                        <div>
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2 mb-2">Core</h3>
                            <div className="bg-white rounded-[1.5rem] overflow-hidden shadow-sm border border-slate-200">
                                {ADMIN_CORE_TABS.map((item, idx) => (
                                    <MenuLink key={item.path} item={item} isLast={idx === ADMIN_CORE_TABS.length - 1} bgColor="bg-[#6D2158]/10" iconColor="text-[#6D2158]"/>
                                ))}
                            </div>
                        </div>

                        {/* ALLOCATION HUB */}
                        <div>
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2 mb-2">Allocation Hub</h3>
                            <div className="bg-white rounded-[1.5rem] overflow-hidden shadow-sm border border-slate-200">
                                {ALLOCATION_ITEMS.map((item, idx) => (
                                    <MenuLink key={item.path} item={item} isLast={idx === ALLOCATION_ITEMS.length - 1} bgColor="bg-[#6D2158]/10" iconColor="text-[#6D2158]"/>
                                ))}
                            </div>
                        </div>

                        {/* INVENTORY */}
                        <div>
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2 mb-2">Inventory Hub</h3>
                            <div className="bg-white rounded-[1.5rem] overflow-hidden shadow-sm border border-slate-200">
                                {INVENTORY_ITEMS.map((item, idx) => (
                                    <MenuLink key={item.path} item={item} isLast={idx === INVENTORY_ITEMS.length - 1} bgColor="bg-emerald-50" iconColor="text-emerald-700"/>
                                ))}
                            </div>
                        </div>

                        {/* TEAM */}
                        <div>
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2 mb-2">Team Hub</h3>
                            <div className="bg-white rounded-[1.5rem] overflow-hidden shadow-sm border border-slate-200">
                                {TEAM_ITEMS.map((item, idx) => (
                                    <MenuLink key={item.path} item={item} isLast={idx === TEAM_ITEMS.length - 1} bgColor="bg-blue-50" iconColor="text-blue-700"/>
                                ))}
                            </div>
                        </div>

                        {/* MINIBAR */}
                        <div>
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2 mb-2">Minibar</h3>
                            <div className="bg-white rounded-[1.5rem] overflow-hidden shadow-sm border border-slate-200">
                                {MINIBAR_ITEMS.map((item, idx) => (
                                    <MenuLink key={item.path} item={item} isLast={idx === MINIBAR_ITEMS.length - 1} bgColor="bg-rose-50" iconColor="text-rose-600"/>
                                ))}
                            </div>
                        </div>

                        {/* OPERATIONS */}
                        <div>
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2 mb-2">Operations</h3>
                            <div className="bg-white rounded-[1.5rem] overflow-hidden shadow-sm border border-slate-200">
                                {OPS_ITEMS.map((item, idx) => (
                                    <MenuLink key={item.path} item={item} isLast={idx === OPS_ITEMS.length - 1} bgColor="bg-slate-100" iconColor="text-[#6D2158]"/>
                                ))}
                            </div>
                        </div>

                        {/* ADMIN CORE SETTINGS */}
                        <div>
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2 mb-2">System</h3>
                            <div className="bg-white rounded-[1.5rem] overflow-hidden shadow-sm border border-slate-200">
                                <MenuLink item={{name: "Settings", icon: Settings, path: "/settings"}} isLast={true} bgColor="bg-slate-100" iconColor="text-[#6D2158]"/>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        {/* CORE */}
                        <div>
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2 mb-2">Core</h3>
                            <div className="bg-white rounded-[1.5rem] overflow-hidden shadow-sm border border-slate-200">
                                {STAFF_CORE.map((item, idx) => (
                                    <MenuLink key={item.path} item={item} isLast={idx === STAFF_CORE.length - 1} bgColor="bg-[#6D2158]/10" iconColor="text-[#6D2158]"/>
                                ))}
                            </div>
                        </div>

                        {/* STAFF PROFILE */}
                        <div>
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2 mb-2">Profile & Org</h3>
                            <div className="bg-white rounded-[1.5rem] overflow-hidden shadow-sm border border-slate-200">
                                {STAFF_PROFILE.map((item, idx) => (
                                    <MenuLink key={item.path} item={item} isLast={idx === STAFF_PROFILE.length - 1} bgColor="bg-amber-50" iconColor="text-amber-700"/>
                                ))}
                            </div>
                        </div>

                        {/* STAFF OPS */}
                        <div>
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2 mb-2">More Options</h3>
                            <div className="bg-white rounded-[1.5rem] overflow-hidden shadow-sm border border-slate-200">
                                {STAFF_OPS.map((item, idx) => (
                                    <MenuLink key={item.path} item={item} isLast={idx === STAFF_OPS.length - 1} bgColor="bg-[#6D2158]/10" iconColor="text-[#6D2158]"/>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {/* LOGOUT BUTTON */}
                <button onClick={handleLogout} className="w-full bg-white rounded-3xl p-4 flex items-center justify-center gap-2 text-rose-600 font-black text-[15px] shadow-sm border border-rose-100 active:bg-rose-50 transition-colors mt-8">
                    <LogOut size={20}/> Log Out
                </button>
            </div>
        </div>
    );
}