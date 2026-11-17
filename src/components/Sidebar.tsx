"use client";
import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, Users, ClipboardList, 
  Printer, Settings, LogOut, Warehouse, 
  ShoppingCart, ListChecks, Droplets,
  Calendar, Menu, X, Wine, Box, Zap, UtensilsCrossed, ChevronDown, ChevronRight,
  Briefcase, Contact, UserCheck, Clock, RefreshCw, Share2, ClipboardCheck, FileSpreadsheet, PhoneCall, CheckSquare, Map, Key, Plane, Layers, ShieldCheck, Droplet, TrendingUp, Shirt,
  Eye, ArrowLeft, UserCog, Search, Bike, WashingMachine, Bug
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getDhakaDateStr } from "@/lib/dateUtils";
import { riderDutyOf, isOffShift } from "@/app/allocation/lib/riders";
import { canUsePestControl, isPestAccount } from "@/lib/pestControl";

type Tone = 'brand' | 'emerald' | 'purple' | 'sky' | 'rose' | 'blue' | 'amber';
const TONES: Record<Tone, { text: string; soft: string; chip: string; hover: string }> = {
  brand:   { text: 'text-[#6D2158]',  soft: 'bg-[#6D2158]/10 text-[#6D2158]', chip: 'bg-[#6D2158]/10 text-[#6D2158] border border-[#6D2158]/20', hover: 'hover:text-[#6D2158]' },
  emerald: { text: 'text-emerald-700', soft: 'bg-emerald-50 text-emerald-700', chip: 'bg-emerald-50 text-emerald-700 border border-emerald-100', hover: 'hover:text-emerald-700' },
  purple:  { text: 'text-purple-700',  soft: 'bg-purple-50 text-purple-700',   chip: 'bg-purple-50 text-purple-700 border border-purple-100',   hover: 'hover:text-purple-700' },
  sky:     { text: 'text-sky-700',     soft: 'bg-sky-50 text-sky-700',         chip: 'bg-sky-50 text-sky-700 border border-sky-100',            hover: 'hover:text-sky-700' },
  rose:    { text: 'text-rose-600',    soft: 'bg-rose-50 text-rose-600',       chip: 'bg-rose-50 text-rose-600 border border-rose-100',         hover: 'hover:text-rose-600' },
  blue:    { text: 'text-blue-700',    soft: 'bg-blue-50 text-blue-700',       chip: 'bg-blue-50 text-blue-700 border border-blue-100',         hover: 'hover:text-blue-700' },
  amber:   { text: 'text-amber-700',   soft: 'bg-amber-50 text-amber-700',     chip: 'bg-amber-50 text-amber-700 border border-amber-100',      hover: 'hover:text-amber-700' },
};

// --- ADMIN SPECIFIC MENUS ---
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
  { name: "Linen Setup", icon: ClipboardCheck, path: "/inventory/linen-setup" },
  { name: "Linen Inventory", icon: Layers, path: "/inventory/linen" },
  { name: "Bottle Setup", icon: ClipboardCheck, path: "/inventory/bottle-setup" },
  { name: "Bottle Inventory", icon: Droplet, path: "/inventory/bottle" },
  { name: "Spot Count", icon: CheckSquare, path: "/inventory/spot-count" },
];

const LAUNDRY_ITEMS = [
  { name: "Laundry Production", icon: WashingMachine, path: "/laundry/production" },
  { name: "Laundry Chemicals", icon: Droplets, path: "/laundry/chemicals" },
  { name: "Host Uniforms", icon: Shirt, path: "/laundry/uniforms" },
  { name: "Uniform Tracker", icon: Layers, path: "/laundry/tracker" },
];

const TEAM_ITEMS = [
  { name: "HK Directory", icon: PhoneCall, path: "/team/contacts" }, 
  { name: "Org Chart", icon: Share2, path: "/org-chart" },
  { name: "Host Profiles", icon: Contact, path: "/hosts" },
  { name: "Cycle Fleet", icon: Bike, path: "/team/cycles" },
  { name: "Attendance", icon: UserCheck, path: "/attendance" },
  { name: "Casual Attendance", icon: Users, path: "/attendance/casual" },
  { name: "Leave Clearance", icon: ShieldCheck, path: "/attendance/clearance" },
  { name: "Overtime", icon: Clock, path: "/overtime" },
];

const MINIBAR_ITEMS = [
  { name: "Live Tracking", icon: ClipboardList, path: "/minibar/live-tracking" },
  { name: "Live Inventory Matrix", icon: Box, path: "/minibar/inventory" },
  { name: "Expiry Control", icon: Calendar, path: "/minibar/expiry" },
  { name: "Expiry Removals", icon: RefreshCw, path: "/minibar/removals" },
  { name: "Minibar Sales", icon: Zap, path: "/minibar/sales" },
  { name: "Finance P&L", icon: UtensilsCrossed, path: "/minibar/finance" },
];

// --- OPERATIONS MENUS ---
const OPERATIONS_ITEMS = [
  { name: "Order Tracking", icon: ShoppingCart, path: "/orders", key: "orders" },
  { name: "Store Requests", icon: Warehouse, path: "/store-requests", key: "orders" },
  { name: "Cost Saving", icon: TrendingUp, path: "/cost-saving", key: "cost-saving" },
  { name: "Print Hub", icon: Printer, path: "/print", key: "print" },
  { name: "Settings", icon: Settings, path: "/settings", key: "settings" },
];

// --- BASE STAFF MENUS ---
const STAFF_CORE_BASE = [
  { name: "Dashboard", icon: LayoutDashboard, path: "/" },
  { name: "My Tasks", icon: ClipboardList, path: "/my-tasks" }, 
  { name: "My Schedule", icon: Calendar, path: "/schedule" },
  { name: "My Profile", icon: Contact, path: "/profile" },
];

const STAFF_PROFILE_ITEMS = [
  { name: "My Profile", icon: Contact, path: "/profile" },
  { name: "HK Directory", icon: PhoneCall, path: "/team/contacts" },
  { name: "Org Chart", icon: Share2, path: "/org-chart" },
];

const STAFF_MENU_ITEMS = [
  { name: "Guest List", icon: Users, path: "/guests", key: "allocation" }, 
  { name: "My Schedule", icon: Calendar, path: "/schedule", key: "schedule" },
];

export default function Sidebar() {
  const pathname = usePathname();

  const isMinibarRoute = pathname?.includes('/minibar');
  const isTeamRoute = pathname?.includes('/hosts') || pathname?.includes('/attendance') || pathname?.includes('/overtime') || pathname?.includes('/org-chart') || pathname?.includes('/team') || pathname?.includes('/leave-planner') || pathname?.includes('/leave-requests');
  const isProfileRoute = pathname?.includes('/profile') || pathname?.includes('/org-chart') || pathname?.includes('/team');
  const isInventoryRoute = pathname?.includes('/inventory');
  const isAllocationRoute = pathname?.includes('/allocation') || pathname?.includes('/guests') || pathname?.includes('/forecast');
  const isLaundryRoute = pathname?.includes('/laundry');
  
  const [isMinibarOpen, setIsMinibarOpen] = useState(isMinibarRoute);
  const [isTeamOpen, setIsTeamOpen] = useState(isTeamRoute);
  const [isProfileOpen, setIsProfileOpen] = useState(isProfileRoute);
  const [isInventoryOpen, setIsInventoryOpen] = useState(isInventoryRoute);
  const [isAllocationOpen, setIsAllocationOpen] = useState(isAllocationRoute);
  const [isLaundryOpen, setIsLaundryOpen] = useState(isLaundryRoute);

  // Sub-menu state for switching hosts inside Team Hub
  const [isSimulateOpen, setIsSimulateOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState('');
  const [deskSearch, setDeskSearch] = useState('');

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [allHosts, setAllHosts] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isRunnerToday, setIsRunnerToday] = useState(false);
  const [isVaToday, setIsVaToday] = useState(false);
  const [isLaundryToday, setIsLaundryToday] = useState(false);

  useEffect(() => {
      const sessionData = localStorage.getItem('hk_pulse_session');
      if (sessionData) {
          try {
              const parsed = JSON.parse(sessionData);
              setCurrentUser(parsed);

              // On Runner duty today? Then they get the Runner page.
              if (parsed.id) {
                // Runner duty or villas today? Then they get the Requests page.
                supabase
                  .from("hsk_allocations")
                  .select("area, shift, task_details")
                  .eq("report_date", getDhakaDateStr())
                  .eq("host_id", parsed.id)
                  .then(({ data }) => {
                    const rows = (data || []).filter((a: any) => !isOffShift(a.shift));
                    setIsRunnerToday(rows.some((a: any) => a.area === "riders" && riderDutyOf(a, { role: parsed.role }) === "Runner"));
                    setIsVaToday(rows.some((a: any) => a.area === "villa" && String(a.task_details || "").trim()));
                    setIsLaundryToday(rows.some((a: any) => a.area === "laundry"));
                  });
              }

              if (parsed.is_super_admin || parsed.impersonating_from) {
                supabase
                  .from("hsk_hosts")
                  .select("id, host_id, full_name, role, system_role, allowed_modules, jetty_allocation")
                  .neq("status", "Resigned")
                  .order("full_name")
                  .then(({ data }) => setAllHosts(data || []));
              }
          } catch (e) {
              setCurrentUser({ system_role: 'staff' });
          }
      } else {
          const adminAuth = localStorage.getItem('hk_pulse_admin_auth');
          if (adminAuth === 'true') {
            setCurrentUser({ system_role: 'admin', is_super_admin: true });
          }
      }
      setIsLoaded(true);
  }, []);

  useEffect(() => {
      if (isMinibarRoute) setIsMinibarOpen(true);
      if (isTeamRoute) setIsTeamOpen(true);
      if (isProfileRoute) setIsProfileOpen(true);
      if (isInventoryRoute) setIsInventoryOpen(true);
      if (isAllocationRoute) setIsAllocationOpen(true);
      if (isLaundryRoute) setIsLaundryOpen(true);
  }, [isMinibarRoute, isTeamRoute, isProfileRoute, isInventoryRoute, isAllocationRoute, isLaundryRoute]);

  useEffect(() => {
      setIsMobileMenuOpen(false);
      setMobileSearch('');
  }, [pathname]);

  const handleLogout = () => {
      localStorage.removeItem('hk_pulse_session');
      localStorage.removeItem('hk_pulse_admin_auth');
      window.location.href = '/'; 
  };

  const handleSimulateHost = (host: any) => {
    const simulated = {
      id: host.id,
      host_id: host.host_id,
      full_name: host.full_name,
      role: host.role,
      system_role: host.system_role || 'staff',
      is_super_admin: false,
      allowed_modules: host.allowed_modules || ['allocation', 'tasks'],
      jetty_allocation: host.jetty_allocation,
      impersonating_from: {
        id: currentUser.impersonating_from?.id || currentUser.id,
        full_name: currentUser.impersonating_from?.full_name || currentUser.full_name,
        system_role: 'admin'
      }
    };
    localStorage.setItem('hk_pulse_session', JSON.stringify(simulated));
    window.location.reload();
  };

  const handleExitSimulation = () => {
    if (!currentUser?.impersonating_from) return;
    const restored = {
      id: currentUser.impersonating_from.id,
      full_name: currentUser.impersonating_from.full_name,
      system_role: 'admin',
      is_super_admin: true,
      allowed_modules: ['all']
    };
    localStorage.setItem('hk_pulse_session', JSON.stringify(restored));
    window.location.reload();
  };

  const canAccess = (moduleName: string): boolean => {
    if (!currentUser) return false;
    if (currentUser.is_super_admin && !currentUser.impersonating_from) return true;
    if (moduleName === "allocation" || moduleName === "tasks") return true;
    if (moduleName === "settings") return currentUser.system_role === 'admin' || !!currentUser.is_super_admin;
    
    const userModules = currentUser.allowed_modules || [];
    return userModules.includes(moduleName);
  };

  const roleLower = String(currentUser?.role || '').toLowerCase();
  const deptLower = String(currentUser?.department || '').toLowerCase();
  const isPoolAttendant = roleLower.includes('pool');
  const isSuperAdmin = currentUser?.is_super_admin || !!currentUser?.impersonating_from;
  const isAdmin = currentUser?.system_role === 'admin' || (currentUser?.is_super_admin && !currentUser?.impersonating_from);

  const canAccessLaundry = isAdmin || roleLower.includes('laundry') || deptLower.includes('laundry') || canAccess("laundry");
  // Laundry Production: admins + whoever is on laundry duty in today's allocation
  const canAccessProduction = isAdmin || isLaundryToday;
  const laundryItems = LAUNDRY_ITEMS.filter(i => (i.path === '/laundry/production' ? canAccessProduction : canAccessLaundry));
  const canAccessWater = isAdmin || isPoolAttendant || canAccess("water");
  const canAccessMinibar = isAdmin || canAccess("minibar");
  const canAccessInventory = isAdmin; // inventory sheets are admin-only
  // Pest Control: admins, the shared Pest Control login and the garden team
  const canAccessPest = isAdmin || canUsePestControl(currentUser);
  const isPestLogin = isPestAccount(currentUser);

  const activeStaffTabs = useMemo(() => {
      const base = !isPoolAttendant ? STAFF_CORE_BASE : [
          STAFF_CORE_BASE[0], 
          { name: "Water Prod.", icon: Droplets, path: "/water" },
          STAFF_CORE_BASE[1]  
      ];
      const withRequests = isRunnerToday || isVaToday ? [base[0], { name: "Requests", icon: isRunnerToday ? Bike : ClipboardList, path: "/requests" }, ...base.slice(1)] : base;
      return isLaundryToday ? [withRequests[0], { name: "Laundry Production", icon: WashingMachine, path: "/laundry/production" }, ...withRequests.slice(1)] : withRequests;
  }, [isPoolAttendant, isRunnerToday, isVaToday, isLaundryToday]);

  const dynamicStaffMenuItems = STAFF_MENU_ITEMS;

  const ADMIN_BOTTOM_TABS = [
      { name: "Dashboard", icon: LayoutDashboard, path: "/" },
      { name: "Requests", icon: ClipboardList, path: "/requests" },
      { name: "Guests", icon: Users, path: "/guests" },
      { name: "Tasks", icon: CheckSquare, path: "/tasks" },
  ];

  const STAFF_BOTTOM_TABS = isPestLogin ? [
      { name: "Dashboard", icon: LayoutDashboard, path: "/" },
      { name: "Pest Control", icon: Bug, path: "/pest-control" },
      { name: "Profile", icon: Contact, path: "/profile" }
  ] : isLaundryToday && !isRunnerToday ? [
      { name: "Dashboard", icon: LayoutDashboard, path: "/" },
      { name: "Production", icon: WashingMachine, path: "/laundry/production" },
      { name: "My Tasks", icon: ClipboardList, path: "/my-tasks" }
  ] : isRunnerToday ? [
      { name: "Dashboard", icon: LayoutDashboard, path: "/" },
      { name: "Requests", icon: Bike, path: "/requests" },
      { name: "My Tasks", icon: ClipboardList, path: "/my-tasks" }
  ] : isVaToday && !isPoolAttendant ? [
      { name: "Dashboard", icon: LayoutDashboard, path: "/" },
      { name: "My Tasks", icon: ClipboardList, path: "/my-tasks" },
      { name: "Requests", icon: Wine, path: "/requests" }
  ] : isPoolAttendant ? [
      { name: "Dashboard", icon: LayoutDashboard, path: "/" },
      { name: "Water Prod.", icon: Droplets, path: "/water" },
      { name: "My Tasks", icon: ClipboardList, path: "/my-tasks" } 
  ] : [
      { name: "Dashboard", icon: LayoutDashboard, path: "/" },
      { name: "My Tasks", icon: ClipboardList, path: "/my-tasks" }, 
      { name: "Profile", icon: Contact, path: "/profile" }
  ];

  if (!isLoaded) return null; 

  const BOTTOM_TABS = isAdmin ? ADMIN_BOTTOM_TABS : STAFF_BOTTOM_TABS;

  // One menu definition for desktop sidebar AND the mobile drawer, so they always match.
  type NavSection = { key: string; group: string; title: string; icon: React.ElementType; tone: Tone; items: { name: string; icon: React.ElementType; path: string }[]; collapsible: boolean; open?: boolean; toggle?: () => void };
  const sections: NavSection[] = [];
  const core = isAdmin ? ADMIN_CORE_TABS : activeStaffTabs;
  sections.push({ key: 'core', group: isAdmin ? 'Core' : 'Staff Portal', title: isAdmin ? 'Core' : 'My Work', icon: LayoutDashboard, tone: 'brand', items: core, collapsible: false });
  // Staff see only the final Allocation Sheet, Guest List and Forecast.
  const allocationItems = isAdmin ? ALLOCATION_ITEMS : ALLOCATION_ITEMS.filter(i => ['/forecast', '/guests', '/allocation/sheet'].includes(i.path));
  sections.push({ key: 'allocation', group: 'Departments', title: 'Allocation Hub', icon: ListChecks, tone: 'brand', items: allocationItems, collapsible: true, open: isAllocationOpen, toggle: () => setIsAllocationOpen(o => !o) });
  if (canAccessInventory) sections.push({ key: 'inventory', group: 'Departments', title: 'Inventory Hub', icon: Warehouse, tone: 'emerald', items: INVENTORY_ITEMS, collapsible: true, open: isInventoryOpen, toggle: () => setIsInventoryOpen(o => !o) });
  if (laundryItems.length) sections.push({ key: 'laundry', group: 'Departments', title: 'Laundry Hub', icon: Droplets, tone: 'purple', items: laundryItems, collapsible: true, open: isLaundryOpen, toggle: () => setIsLaundryOpen(o => !o) });
  if (canAccessWater) sections.push({ key: 'water', group: 'Departments', title: 'Water Production', icon: Droplets, tone: 'sky', items: [{ name: 'Water Production', icon: Droplets, path: '/water' }], collapsible: false });
  if (canAccessPest) sections.push({ key: 'pest', group: 'Departments', title: 'Pest Control', icon: Bug, tone: 'amber', items: [{ name: 'Pest Control', icon: Bug, path: '/pest-control' }], collapsible: false });
  if (canAccessMinibar) sections.push({ key: 'minibar', group: 'Departments', title: 'Minibar', icon: Wine, tone: 'rose', items: MINIBAR_ITEMS, collapsible: true, open: isMinibarOpen, toggle: () => setIsMinibarOpen(o => !o) });
  if (isAdmin || isSuperAdmin) sections.push({ key: 'team', group: 'Departments', title: 'Team Hub', icon: Briefcase, tone: 'blue', items: TEAM_ITEMS, collapsible: true, open: isTeamOpen, toggle: () => setIsTeamOpen(o => !o) });
  if (isAdmin) sections.push({ key: 'ops', group: 'Operations', title: 'Operations', icon: Settings, tone: 'brand', items: OPERATIONS_ITEMS, collapsible: false });
  if (!isAdmin) {
    sections.push({ key: 'profile', group: 'Personal', title: 'Profile & Org', icon: Contact, tone: 'amber', items: STAFF_PROFILE_ITEMS, collapsible: true, open: isProfileOpen, toggle: () => setIsProfileOpen(o => !o) });
    sections.push({ key: 'more', group: 'More Options', title: 'More', icon: Menu, tone: 'brand', items: dynamicStaffMenuItems, collapsible: false });
  }

  const isActivePath = (path: string) => pathname === path || (path !== '/' && !!pathname?.startsWith(`${path}/`));
  const q = mobileSearch.trim().toLowerCase();
  const mobileSections = sections
    .map(sec => ({ ...sec, items: sec.items.filter((it, i, arr) => arr.findIndex(x => x.path === it.path) === i && (!q || it.name.toLowerCase().includes(q) || sec.title.toLowerCase().includes(q))) }))
    .filter(sec => sec.items.length);

  const Logo = ({ className }: { className: string }) => (
    <svg viewBox="0 0 779.0408 559.8364" className={className}>
        <g><path fill="currentColor" d="M446.3249,154.1565c-7.1645,48.7463-10.5173,97.9279-15.0613,148.5227l-13.8244,153.9282c-.3069,3.4173-5.5762,7.5945-8.4078,7.3067-3.0506-.3101-7.3739-4.1613-8.0238-7.8856l-32.9782-188.9979-18.3056,50.2868-334.1757.4772c-4.158.0059-7.9278-2.9903-8.7051-5.6231-.8254-2.7956,2.2962-9.9766,6.6902-9.9796l325.2134-.2193,23.3418-69.9428c.9398-2.816,4.8921-6.2965,7.3071-6.1549s7.3561,4.0239,7.8589,6.6598l29.6772,155.5961,14.8807-155.5515,14.5905-136.2981c.2809-2.6239,2.1755-10.3733,4.7519-10.7483l10.7277-1.5614c.8189-7.7266-7.7576-10.913-13.0879-9.9415-4.4065.8032-11.3235,5.9248-12.0528,12.4835l-17.7598,159.7114c-.3191,2.8694-10.5707,2.4459-10.5734-.1849l-.2501-245.2915,61.8527-.4319,1.0441,113.9918L570.238.0704l65.6921.3899-100.0107,109.7625,106.5394,138.8418-71.9084.6198-74.999-97.936-28.7757,29.539,22.8739,146.5134,24.2284-84.3501c.6584-2.2921,4.5749-5.7373,6.7842-5.9222,2.2074-.1847,6.775,2.8888,7.7913,5.471l23.2836,59.1596,166.8207.0069c-3.479-6.3327-6.8911-11.937-9.0245-17.7921-3.6963-10.1445,1.5657-20.6071,9.5988-24.2859,8.7745-4.0183,18.424-.8301,25.2361,6.6117,6.7648-7.795,17.1264-10.4345,25.7726-5.1451,7.7731,4.7554,11.8203,16.1402,6.4511,26.4242-6.2167,11.9073-18.4522,25.0592-31.4581,29.559l-202.8377-.2423-19.568-45.8937-27.395,95.6932c-.7754,2.7085-5.2918,7.1034-7.8761,7.3902-3.2398.3595-8.2946-3.8743-8.907-7.9108l-32.2252-212.4179Z"/><polygon fill="currentColor" points="343.4116 249.5996 291.7421 249.3681 291.5403 150.0811 185.0103 150.1367 184.7339 249.7369 123.407 249.6255 123.4782 .1828 184.624 0 185.0213 98.2849 291.5769 97.7809 291.7613 .1355 353.5124 .3382 353.7136 219.3424 343.4116 249.5996"/><path fill="currentColor" d="M757.5278,473.4462l-87.5517.5215.0463,67.2512,103.6492-.0449-.0066,16.3618-121.8009-.0313-.2756-180.4659,117.7959.1358.1099,16.1483-99.4879-.0965-.1241,63.7011,85.6803.3468c1.9428,2.8477,2.1397,7.7004,1.9653,16.1721Z"/><path fill="currentColor" d="M288.1135,377.7922l18.0816-.2947-.5409,115.7788c-.0982,21.021-9.8277,42.483-27.5179,54.0608-25.3532,16.5931-60.0694,16.7763-85.3435-.115-17.5004-11.6959-27.12-33.3207-27.2318-54.4116l-.6095-114.984,17.9897-.2039,1.2298,118.0705c.2984,28.648,23.3414,46.058,50.1972,46.5803,29.2568.569,53.2062-19.0568,53.3199-49.7185l.4255-114.7628Z"/><path fill="currentColor" d="M80.942,495.7405c-20.5601,2.9274-40.4425,1.3546-62.482,1.1356l-.4798,60.1896-17.8739-.2755-.1063-179.4095c25.4379-.2739,51.1778-.857,76.1557.7138,33.1766,2.0864,54.4285,27.116,54.336,58.9226-.0868,29.8411-17.8761,54.2136-49.5497,58.7234ZM112.8012,435.9662c-1.5988-53.072-61.7208-41.1317-94.6485-42.2686l.1722,86.8255c20.3889.0232,38.1689.5732,56.3045-.881,23.4086-1.8771,38.8952-19.662,38.1717-43.6759Z"/><path fill="currentColor" d="M489.5993,537.7297c-1.5288-4.3604,2.0379-12.9604,4.9815-16.4828,23.7972,19.5208,54.528,27.7196,83.2839,17.6539,12.2654-4.2934,19.3082-15.1022,19.64-26.5478,1.0952-37.7761-65.8095-30.546-92.437-56.7106-12.128-11.9172-14.1085-28.7605-9.8061-45.0677,11.2687-42.7111,80.8481-42.382,113.2302-20.809-1.3807,6.0145-3.042,10.9922-5.2268,15.8878-22.334-12.511-45.8544-17.4775-69.5368-10.2088-12.917,3.9645-21.0138,14.2578-21.8392,26.5353-.8559,12.7304,7.5603,24.6303,21.0232,29.0818l50.3752,16.6562c20.0579,6.632,32.4612,22.8579,32.5008,42.6709.0391,19.5797-11.2835,36.7803-31.2853,43.8924-31.4059,11.1671-67.4314,5.4102-94.9037-16.5515Z"/><path fill="currentColor" d="M471.7684,540.9736c.5889,5.2165.6534,10.1802.2602,16.5435l-112.8218.0037-.1418-179.3732,18.4355-.5393.0973,163.3538,94.1706.0115Z"/></g>
    </svg>
  );

  const simulateBlock = isSuperAdmin && !currentUser?.impersonating_from && (
    <div className="pt-1 mt-1 border-t border-slate-100">
      {currentUser?.impersonating_from ? (
        <button onClick={handleExitSimulation} className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-[11px] active:scale-95 transition-all">
          <div className="flex items-center gap-2 truncate"><Eye size={13} className="animate-pulse shrink-0" /><span className="truncate">Exit ({currentUser.full_name})</span></div>
          <ArrowLeft size={12} className="shrink-0" />
        </button>
      ) : (
        <>
          <button onClick={() => setIsSimulateOpen(!isSimulateOpen)} className={`w-full flex items-center justify-between h-8 px-2.5 rounded-md text-[13px] transition-colors ${isSimulateOpen ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>
            <div className="flex items-center gap-2.5"><UserCog size={14} /><span>Simulate Host View</span></div>
            {isSimulateOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          {isSimulateOpen && (
            <div className="mt-1 pl-2 space-y-0.5 max-h-48 overflow-y-auto no-scrollbar py-1">
              {allHosts.length === 0 && <p className="px-2.5 py-1.5 text-[10.5px] text-slate-400">No hosts loaded.</p>}
              {allHosts.map((h) => (
                <button key={h.id} onClick={() => { setIsSimulateOpen(false); handleSimulateHost(h); }} className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-blue-100/70 text-[10.5px] flex flex-col transition-colors">
                  <span className="font-bold truncate text-slate-900">{h.full_name}</span>
                  <span className="text-[9px] text-slate-400 uppercase truncate">{h.role} • {h.jetty_allocation || "General"}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  let lastGroup = '';
  const dq = deskSearch.trim().toLowerCase();
  const deskMatches = dq
    ? sections.flatMap(sec => sec.items.map(it => ({ ...it, section: sec.title })))
        .filter((it, i, arr) => arr.findIndex(x => x.path === it.path) === i)
        .filter(it => it.name.toLowerCase().includes(dq) || it.section.toLowerCase().includes(dq))
    : [];
  const initials = String(currentUser?.full_name || 'HK').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

  // Row styles
  const rowBase = "relative flex items-center gap-3 h-9 px-3 rounded-lg text-[13px] transition-colors";
  const rowIdle = "text-slate-600 hover:bg-slate-100 hover:text-slate-900";
  const rowActive = "bg-[#6D2158]/[0.08] text-[#6D2158] font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full before:bg-[#6D2158]";

  return (
    <>
      {/* DESKTOP SIDEBAR */}
      <aside className="print:hidden hidden md:flex fixed inset-y-0 left-0 w-64 flex-col z-50 bg-white border-r border-slate-200/80 font-sans">
        <div className="h-16 shrink-0 flex items-center px-5 text-[#6D2158]">
          <Link href="/" aria-label="Dashboard"><Logo className="h-7 w-auto" /></Link>
        </div>

        <div className="px-3 pb-2 shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={deskSearch} onChange={e => setDeskSearch(e.target.value)} placeholder="Find a page"
              onKeyDown={e => { if (e.key === 'Escape') setDeskSearch(''); }}
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-slate-100/80 border border-transparent text-[13px] text-slate-700 placeholder-slate-400 outline-none focus:bg-white focus:border-[#6D2158]/40 focus:ring-2 focus:ring-[#6D2158]/10" />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto no-scrollbar px-3 pb-4">
          {dq ? (
            <div className="pt-2 space-y-0.5">
              {deskMatches.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-slate-400">No page matches.</p>}
              {deskMatches.map(it => (
                <Link key={it.path} href={it.path} onClick={() => setDeskSearch('')} className={`${rowBase} ${isActivePath(it.path) ? rowActive : rowIdle}`}>
                  <it.icon size={16} className="shrink-0 opacity-80" />
                  <span className="truncate flex-1">{it.name}</span>
                  <span className="text-[10px] text-slate-400 truncate max-w-[70px]">{it.section}</span>
                </Link>
              ))}
            </div>
          ) : sections.map((sec) => {
            const heading = sec.group !== lastGroup ? sec.group : '';
            lastGroup = sec.group;
            const sectionActive = sec.items.some(it => isActivePath(it.path));
            return (
              <div key={sec.key}>
                {heading && <div className="px-3 pt-5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{heading}</div>}
                {sec.collapsible ? (
                  <div>
                    <button onClick={sec.toggle} className={`${rowBase} w-full ${sectionActive && !sec.open ? 'text-[#6D2158] font-semibold hover:bg-slate-100' : rowIdle}`}>
                      <sec.icon size={16} className="shrink-0 opacity-80" />
                      <span className="flex-1 text-left truncate">{sec.title}</span>
                      {sectionActive && !sec.open && <span className="w-1.5 h-1.5 rounded-full bg-[#6D2158]" />}
                      <ChevronRight size={14} className={`shrink-0 text-slate-400 transition-transform ${sec.open ? 'rotate-90' : ''}`} />
                    </button>
                    {sec.open && (
                      <div className="ml-[22px] pl-2.5 border-l border-slate-200 my-0.5 space-y-0.5">
                        {sec.items.map((item) => {
                          const on = isActivePath(item.path) && (item.path === pathname || !sec.items.some(o => o.path !== item.path && o.path.length > item.path.length && isActivePath(o.path)));
                          return (
                            <Link key={item.path} href={item.path} className={`flex items-center h-8 px-2.5 rounded-md text-[13px] transition-colors ${on ? 'bg-[#6D2158]/[0.08] text-[#6D2158] font-semibold' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
                              <span className="truncate">{item.name}</span>
                            </Link>
                          );
                        })}
                        {sec.key === 'team' && simulateBlock}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {sec.items.map((item) => {
                      const on = isActivePath(item.path);
                      return (
                        <Link key={item.path} href={item.path} className={`${rowBase} ${on ? rowActive : rowIdle}`}>
                          <item.icon size={16} className="shrink-0 opacity-80" />
                          <span className="truncate">{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {currentUser?.impersonating_from && (
          <button onClick={handleExitSimulation} className="mx-3 mb-2 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-400 text-amber-950 text-[12px] font-semibold">
            <span className="flex items-center gap-2 truncate"><Eye size={14} /> Viewing as {currentUser.full_name?.split(' ')[0]}</span>
            <ArrowLeft size={13} />
          </button>
        )}

        <div className="shrink-0 border-t border-slate-200/80 p-3">
          <div className="flex items-center gap-3 px-1.5">
            <div className="w-9 h-9 rounded-full bg-[#6D2158] text-white flex items-center justify-center text-[12px] font-bold shrink-0">{initials}</div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-slate-800 truncate leading-tight">{currentUser?.full_name || 'HK Pulse'}</p>
              <p className="text-[11px] text-slate-400 truncate">{currentUser?.role || (isAdmin ? 'Admin' : 'Staff')}</p>
            </div>
            <button onClick={handleLogout} title="Sign out" className="p-2 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      {/* MOBILE BOTTOM NAVIGATION */}
      <nav className="print:hidden md:hidden fixed bottom-0 inset-x-0 z-[999] bg-white/95 backdrop-blur-xl border-t border-slate-200/70 shadow-[0_-8px_30px_rgba(0,0,0,0.05)]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${BOTTOM_TABS.length + 1}, minmax(0, 1fr))` }}>
          {BOTTOM_TABS.map((tab) => {
            const on = isActivePath(tab.path) && !isMobileMenuOpen;
            return (
              <Link key={tab.path} href={tab.path} className="flex flex-col items-center justify-center gap-0.5 active:scale-90 transition-transform">
                <span className={`px-4 py-1 rounded-full transition-colors ${on ? 'bg-[#6D2158]/10 text-[#6D2158]' : 'text-slate-400'}`}><tab.icon size={21} strokeWidth={on ? 2.5 : 2} /></span>
                <span className={`text-[10px] font-bold truncate max-w-full px-1 ${on ? 'text-[#6D2158]' : 'text-slate-400'}`}>{tab.name}</span>
              </Link>
            );
          })}
          <button onClick={() => setIsMobileMenuOpen(true)} className="flex flex-col items-center justify-center gap-0.5 active:scale-90 transition-transform">
            <span className={`px-4 py-1 rounded-full transition-colors ${isMobileMenuOpen ? 'bg-[#6D2158]/10 text-[#6D2158]' : 'text-slate-400'}`}><Menu size={21} /></span>
            <span className={`text-[10px] font-bold ${isMobileMenuOpen ? 'text-[#6D2158]' : 'text-slate-400'}`}>Menu</span>
          </button>
        </div>
      </nav>

      {/* FULL MOBILE MENU — every section from the desktop sidebar */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[1000] md:hidden flex flex-col justify-end bg-black/50 backdrop-blur-[2px] animate-in fade-in duration-150" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="bg-[#FDFBFD] w-full h-[92dvh] rounded-t-[1.75rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300" onClick={e => e.stopPropagation()}>
            <div className="pt-2.5 pb-3 px-4 bg-white border-b border-slate-100 shrink-0">
              <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#6D2158] text-white flex items-center justify-center font-black text-sm shrink-0">
                  {String(currentUser?.full_name || 'HK').split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-black text-sm text-slate-800 truncate">{currentUser?.full_name || 'HK Pulse'}</div>
                  <div className="text-[11px] text-slate-400 truncate">{currentUser?.role || (isAdmin ? 'Admin' : 'Staff')}</div>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 rounded-full bg-slate-100 text-slate-500"><X size={18} /></button>
              </div>
              <div className="relative mt-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={mobileSearch} onChange={e => setMobileSearch(e.target.value)} placeholder="Find a page…" className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-100 border border-transparent focus:border-[#6D2158] focus:bg-white outline-none text-sm font-semibold text-slate-700" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
              {currentUser?.impersonating_from && (
                <div className="p-3 bg-amber-500 text-slate-950 rounded-xl flex items-center justify-between text-xs font-bold">
                  <span className="truncate">Viewing as <strong>{currentUser.full_name}</strong></span>
                  <button onClick={handleExitSimulation} className="bg-black text-white px-2.5 py-1 rounded-lg text-[10px] uppercase font-black shrink-0">Exit</button>
                </div>
              )}
              {mobileSections.length === 0 && <p className="text-center text-sm text-slate-400 py-10">No page matches “{mobileSearch}”.</p>}
              {mobileSections.map(sec => {
                const t = TONES[sec.tone];
                return (
                  <section key={sec.key}>
                    <h3 className={`text-[11px] font-black uppercase tracking-widest mb-2 px-1 flex items-center gap-1.5 ${t.text}`}><sec.icon size={13} /> {sec.title}</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {sec.items.map(item => {
                        const on = isActivePath(item.path);
                        return (
                          <Link key={item.path} href={item.path} onClick={() => setIsMobileMenuOpen(false)}
                            className={`flex flex-col items-center justify-center text-center gap-1.5 px-1.5 py-3 rounded-2xl border transition active:scale-95 min-h-[78px] ${on ? 'bg-[#6D2158] border-[#6D2158] text-white shadow-md' : 'bg-white border-slate-200/80 text-slate-600'}`}>
                            <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${on ? 'bg-white/15' : t.soft}`}><item.icon size={18} /></span>
                            <span className="text-[11px] font-bold leading-tight line-clamp-2">{item.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 p-3.5 bg-rose-50 text-rose-600 rounded-2xl text-xs font-black uppercase tracking-wider border border-rose-100">
                <LogOut size={15} /> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
