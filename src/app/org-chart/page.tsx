"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Maximize, ZoomIn, ZoomOut, Phone, Hash, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/PageHeader';

type Host = {
  id: string;
  full_name: string;
  host_id: string;
  role: string;
  host_level: 'DA' | 'DB' | 'ATM';
  status: string;
  image_url?: string;
  mvpn?: string;
  personal_mobile?: string;
  company_mobile?: string;
};

export default function OrgChartPage() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Canvas State
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchHosts();
    
    // Auto-scale to fit window on load (Detects mobile vs desktop)
    const handleResize = () => {
        const width = window.innerWidth;
        if (width < 768) {
            setScale(0.35); // Zoom out for phones
        } else if (width < 1400) {
            setScale(width / 1700); 
        } else {
            setScale(0.85);
        }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchHosts = async () => {
    setIsLoading(true);
    const { data } = await supabase.from('hsk_hosts').select('*').neq('status', 'Resigned');
    if (data) setHosts(data);
    setIsLoading(false);
  };

  // --- CANVAS DRAG HANDLERS ---
  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStart.current = { x: clientX - position.x, y: clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setPosition({ x: clientX - dragStart.current.x, y: clientY - dragStart.current.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  // --- SORTING & FILTERING ENGINE ---
  const sortBySeniority = (a: Host, b: Host) => {
    const aSen = a.role.toLowerCase().includes('senior') ? -1 : 1;
    const bSen = b.role.toLowerCase().includes('senior') ? -1 : 1;
    if (aSen !== bSen) return aSen - bSen;
    return a.full_name.localeCompare(b.full_name);
  };

  const safeFind = (condition: (h: Host) => boolean, defaultRole: string, level: 'DA'|'DB'|'ATM'): Host => {
    const found = hosts.find(condition);
    if (found) return found;
    return { id: `tba-${defaultRole.replace(/\s/g,'')}`, full_name: 'To Be Announced', host_id: 'TBA', role: defaultRole, host_level: level, status: 'Active' };
  };

  const activeHosts = hosts.filter(h => h.status === 'Active');

  // 1. DA LEVEL
  const execHK = safeFind(h => h.role.toLowerCase().includes('executive housekeeper') && !h.role.toLowerCase().includes('asst'), 'Executive Housekeeper', 'DA');
  const asstExec = safeFind(h => h.role.toLowerCase().includes('asst') && h.role.toLowerCase().includes('executive'), 'Asst. Executive Housekeeper', 'DA');
  
  // Specifically map Adam Thalhath or fallback to standard Landuse keywords
  const landuseMgr = safeFind(h => h.role.toLowerCase().includes('landuse') || h.role.toLowerCase().includes('garden') || h.full_name.toLowerCase().includes('adam thalhath'), 'Landuse Manager', 'DA');
  
  // 2. DB LEVEL
  const laundrySup = safeFind(h => h.host_level === 'DB' && h.role.toLowerCase().includes('laundry'), 'Laundry Supervisor', 'DB');
  const hkSups = activeHosts.filter(h => h.host_level === 'DB' && !h.role.toLowerCase().includes('laundry')).sort(sortBySeniority);

  // 3. ATM LEVEL & COORDINATOR
  const coordinator = safeFind(h => h.role.toLowerCase().includes('coordinator'), 'Housekeeping Coordinator', 'ATM');
  
  // Specific Groupings based on rules
  const gardeners = activeHosts.filter(h => h.host_level === 'ATM' && (h.role.toLowerCase().includes('garden') || h.role.toLowerCase().includes('landscap'))).sort(sortBySeniority);
  const laundryStaff = activeHosts.filter(h => h.host_level === 'ATM' && (h.role.toLowerCase().includes('laundry') || h.role.toLowerCase().includes('valet'))).sort(sortBySeniority);
  
  const paStaff = activeHosts.filter(h => h.host_level === 'ATM' && (h.role.toLowerCase().includes('public') || h.role.toLowerCase().includes('pa ') || h.role.toLowerCase().includes('runner') || h.role.toLowerCase().includes('luggage') || h.role.toLowerCase().includes('step'))).sort(sortBySeniority);
  const poolStaff = activeHosts.filter(h => h.host_level === 'ATM' && (h.role.toLowerCase().includes('pool') || h.role.toLowerCase().includes('intern'))).sort(sortBySeniority);
  const tailorStaff = activeHosts.filter(h => h.host_level === 'ATM' && (h.role.toLowerCase().includes('tailor') || h.role.toLowerCase().includes('seamstress'))).sort(sortBySeniority);
  
  // Catch housemates robustly
  const housemateStaff = activeHosts.filter(h => h.host_level === 'ATM' && (h.role.toLowerCase().includes('housemate') || h.role.toLowerCase().includes('house mate') || h.role.toLowerCase().includes('houseboy'))).sort(sortBySeniority);
  
  // Villa Attendants: Taskforce + VAs + Everyone else in ATM who wasn't caught by specific departments
  const vaStaff = activeHosts.filter(h => 
      h.host_level === 'ATM' && 
      h.id !== coordinator.id && 
      !gardeners.includes(h) && 
      !laundryStaff.includes(h) && 
      !paStaff.includes(h) &&
      !poolStaff.includes(h) &&
      !tailorStaff.includes(h) &&
      !housemateStaff.includes(h)
  ).sort(sortBySeniority);

  // Group mappings for the HK Supervisors
  const atmGroups = [
      { title: "Villa Attendants", hosts: vaStaff, color: "border-[#6D2158] text-[#6D2158]" },
      { title: "Housemates", hosts: housemateStaff, color: "border-[#6D2158] text-[#6D2158]" },
      { title: "Pool", hosts: poolStaff, color: "border-[#6D2158] text-[#6D2158]" },
      { title: "Tailor", hosts: tailorStaff, color: "border-[#6D2158] text-[#6D2158]" },
      { title: "Public Area", hosts: paStaff, color: "border-[#6D2158] text-[#6D2158]" }
  ];

  // --- UI COMPONENTS ---
  const getAvatar = (host: Host) => host.image_url || `https://ui-avatars.com/api/?name=${host.full_name}&background=${host.full_name === 'To Be Announced' ? 'e2e8f0' : '6D2158'}&color=${host.full_name === 'To Be Announced' ? '94a3b8' : 'fff'}`;

  // FixedWrapper mathematically guarantees perfect horizontal alignment and solid connection lines
  const FixedWrapper = ({ children, height, hideLine = false }: { children?: React.ReactNode, height: number, hideLine?: boolean }) => (
      <div style={{ height: `${height}px` }} className="flex flex-col items-center relative w-full">
         <div className="relative z-10 w-full flex justify-center shrink-0">{children}</div>
         {!hideLine && <div className="flex-1 w-[2px] bg-[#cbd5e1] z-0 -mb-[40px] mt-0"></div>}
      </div>
  );

  const HostNode = ({ host, isTBA = false }: { host: Host, isTBA?: boolean }) => {
    let borderColor = 'border-slate-200';
    let levelBadge = '';

    if (host.host_level === 'DA') { borderColor = 'border-amber-400'; levelBadge = 'bg-amber-100 text-amber-700'; }
    else if (host.host_level === 'DB') { borderColor = 'border-blue-400'; levelBadge = 'bg-blue-100 text-blue-700'; }
    else { borderColor = 'border-[#6D2158]'; levelBadge = 'bg-[#6D2158]/10 text-[#6D2158]'; }

    return (
      <div className={`relative flex flex-col items-center p-4 w-48 min-h-[190px] rounded-2xl shadow-md border-t-4 bg-white hover:shadow-xl hover:-translate-y-1 transition-all ${borderColor} ${isTBA ? 'opacity-60 grayscale' : ''}`}>
        <img src={getAvatar(host)} className="w-16 h-16 rounded-full border-4 border-white shadow-sm -mt-10 bg-slate-100 object-cover shrink-0" alt="Profile"/>
        <h3 className="font-black text-[13px] text-slate-800 mt-2 text-center leading-tight line-clamp-2">{host.full_name}</h3>
        <p className="text-[9px] font-bold text-slate-400 uppercase text-center mt-1 h-6 line-clamp-2 leading-tight">{host.role}</p>
        
        <div className="mt-2 text-[9px] text-slate-500 w-full text-center space-y-0.5 bg-slate-50 p-2 rounded-lg">
           {host.mvpn && <div className="font-mono font-black text-[#6D2158] flex items-center justify-center gap-1"><Hash size={10}/> {host.mvpn}</div>}
           {host.company_mobile && <div className="flex items-center justify-center gap-1"><Building2 size={10}/> {host.company_mobile}</div>}
           {host.personal_mobile && <div className="flex items-center justify-center gap-1"><Phone size={10}/> {host.personal_mobile}</div>}
        </div>

        <span className={`mt-auto pt-2 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${levelBadge}`}>{host.host_level}</span>
      </div>
    );
  };

  // Group Node - No scrollbar, expands to show entire team!
  const GroupNode = ({ title, hosts, colorClass }: { title: string, hosts: Host[], colorClass: string }) => (
    <div className={`bg-white border-t-4 rounded-2xl shadow-lg w-[260px] p-4 relative mx-auto mt-4 ${colorClass}`}>
      <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm whitespace-nowrap bg-white border ${colorClass}`}>
        {title} ({hosts.length})
      </div>
      <div className="flex flex-col gap-2 mt-4">
        {hosts.length === 0 ? (
            <p className="text-center text-xs font-bold text-slate-300 italic py-2">No Staff</p>
        ) : (
            hosts.map(h => (
               <div key={h.id} className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100 shadow-sm">
                  <img src={getAvatar(h)} className="w-10 h-10 rounded-full object-cover shadow-sm border-2 border-white shrink-0" alt="Avatar" />
                  <div className="flex-1 min-w-0 text-left">
                     <p className="text-[11px] font-black text-slate-700 truncate leading-tight">{h.full_name}</p>
                     <p className="text-[8px] font-bold text-slate-400 uppercase truncate mt-0.5">{h.role}</p>
                     <div className="flex flex-wrap gap-2 mt-1 text-[8px] text-slate-500 font-medium">
                         {h.mvpn && <span className="font-bold text-[#6D2158] bg-[#6D2158]/10 px-1 rounded">M: {h.mvpn}</span>}
                         {h.company_mobile && <span>C: {h.company_mobile}</span>}
                     </div>
                  </div>
               </div>
            ))
        )}
      </div>
    </div>
  );

  if (isLoading) return <div className="min-h-screen flex justify-center items-center"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>;

  return (
    <div className="min-h-screen bg-[#FDFBFD] flex flex-col font-antiqua overflow-hidden">
      
      {/* MAGICAL CSS FOR CSS-ONLY TREE LINES */}
      <style dangerouslySetInnerHTML={{__html: `
        .org-tree ul { display: flex; justify-content: center; align-items: flex-start; padding-top: 40px; position: relative; margin: 0; padding-left: 0; list-style: none; }
        .org-tree li { position: relative; padding: 40px 15px 0 15px; text-align: center; display: flex; flex-direction: column; align-items: center; }
        .org-tree li::before, .org-tree li::after { content: ''; position: absolute; top: 0; right: 50%; border-top: 2px solid #cbd5e1; width: 50%; height: 40px; z-index: 0; }
        .org-tree li::after { right: auto; left: 50%; border-left: 2px solid #cbd5e1; }
        
        .org-tree li:first-child::before, .org-tree li:last-child::after { border: 0 none; }
        .org-tree li:last-child::before { border-right: 2px solid #cbd5e1; border-radius: 0 12px 0 0; }
        .org-tree li:first-child::after { border-radius: 12px 0 0 0; }
        
        /* ALIGNMENT FIX FOR SINGLE CHILDREN */
        .org-tree li:only-child::after { display: none; }
        .org-tree li:only-child::before { content: ''; display: block; position: absolute; top: 0; left: 50%; border-left: 2px solid #cbd5e1; border-top: none; border-right: none; width: 0; height: 40px; z-index: 0; margin-left: -1px; right: auto; border-radius: 0; }
        .org-tree li:only-child { padding-top: 40px; }
        
        .tree-root::after { display: none; }
        .tree-root::before { display: none; }
        .tree-root { padding-top: 0 !important; }

        .org-tree ul ul::before { content: ''; position: absolute; top: 0; left: 50%; border-left: 2px solid #cbd5e1; width: 0; height: 40px; z-index: 0; margin-left: -1px; }
        .node-wrapper { display: inline-block; position: relative; z-index: 10; width: 100%; }
      `}} />

      <PageHeader title="Organizational Chart" subtitle="Housekeeping Hierarchy" />

      {/* CANVAS CONTROLS */}
      <div className="flex justify-end gap-2 p-4 bg-white border-b border-slate-200 z-20 shadow-sm relative shrink-0">
          <div className="flex bg-slate-100 p-1 rounded-lg">
              <button onClick={() => setScale(s => Math.max(0.2, s - 0.1))} className="p-2 hover:bg-white rounded text-slate-500 shadow-sm"><ZoomOut size={18}/></button>
              <div className="px-4 py-2 text-xs font-bold text-slate-600 flex items-center w-16 justify-center">{Math.round(scale * 100)}%</div>
              <button onClick={() => setScale(s => Math.min(2, s + 0.1))} className="p-2 hover:bg-white rounded text-slate-500 shadow-sm"><ZoomIn size={18}/></button>
              <button onClick={() => { setScale(1); setPosition({x:0, y:0}); }} className="p-2 hover:bg-white rounded text-slate-500 shadow-sm ml-2"><Maximize size={18}/></button>
          </div>
      </div>

      {/* DRAGGABLE & ZOOMABLE CANVAS */}
      <div 
        ref={containerRef} 
        className="flex-1 overflow-hidden bg-slate-50/50 cursor-grab active:cursor-grabbing relative touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
      >
          <div 
            className="org-tree absolute top-[5%] left-1/2 origin-top transition-transform duration-75 pb-32" 
            style={{ transform: `translate(-50%, 0) translate(${position.x}px, ${position.y}px) scale(${scale})` }}
          >
              <ul>
                  <li className="tree-root">
                      
                      {/* LEVEL 1: EXEC HK */}
                      <FixedWrapper height={200}>
                          <HostNode host={execHK} isTBA={execHK.host_id === 'TBA'} />
                      </FixedWrapper>

                      <ul>
                          {/* --- BRANCH 1: ASST EXEC (Left side of tree) --- */}
                          <li>
                              {/* LEVEL 2 */}
                              <FixedWrapper height={200}>
                                  <HostNode host={asstExec} isTBA={asstExec.host_id === 'TBA'} />
                              </FixedWrapper>
                              <ul>
                                  {/* LEVEL 3: THE COMBINED HK SUPERVISOR BLOCK */}
                                  <li>
                                      <FixedWrapper height={280}>
                                          <div className="flex flex-wrap justify-center gap-4 bg-blue-50/50 pt-8 pb-5 px-5 rounded-[2rem] border-2 border-blue-200 shadow-inner relative z-10 w-max max-w-[800px]">
                                              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-100 text-blue-800 text-[10px] font-black px-4 py-1 rounded-full uppercase tracking-widest border border-blue-200 shadow-sm whitespace-nowrap">
                                                  Housekeeping Supervisors
                                              </div>
                                              {hkSups.length > 0 ? (
                                                  hkSups.map(sup => <HostNode key={sup.id} host={sup} />)
                                              ) : (
                                                  <p className="text-slate-400 font-bold italic text-xs py-4 px-10">No HK Supervisors Assigned</p>
                                              )}
                                          </div>
                                      </FixedWrapper>
                                      <ul>
                                          {/* LEVEL 4: All Sub-Departments stemming from the Joint HK Sups */}
                                          {atmGroups.map((group, idx) => (
                                              <li key={idx}>
                                                  <FixedWrapper height={0} hideLine>
                                                      <div className="mt-4"><GroupNode title={group.title} hosts={group.hosts} colorClass={group.color} /></div>
                                                  </FixedWrapper>
                                              </li>
                                          ))}
                                      </ul>
                                  </li>

                                  {/* LEVEL 3: COORDINATOR SPACER (In the middle) */}
                                  <li>
                                      {/* Spacer dropping through Level 3 to reach Level 4 */}
                                      <FixedWrapper height={280} />
                                      <ul>
                                          <li>
                                              <FixedWrapper height={0} hideLine>
                                                  <div className="mt-4">
                                                      <HostNode host={coordinator} isTBA={coordinator.host_id === 'TBA'} />
                                                  </div>
                                              </FixedWrapper>
                                          </li>
                                      </ul>
                                  </li>

                                  {/* LEVEL 3: LAUNDRY SUP */}
                                  <li>
                                      <FixedWrapper height={280}>
                                          <HostNode host={laundrySup} isTBA={laundrySup.host_id === 'TBA'} />
                                      </FixedWrapper>
                                      <ul>
                                          <li>
                                              <FixedWrapper height={0} hideLine>
                                                  <div className="mt-4"><GroupNode title="Laundry" hosts={laundryStaff} colorClass="border-[#6D2158] text-[#6D2158]" /></div>
                                              </FixedWrapper>
                                          </li>
                                      </ul>
                                  </li>
                              </ul>
                          </li>

                          {/* --- BRANCH 2: LANDUSE MGR (Right) --- */}
                          <li>
                              {/* LEVEL 2 */}
                              <FixedWrapper height={200}>
                                  <HostNode host={landuseMgr} isTBA={landuseMgr.host_id === 'TBA'} />
                              </FixedWrapper>
                              <ul>
                                  <li>
                                      {/* L3 Spacer (Skips the supervisor row so Gardeners drop directly to ATM Level) */}
                                      <FixedWrapper height={280} />
                                      <ul>
                                          <li>
                                              <FixedWrapper height={0} hideLine>
                                                  <div className="mt-4"><GroupNode title="Garden" hosts={gardeners} colorClass="border-[#6D2158] text-[#6D2158]" /></div>
                                              </FixedWrapper>
                                          </li>
                                      </ul>
                                  </li>
                              </ul>
                          </li>

                      </ul>
                  </li>
              </ul>
          </div>
      </div>
    </div>
  );
}