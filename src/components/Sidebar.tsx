"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, Users, ClipboardList, 
  Printer, Settings, LogOut, Warehouse, 
  ShoppingCart, ListChecks, Droplets,
  Calendar, Menu, X, Wine, Box, Zap, UtensilsCrossed, ChevronDown, ChevronRight,
  Briefcase, Contact, UserCheck, Clock
} from "lucide-react";

// --- ADMIN SPECIFIC MENUS ---
const ADMIN_CORE_TABS = [
  { name: "Dashboard", icon: LayoutDashboard, path: "/" },
  { name: "Requests", icon: ClipboardList, path: "/requests" },
  { name: "Inventory", icon: Warehouse, path: "/inventory/store" },
];

const MENU_ITEMS = [
  { name: "Guest List", icon: Users, path: "/guests" },
  { name: "Allocation", icon: ListChecks, path: "/allocation" },
  { name: "Water Production", icon: Droplets, path: "/water" },
  { name: "Order Tracking", icon: ShoppingCart, path: "/orders" },
  { name: "Print Hub", icon: Printer, path: "/print" },
  { name: "Settings", icon: Settings, path: "/settings" },
];

const TEAM_ITEMS = [
  { name: "Host Profiles", icon: Contact, path: "/hosts" },
  { name: "Attendance", icon: UserCheck, path: "/attendance" },
  { name: "Overtime", icon: Clock, path: "/overtime" },
];

const MINIBAR_ITEMS = [
  { name: "Minibar Mobile App", icon: Wine, path: "/minibar/inventory/mobile" },
  { name: "Live Inventory Matrix", icon: Box, path: "/minibar/inventory" },
  { name: "Expiry Control", icon: Calendar, path: "/minibar/expiry" },
  { name: "Minibar Sales", icon: Zap, path: "/minibar/sales" },
  { name: "Finance P&L", icon: UtensilsCrossed, path: "/minibar/finance" },
];

// --- STAFF SPECIFIC MENUS ---
const STAFF_CORE_TABS = [
  { name: "My Tasks", icon: ClipboardList, path: "/minibar/inventory/mobile" },
  { name: "My Schedule", icon: Calendar, path: "/schedule" },
  { name: "My Profile", icon: Contact, path: "/profile" },
];


export default function Sidebar() {
  const pathname = usePathname();
  
  // Mobile Bottom Sheet state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Desktop Dropdown States
  const isMinibarRoute = pathname.includes('/minibar');
  const isTeamRoute = pathname.includes('/hosts') || pathname.includes('/attendance') || pathname.includes('/overtime');
  const [isMinibarOpen, setIsMinibarOpen] = useState(isMinibarRoute);
  const [isTeamOpen, setIsTeamOpen] = useState(isTeamRoute);

  // --- ROLE BASED ACCESS STATE ---
  const [userRole, setUserRole] = useState<'admin' | 'staff' | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
      // 1. Read the saved session from the new Login system
      const sessionData = localStorage.getItem('hk_pulse_session');
      if (sessionData) {
          try {
              const parsed = JSON.parse(sessionData);
              setUserRole(parsed.system_role || 'staff');
          } catch (e) {
              setUserRole('staff');
          }
      } else {
          // Fallback just in case
          const adminAuth = localStorage.getItem('hk_pulse_admin_auth');
          if (adminAuth === 'true') setUserRole('admin');
      }
      
      setIsLoaded(true);
      if (isMinibarRoute) setIsMinibarOpen(true);
      if (isTeamRoute) setIsTeamOpen(true);
  }, [pathname, isMinibarRoute, isTeamRoute]);

  const handleLogout = () => {
      localStorage.removeItem('hk_pulse_session');
      localStorage.removeItem('hk_pulse_admin_auth');
      window.location.href = '/'; // Forces app to reload and hit the AuthGuard lock
  };

  // Prevent UI flashing before role is determined
  if (!isLoaded) return null; 

  const isAdmin = userRole === 'admin';
  const CORE_TABS = isAdmin ? ADMIN_CORE_TABS : STAFF_CORE_TABS;

  // SVG Logo Component
  const Logo = ({ className }: { className: string }) => (
    <svg viewBox="0 0 779.0408 559.8364" className={className}>
        <g><path fill="currentColor" d="M446.3249,154.1565c-7.1645,48.7463-10.5173,97.9279-15.0613,148.5227l-13.8244,153.9282c-.3069,3.4173-5.5762,7.5945-8.4078,7.3067-3.0506-.3101-7.3739-4.1613-8.0238-7.8856l-32.9782-188.9979-18.3056,50.2868-334.1757.4772c-4.158.0059-7.9278-2.9903-8.7051-5.6231-.8254-2.7956,2.2962-9.9766,6.6902-9.9796l325.2134-.2193,23.3418-69.9428c.9398-2.816,4.8921-6.2965,7.3071-6.1549s7.3561,4.0239,7.8589,6.6598l29.6772,155.5961,14.8807-155.5515,14.5905-136.2981c.2809-2.6239,2.1755-10.3733,4.7519-10.7483l10.7277-1.5614c.8189-7.7266-7.7576-10.913-13.0879-9.9415-4.4065.8032-11.3235,5.9248-12.0528,12.4835l-17.7598,159.7114c-.3191,2.8694-10.5707,2.4459-10.5734-.1849l-.2501-245.2915,61.8527-.4319,1.0441,113.9918L570.238.0704l65.6921.3899-100.0107,109.7625,106.5394,138.8418-71.9084.6198-74.999-97.936-28.7757,29.539,22.8739,146.5134,24.2284-84.3501c.6584-2.2921,4.5749-5.7373,6.7842-5.9222,2.2074-.1847,6.775,2.8888,7.7913,5.471l23.2836,59.1596,166.8207.0069c-3.479-6.3327-6.8911-11.937-9.0245-17.7921-3.6963-10.1445,1.5657-20.6071,9.5988-24.2859,8.7745-4.0183,18.424-.8301,25.2361,6.6117,6.7648-7.795,17.1264-10.4345,25.7726-5.1451,7.7731,4.7554,11.8203,16.1402,6.4511,26.4242-6.2167,11.9073-18.4522,25.0592-31.4581,29.559l-202.8377-.2423-19.568-45.8937-27.395,95.6932c-.7754,2.7085-5.2918,7.1034-7.8761,7.3902-3.2398.3595-8.2946-3.8743-8.907-7.9108l-32.2252-212.4179Z"/><polygon fill="currentColor" points="343.4116 249.5996 291.7421 249.3681 291.5403 150.0811 185.0103 150.1367 184.7339 249.7369 123.407 249.6255 123.4782 .1828 184.624 0 185.0213 98.2849 291.5769 97.7809 291.7613 .1355 353.5124 .3382 353.7136 219.3424 343.4116 249.5996"/><path fill="currentColor" d="M757.5278,473.4462l-87.5517.5215.0463,67.2512,103.6492-.0449-.0066,16.3618-121.8009-.0313-.2756-180.4659,117.7959.1358.1099,16.1483-99.4879-.0965-.1241,63.7011,85.6803.3468c1.9428,2.8477,2.1397,7.7004,1.9653,16.1721Z"/><path fill="currentColor" d="M288.1135,377.7922l18.0816-.2947-.5409,115.7788c-.0982,21.021-9.8277,42.483-27.5179,54.0608-25.3532,16.5931-60.0694,16.7763-85.3435-.115-17.5004-11.6959-27.12-33.3207-27.2318-54.4116l-.6095-114.984,17.9897-.2039,1.2298,118.0705c.2984,28.648,23.3414,46.058,50.1972,46.5803,29.2568.569,53.2062-19.0568,53.3199-49.7185l.4255-114.7628Z"/><path fill="currentColor" d="M80.942,495.7405c-20.5601,2.9274-40.4425,1.3546-62.482,1.1356l-.4798,60.1896-17.8739-.2755-.1063-179.4095c25.4379-.2739,51.1778-.857,76.1557.7138,33.1766,2.0864,54.4285,27.116,54.336,58.9226-.0868,29.8411-17.8761,54.2136-49.5497,58.7234ZM112.8012,435.9662c-1.5988-53.072-61.7208-41.1317-94.6485-42.2686l.1722,86.8255c20.3889.0232,38.1689.5732,56.3045-.881,23.4086-1.8771,38.8952-19.662,38.1717-43.6759Z"/><path fill="currentColor" d="M489.5993,537.7297c-1.5288-4.3604,2.0379-12.9604,4.9815-16.4828,23.7972,19.5208,54.528,27.7196,83.2839,17.6539,12.2654-4.2934,19.3082-15.1022,19.64-26.5478,1.0952-37.7761-65.8095-30.546-92.437-56.7106-12.128-11.9172-14.1085-28.7605-9.8061-45.0677,11.2687-42.7111,80.8481-42.382,113.2302-20.809-1.3807,6.0145-3.042,10.9922-5.2268,15.8878-22.334-12.511-45.8544-17.4775-69.5368-10.2088-12.917,3.9645-21.0138,14.2578-21.8392,26.5353-.8559,12.7304,7.5603,24.6303,21.0232,29.0818l50.3752,16.6562c20.0579,6.632,32.4612,22.8579,32.5008,42.6709.0391,19.5797-11.2835,36.7803-31.2853,43.8924-31.4059,11.1671-67.4314,5.4102-94.9037-16.5515Z"/><path fill="currentColor" d="M471.7684,540.9736c.5889,5.2165.6534,10.1802.2602,16.5435l-112.8218.0037-.1418-179.3732,18.4355-.5393.0973,163.3538,94.1706.0115Z"/></g>
    </svg>
  );

  return (
    <>
      {/* ========================================================
          1. DESKTOP SIDEBAR (FROSTED GLASS MAC STYLE)
          ======================================================== */}
      <aside className="hidden md:flex fixed top-0 left-0 h-screen w-64 bg-white/70 backdrop-blur-3xl border-r border-slate-200/50 flex-col z-50 shadow-[4px_0_24px_rgba(0,0,0,0.01)] transition-transform duration-300 ease-in-out">
        
        <div className="h-24 flex items-center justify-center px-6 border-b border-slate-200/50 text-[#6D2158]">
          <Logo className="h-10 w-auto drop-shadow-sm" />
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto no-scrollbar">
          
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3 px-2">
              {isAdmin ? 'Core' : 'Staff Portal'}
          </div>
          
          {CORE_TABS.map((item) => {
            const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(`${item.path}/`));
            return (
              <Link 
                key={item.path} href={item.path}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 group ${
                  isActive 
                    ? "bg-[#6D2158] text-white shadow-lg shadow-[#6D2158]/20" 
                    : "text-slate-500 hover:bg-slate-100 hover:text-[#6D2158]"
                }`}
              >
                <item.icon size={18} className={isActive ? "text-white" : "group-hover:text-[#6D2158] transition-colors"} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-xs font-bold tracking-wide">{item.name}</span>
              </Link>
            );
          })}

          {/* ADMIN ONLY MENUS */}
          {isAdmin && (
              <>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mt-6 mb-3 px-2">Operations</div>
                  {MENU_ITEMS.map((item) => {
                    const isActive = pathname === item.path || pathname.startsWith(`${item.path}/`);
                    return (
                      <Link 
                        key={item.path} href={item.path}
                        className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 group ${
                          isActive 
                            ? "bg-[#6D2158] text-white shadow-lg shadow-[#6D2158]/20" 
                            : "text-slate-500 hover:bg-slate-100 hover:text-[#6D2158]"
                        }`}
                      >
                        <item.icon size={18} className={isActive ? "text-white" : "group-hover:text-[#6D2158] transition-colors"} strokeWidth={isActive ? 2.5 : 2} />
                        <span className="text-xs font-bold tracking-wide">{item.name}</span>
                      </Link>
                    );
                  })}

                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mt-6 mb-3 px-2">Departments</div>
                  
                  {/* TEAM HUB */}
                  <div className="pt-1">
                    <button 
                      onClick={() => setIsTeamOpen(!isTeamOpen)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 group ${
                        isTeamRoute && !isTeamOpen
                          ? "bg-blue-50 text-blue-700 border border-blue-100" 
                          : "text-slate-500 hover:bg-slate-100 hover:text-[#6D2158]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Briefcase size={18} className={isTeamRoute ? "text-blue-700" : "group-hover:text-[#6D2158] transition-colors"} strokeWidth={2} />
                        <span className="text-xs font-bold tracking-wide">Team Hub</span>
                      </div>
                      {isTeamOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {isTeamOpen && (
                      <div className="mt-1 ml-4 pl-3 border-l-2 border-slate-200 space-y-1 animate-in-up duration-200">
                        {TEAM_ITEMS.map((item) => {
                          const isActive = pathname === item.path;
                          return (
                            <Link 
                              key={item.path} href={item.path}
                              className={`flex items-center gap-3 px-4 py-2 rounded-xl transition-all duration-200 group ${
                                isActive 
                                  ? "bg-blue-50 text-blue-700 font-black shadow-sm" 
                                  : "text-slate-500 hover:text-blue-700 hover:bg-slate-50"
                              }`}
                            >
                              <item.icon size={14} className={isActive ? "text-blue-700" : "group-hover:text-blue-700 transition-colors"} strokeWidth={isActive ? 2.5 : 2} />
                              <span className="text-[11px] tracking-wide">{item.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* MINIBAR */}
                  <div className="pt-1 pb-4">
                    <button 
                      onClick={() => setIsMinibarOpen(!isMinibarOpen)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 group ${
                        isMinibarRoute && !isMinibarOpen
                          ? "bg-rose-50 text-rose-600 border border-rose-100" 
                          : "text-slate-500 hover:bg-slate-100 hover:text-[#6D2158]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Wine size={18} className={isMinibarRoute ? "text-rose-600" : "group-hover:text-[#6D2158] transition-colors"} strokeWidth={2} />
                        <span className="text-xs font-bold tracking-wide">Minibar</span>
                      </div>
                      {isMinibarOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {isMinibarOpen && (
                      <div className="mt-1 ml-4 pl-3 border-l-2 border-slate-200 space-y-1 animate-in-up duration-200">
                        {MINIBAR_ITEMS.map((item) => {
                          const isActive = pathname === item.path;
                          return (
                            <Link 
                              key={item.path} href={item.path}
                              className={`flex items-center gap-3 px-4 py-2 rounded-xl transition-all duration-200 group ${
                                isActive 
                                  ? "bg-rose-50 text-rose-600 font-black shadow-sm" 
                                  : "text-slate-500 hover:text-rose-600 hover:bg-slate-50"
                              }`}
                            >
                              <item.icon size={14} className={isActive ? "text-rose-600" : "group-hover:text-rose-600 transition-colors"} strokeWidth={isActive ? 2.5 : 2} />
                              <span className="text-[11px] tracking-wide">{item.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
              </>
          )}

        </nav>

        <div className="p-4 border-t border-slate-200/50 bg-white/50">
          <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95">
            <LogOut size={18} strokeWidth={2} />
            <span className="text-xs font-bold tracking-wide">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ========================================================
          2. MOBILE BOTTOM NAVIGATION BAR (IOS STYLE)
          ======================================================== */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200/50 pb-safe pt-2 px-2 z-[60] flex justify-around items-center shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
         {CORE_TABS.map((tab) => {
            const isActive = pathname === tab.path || (tab.path !== '/' && pathname.startsWith(`${tab.path}/`));
            return (
              <Link key={tab.path} href={tab.path} className="flex flex-col items-center justify-center w-full py-1 active:scale-90 transition-transform">
                <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-[#6D2158]/10 text-[#6D2158]' : 'text-slate-400'}`}>
                  <tab.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={`text-[10px] mt-1 font-bold ${isActive ? 'text-[#6D2158]' : 'text-slate-400'}`}>{tab.name}</span>
              </Link>
            )
         })}
         
         {isAdmin ? (
             <button onClick={() => setIsMobileMenuOpen(true)} className="flex flex-col items-center justify-center w-full py-1 active:scale-90 transition-transform">
                <div className={`p-1.5 rounded-xl transition-all ${isMobileMenuOpen ? 'bg-[#6D2158]/10 text-[#6D2158]' : 'text-slate-400'}`}>
                   <Menu size={22} strokeWidth={isMobileMenuOpen ? 2.5 : 2} />
                </div>
                <span className={`text-[10px] mt-1 font-bold ${isMobileMenuOpen ? 'text-[#6D2158]' : 'text-slate-400'}`}>Menu</span>
             </button>
         ) : (
             <button onClick={handleLogout} className="flex flex-col items-center justify-center w-full py-1 active:scale-90 transition-transform">
                 <div className="p-1.5 rounded-xl transition-all text-slate-400">
                    <LogOut size={22} strokeWidth={2} />
                 </div>
                 <span className="text-[10px] mt-1 font-bold text-slate-400">Sign Out</span>
             </button>
         )}
      </div>

      {/* ========================================================
          3. MOBILE MENU BOTTOM SHEET (IOS STYLE - ADMIN ONLY)
          ======================================================== */}
      {isMobileMenuOpen && isAdmin && (
         <div className="md:hidden fixed inset-0 z-[70] flex flex-col justify-end">
             <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in" onClick={() => setIsMobileMenuOpen(false)}></div>
             
             <div className="relative bg-[#FDFBFD] w-full rounded-t-[2.5rem] p-6 pb-24 shadow-2xl animate-in-up flex flex-col max-h-[85vh]">
                 <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-6"></div>
                 
                 <div className="flex justify-between items-center mb-6">
                    <Logo className="h-6 w-auto text-[#6D2158]" />
                    <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-500 active:scale-90"><X size={18}/></button>
                 </div>

                 <div className="overflow-y-auto flex-1 no-scrollbar space-y-6">
                    
                    {/* Operations */}
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3 px-2">Operations</h4>
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                          {MENU_ITEMS.map((item, idx) => (
                             <Link key={item.path} href={item.path} onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-3 p-4 active:bg-slate-50 transition-colors ${idx !== MENU_ITEMS.length - 1 ? 'border-b border-slate-50' : ''}`}>
                                 <div className="w-8 h-8 rounded-full bg-slate-50 text-[#6D2158] flex items-center justify-center"><item.icon size={16}/></div>
                                 <span className="text-sm font-bold text-slate-700">{item.name}</span>
                                 <ChevronRight size={16} className="ml-auto text-slate-300"/>
                             </Link>
                          ))}
                        </div>
                    </div>

                    {/* Team Hub */}
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3 px-2">Team Hub</h4>
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                          {TEAM_ITEMS.map((item, idx) => (
                             <Link key={item.path} href={item.path} onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-3 p-4 active:bg-blue-50 transition-colors ${idx !== TEAM_ITEMS.length - 1 ? 'border-b border-slate-50' : ''}`}>
                                 <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center"><item.icon size={16}/></div>
                                 <span className="text-sm font-bold text-slate-700">{item.name}</span>
                                 <ChevronRight size={16} className="ml-auto text-slate-300"/>
                             </Link>
                          ))}
                        </div>
                    </div>

                    {/* Minibar Hub */}
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3 px-2">Minibar</h4>
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                          {MINIBAR_ITEMS.map((item, idx) => (
                             <Link key={item.path} href={item.path} onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-3 p-4 active:bg-rose-50 transition-colors ${idx !== MINIBAR_ITEMS.length - 1 ? 'border-b border-slate-50' : ''}`}>
                                 <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center"><item.icon size={16}/></div>
                                 <span className="text-sm font-bold text-slate-700">{item.name}</span>
                                 <ChevronRight size={16} className="ml-auto text-slate-300"/>
                             </Link>
                          ))}
                        </div>
                    </div>

                    <button onClick={handleLogout} className="w-full py-4 bg-rose-50 text-rose-600 font-bold uppercase rounded-2xl tracking-widest text-xs">
                        Sign Out
                    </button>

                 </div>
             </div>
         </div>
      )}
    </>
  );
}