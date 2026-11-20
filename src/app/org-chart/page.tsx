"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Maximize, ZoomIn, ZoomOut, Phone, Hash, Building2, Download, Star, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/PageHeader';
import { format } from 'date-fns';
import Image from 'next/image';
import { getProfileType, type TeamConfig } from '@/lib/hostProfile';

// Printable sheet sizes in mm (landscape) and margin.
const PAPER = { A4: { w: 297, h: 210 }, A3: { w: 420, h: 297 } } as const;
type Paper = keyof typeof PAPER;
const MARGIN_MM = 7;
const MM = 96 / 25.4; // CSS px per mm
const SHEET_HEADER_PX = 58;

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
  const [loggedInId, setLoggedInId] = useState('');
  
  // High-Performance Canvas State
  const transform = useRef({ x: 0, y: 0, scale: 1 });
  const [displayScale, setDisplayScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sessionData = localStorage.getItem('hk_pulse_session');
    if (sessionData) {
      try {
        setLoggedInId(JSON.parse(sessionData).host_id || '');
      } catch {
        // ignore
      }
    }
    fetchHosts();
  }, []);

  const fetchHosts = async () => {
    setIsLoading(true);
    const [{ data }, cfgRes] = await Promise.all([
      supabase.from('hsk_hosts').select('*').neq('status', 'Resigned'),
      supabase.from('hsk_constants').select('label').eq('type', 'team_viewer_config').limit(1),
    ]);
    let cfg: TeamConfig = {};
    try { cfg = JSON.parse(cfgRes.data?.[0]?.label || '{}'); } catch { /* none */ }
    // Shared / system logins (e.g. Pest Control) are not people: keep them off the chart.
    if (data) setHosts(data.filter((h: Host) => getProfileType(cfg, h.host_id) !== 'ACCOUNT'));
    setIsLoading(false);
  };

  // --- PRECISE AUTO FIT ON SCREEN ---
  const fitToScreen = () => {
    if (!containerRef.current || !treeRef.current) return;
    const container = containerRef.current;
    const tree = treeRef.current;

    const containerWidth = container.clientWidth - 40;
    const containerHeight = container.clientHeight - 40;

    tree.style.transform = 'none';
    const treeWidth = tree.scrollWidth || 1900;
    const treeHeight = tree.scrollHeight || 1000;

    const scaleX = containerWidth / treeWidth;
    const scaleY = containerHeight / treeHeight;
    const fitScale = Math.min(scaleX, scaleY, 1.0) * 0.95;

    const scaledWidth = treeWidth * fitScale;
    const scaledHeight = treeHeight * fitScale;

    // Center horizontally and vertically
    const posX = Math.max((container.clientWidth - scaledWidth) / 2, 10);
    const posY = Math.max((container.clientHeight - scaledHeight) / 2, 20);

    transform.current = { x: posX, y: posY, scale: fitScale };
    setDisplayScale(fitScale);
    updateTransform();
  };

  useEffect(() => {
    if (!isLoading && hosts.length > 0) {
      const timer = setTimeout(() => {
        fitToScreen();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isLoading, hosts]);

  const updateTransform = () => {
    if (treeRef.current) {
      treeRef.current.style.transform = `translate(${transform.current.x}px, ${transform.current.y}px) scale(${transform.current.scale})`;
    }
  };

  // --- PAN & ZOOM GESTURE ENGINE ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container || isLoading) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let initialPinchDist = 0;
    let initialScale = 1;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      isDragging = true;
      startX = e.clientX - transform.current.x;
      startY = e.clientY - transform.current.y;
      container.setPointerCapture(e.pointerId);
      container.style.cursor = 'grabbing';
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      transform.current.x = e.clientX - startX;
      transform.current.y = e.clientY - startY;
      updateTransform();
    };

    const onPointerUp = (e: PointerEvent) => {
      isDragging = false;
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {}
      container.style.cursor = 'grab';
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSensitivity = 0.0012;
      const delta = -e.deltaY * zoomSensitivity;
      let newScale = transform.current.scale * Math.exp(delta);
      newScale = Math.min(Math.max(0.12, newScale), 2.5);
      
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      transform.current.x = mouseX - (mouseX - transform.current.x) * (newScale / transform.current.scale);
      transform.current.y = mouseY - (mouseY - transform.current.y) * (newScale / transform.current.scale);
      transform.current.scale = newScale;

      updateTransform();
      setDisplayScale(newScale);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        isDragging = false;
        initialPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialScale = transform.current.scale;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const delta = dist / initialPinchDist;
        let newScale = Math.min(Math.max(0.12, initialScale * delta), 2.5);
        transform.current.scale = newScale;
        updateTransform();
        setDisplayScale(newScale);
      }
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
    };
  }, [isLoading]);

  const handleZoomBtn = (delta: number) => {
    let newScale = Math.min(Math.max(0.12, transform.current.scale + delta), 2.5);
    transform.current.scale = newScale;
    updateTransform();
    setDisplayScale(newScale);
  };

  // --- ONE-PAGE LANDSCAPE PRINT / PDF ---
  // A hidden copy of the chart lives in a print-only sheet (portal on <body>). Before printing we
  // measure it and set CSS `zoom` so it fills exactly one landscape page. Output stays vector (sharp).
  const [paper, setPaper] = useState<Paper>('A4');
  const printTreeRef = useRef<HTMLDivElement>(null);

  const preparePrint = useCallback(() => {
    const el = printTreeRef.current;
    if (!el) return;
    const { w, h } = PAPER[paper];
    const pageW = (w - MARGIN_MM * 2) * MM;
    const pageH = (h - MARGIN_MM * 2) * MM;
    el.style.zoom = '1';
    const treeW = el.scrollWidth || 1;
    const treeH = el.scrollHeight || 1;
    const zoom = Math.min(pageW / treeW, (pageH - SHEET_HEADER_PX - 8) / treeH, 2);
    el.style.zoom = String(Math.floor(zoom * 1000) / 1000);

    let tag = document.getElementById('org-print-page');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'org-print-page';
      document.head.appendChild(tag);
    }
    tag.textContent = `@media print {
      @page { size: ${paper} landscape; margin: ${MARGIN_MM}mm; }
      #org-print-root .print-sheet { width: ${pageW.toFixed(1)}px; height: ${(pageH - 4).toFixed(1)}px; }
    }`;
  }, [paper]);

  useEffect(() => {
    window.addEventListener('beforeprint', preparePrint); // also covers Ctrl/Cmd+P
    return () => window.removeEventListener('beforeprint', preparePrint);
  }, [preparePrint]);

  const handlePrint = () => {
    preparePrint();
    window.print();
  };

  // --- SORTING & FILTERING ---
  const sortBySeniority = (a: Host, b: Host) => {
    const aSen = a.role.toLowerCase().includes('senior') ? -1 : 1;
    const bSen = b.role.toLowerCase().includes('senior') ? -1 : 1;
    if (aSen !== bSen) return aSen - bSen;
    return a.full_name.localeCompare(b.full_name);
  };

  const safeFind = (condition: (h: Host) => boolean, defaultRole: string, level: 'DA' | 'DB' | 'ATM'): Host => {
    const found = hosts.find(condition);
    if (found) return found;
    return {
      id: `tba-${defaultRole.replace(/\s/g, '')}`,
      full_name: 'To Be Announced',
      host_id: 'TBA',
      role: defaultRole,
      host_level: level,
      status: 'Active',
    };
  };

  const activeHosts = hosts.filter(h => h.status === 'Active');

  const execHK = safeFind(h => h.role.toLowerCase().includes('executive housekeeper') && !h.role.toLowerCase().includes('asst'), 'Executive Housekeeper', 'DA');
  const asstExec = safeFind(h => h.role.toLowerCase().includes('asst') && h.role.toLowerCase().includes('executive'), 'Asst. Executive Housekeeper', 'DA');
  const landuseMgr = safeFind(h => h.role.toLowerCase().includes('landuse') || h.role.toLowerCase().includes('sustainab') || h.full_name.toLowerCase().includes('adam thalhath'), 'Sustainability Manager', 'DA');
  
  const laundrySup = safeFind(h => h.host_level === 'DB' && h.role.toLowerCase().includes('laundry'), 'Laundry Supervisor', 'DB');
  // Garden Supervisor reports to the Landscaping / Land Use Manager, not to Housekeeping
  const isGardenRole = (h: Host) => /garden|landscap/i.test(h.role || '');
  const gardenSups = activeHosts.filter(h => h.host_level === 'DB' && isGardenRole(h)).sort(sortBySeniority);
  const hkSups = activeHosts.filter(h => h.host_level === 'DB' && !h.role.toLowerCase().includes('laundry') && !isGardenRole(h)).sort(sortBySeniority);

  const coordinator = safeFind(h => h.role.toLowerCase().includes('coordinator'), 'Housekeeping Coordinator', 'ATM');
  
  const gardeners = activeHosts.filter(h => h.host_level === 'ATM' && (h.role.toLowerCase().includes('garden') || h.role.toLowerCase().includes('landscap'))).sort(sortBySeniority);
  const laundryStaff = activeHosts.filter(h => h.host_level === 'ATM' && (h.role.toLowerCase().includes('laundry') || h.role.toLowerCase().includes('valet'))).sort(sortBySeniority);
  const paStaff = activeHosts.filter(h => h.host_level === 'ATM' && (h.role.toLowerCase().includes('public') || h.role.toLowerCase().includes('pa ') || h.role.toLowerCase().includes('runner') || h.role.toLowerCase().includes('luggage') || h.role.toLowerCase().includes('step'))).sort(sortBySeniority);
  const poolStaff = activeHosts.filter(h => h.host_level === 'ATM' && (h.role.toLowerCase().includes('pool') || h.role.toLowerCase().includes('intern'))).sort(sortBySeniority);
  const tailorStaff = activeHosts.filter(h => h.host_level === 'ATM' && (h.role.toLowerCase().includes('tailor') || h.role.toLowerCase().includes('seamstress'))).sort(sortBySeniority);
  const housemateStaff = activeHosts.filter(h => h.host_level === 'ATM' && (h.role.toLowerCase().includes('housemate') || h.role.toLowerCase().includes('house mate') || h.role.toLowerCase().includes('houseboy'))).sort(sortBySeniority);
  
  const vaStaff = activeHosts.filter(h => 
    h.host_level === 'ATM' && h.id !== coordinator.id && !gardeners.includes(h) && !laundryStaff.includes(h) && !paStaff.includes(h) && !poolStaff.includes(h) && !tailorStaff.includes(h) && !housemateStaff.includes(h)
  ).sort(sortBySeniority);

  const atmGroups = [
    { title: "Villa Attendants", hosts: vaStaff, color: "border-[#6D2158] text-[#6D2158]" },
    { title: "Housemates", hosts: housemateStaff, color: "border-[#6D2158] text-[#6D2158]" },
    { title: "Pool", hosts: poolStaff, color: "border-[#6D2158] text-[#6D2158]" },
    { title: "Tailor", hosts: tailorStaff, color: "border-[#6D2158] text-[#6D2158]" },
    { title: "Public Area", hosts: paStaff, color: "border-[#6D2158] text-[#6D2158]" }
  ];

  // High-Resolution Avatars (256px uncompressed for crisp vectors)
  const getAvatar = (host: Host) => {
    if (host.image_url) return host.image_url;
    const nameEnc = encodeURIComponent(host.full_name || 'Staff');
    const bg = host.full_name === 'To Be Announced' ? 'e2e8f0' : '6D2158';
    const color = host.full_name === 'To Be Announced' ? '94a3b8' : 'ffffff';
    return `https://ui-avatars.com/api/?name=${nameEnc}&background=${bg}&color=${color}&size=256&bold=true`;
  };

  const FixedWrapper = ({ children, height, hideLine = false }: { children?: React.ReactNode; height: number; hideLine?: boolean }) => (
    <div style={{ height: `${height}px` }} className="flex flex-col items-center relative w-full">
      <div className="relative z-10 w-full flex justify-center shrink-0">{children}</div>
      {!hideLine && <div className="flex-1 w-[2px] bg-[#cbd5e1] z-0 -mb-[36px] mt-0 print:bg-slate-400" />}
    </div>
  );

  const HostNode = ({ host, isTBA = false, print = false }: { host: Host; isTBA?: boolean; print?: boolean }) => {
    const isMe = !print && host.host_id === loggedInId;
    let borderColor = 'border-slate-200';
    let levelBadge = '';

    if (host.host_level === 'DA') {
      borderColor = 'border-amber-400';
      levelBadge = 'bg-amber-100 text-amber-700';
    } else if (host.host_level === 'DB') {
      borderColor = 'border-blue-400';
      levelBadge = 'bg-blue-100 text-blue-700';
    } else {
      borderColor = 'border-[#6D2158]';
      levelBadge = 'bg-[#6D2158]/10 text-[#6D2158]';
    }

    return (
      <div className={`relative flex flex-col items-center p-3.5 w-40 min-h-[175px] rounded-2xl shadow-sm border-t-4 bg-white transition-all print:shadow-none print:border-slate-300 print:border-2 ${borderColor} ${isTBA ? 'opacity-60 grayscale' : ''} ${isMe ? 'ring-4 ring-amber-400 bg-amber-50 scale-105 z-20 shadow-xl' : ''}`}>
        {isMe && (
          <div className="absolute -top-3 -right-3 bg-amber-400 text-white p-1.5 rounded-full shadow-md print:hidden">
            <Star size={16} fill="currentColor" />
          </div>
        )}
        
        <div className="w-14 h-14 rounded-full border-4 border-white shadow-sm -mt-8 bg-slate-100 overflow-hidden shrink-0 relative print:border-2 print:border-slate-300">
          <Image 
            src={getAvatar(host)} 
            alt={host.full_name}
            fill
            sizes="128px"
            quality={100}
            unoptimized={true}
            loading="eager"
            className="object-cover"
          />
        </div>

        <h3 className={`font-black text-[11px] mt-1.5 text-center leading-tight line-clamp-2 ${isMe ? 'text-[#6D2158]' : 'text-slate-800'}`}>
          {host.full_name}
        </h3>
        <p className="text-[8px] font-bold text-slate-400 uppercase text-center mt-0.5 h-4 line-clamp-1 leading-tight">
          {host.role}
        </p>
        
        <div className={`mt-1 text-[8px] w-full text-center space-y-0.5 p-1 rounded-lg print:bg-transparent ${isMe ? 'bg-white/60 text-slate-700' : 'bg-slate-50 text-slate-500'}`}>
          {host.mvpn && <div className="font-mono font-black text-[#6D2158] flex items-center justify-center gap-0.5"><Hash size={8}/> {host.mvpn}</div>}
          {host.company_mobile && <div className="flex items-center justify-center gap-0.5"><Building2 size={8}/> {host.company_mobile}</div>}
          {host.personal_mobile && <div className="flex items-center justify-center gap-0.5"><Phone size={8}/> {host.personal_mobile}</div>}
        </div>

        <span className={`mt-auto pt-1 px-1.5 py-0.5 rounded text-[7.5px] font-black uppercase tracking-widest ${levelBadge} print:bg-transparent print:border print:border-slate-300`}>
          {host.host_level}
        </span>
      </div>
    );
  };

  // Big teams wrap into several columns (max 10 per column) so the chart stays wide rather than tall,
  // which is what lets it fill a landscape page.
  const GroupNode = ({ title, hosts, colorClass, print = false }: { title: string; hosts: Host[]; colorClass: string; print?: boolean }) => {
    const cols = Math.max(1, Math.ceil(hosts.length / 10));
    const rows = Math.max(1, Math.ceil(hosts.length / cols));
    return (
    <div style={{ width: `${cols * 196 + (cols - 1) * 6 + 24}px` }} className={`bg-white border-t-4 rounded-2xl shadow-sm p-3 relative mx-auto mt-3 print:shadow-none print:border-2 print:border-slate-300 ${colorClass}`}>
      <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-widest shadow-sm whitespace-nowrap bg-white border print:shadow-none ${colorClass}`}>
        {title} ({hosts.length})
      </div>
      <div className="grid gap-1.5 mt-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, auto)`, gridAutoFlow: 'column' }}>
        {hosts.length === 0 ? (
          <p className="text-center text-xs font-bold text-slate-300 italic py-2">No Staff</p>
        ) : (
          hosts.map(h => {
            const isMe = !print && h.host_id === loggedInId;
            return (
              <div key={h.id} className={`flex items-center gap-2 p-1.5 rounded-xl border shadow-2xs transition-colors print:shadow-none print:border-slate-200 ${isMe ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                <div className="w-8 h-8 rounded-full overflow-hidden shadow-2xs border-2 border-white shrink-0 relative print:border-slate-200">
                  <Image 
                    src={getAvatar(h)} 
                    alt={h.full_name} 
                    fill 
                    sizes="64px"
                    quality={100}
                    unoptimized={true}
                    loading="eager"
                    className="object-cover" 
                  />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className={`text-[9.5px] font-black truncate leading-tight flex items-center gap-1 ${isMe ? 'text-[#6D2158]' : 'text-slate-700'}`}>
                    {h.full_name} {isMe && <Star size={8} className="text-amber-500 print:hidden" fill="currentColor"/>}
                  </p>
                  <p className="text-[7.5px] font-bold text-slate-400 uppercase truncate">{h.role}</p>
                  <div className="flex flex-wrap gap-1 mt-0.5 text-[7.5px] text-slate-500 font-medium">
                    {h.mvpn && <span className="font-bold text-[#6D2158] bg-[#6D2158]/10 px-1 rounded print:bg-transparent print:border print:border-[#6D2158]">M: {h.mvpn}</span>}
                    {h.company_mobile && <span>C: {h.company_mobile}</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
    );
  };

  const renderTree = (print: boolean) => (
          <ul>
            <li className="tree-root">
              
              {/* LEVEL 1: EXEC HK */}
              <FixedWrapper height={175}>
                <HostNode print={print} host={execHK} isTBA={execHK.host_id === 'TBA'} />
              </FixedWrapper>

              <ul>
                {/* --- BRANCH 1: ASST EXEC (Left) --- */}
                <li>
                  <FixedWrapper height={175}>
                    <HostNode print={print} host={asstExec} isTBA={asstExec.host_id === 'TBA'} />
                  </FixedWrapper>
                  
                  <ul>
                    {/* LEVEL 3: COMBINED HK SUPERVISORS */}
                    <li>
                      <FixedWrapper height={260}>
                        <div className="flex flex-wrap justify-center gap-3 bg-blue-50/60 pt-6 pb-3.5 px-4 rounded-3xl border-2 border-blue-200 shadow-inner relative z-10 w-max max-w-[720px] print:bg-white print:border-2 print:shadow-none">
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-100 text-blue-800 text-[8.5px] font-black px-3.5 py-0.5 rounded-full uppercase tracking-widest border border-blue-200 shadow-2xs whitespace-nowrap print:bg-white print:border">
                            Housekeeping Supervisors
                          </div>
                          {hkSups.length > 0 ? (
                            hkSups.map(sup => <HostNode print={print} key={sup.id} host={sup} />)
                          ) : (
                            <p className="text-slate-400 font-bold italic text-xs py-3 px-8">No HK Supervisors Assigned</p>
                          )}
                        </div>
                      </FixedWrapper>

                      <ul>
                        {/* LEVEL 4: Sub-Departments under HK Sups */}
                        {atmGroups.map((group, idx) => (
                          <li key={idx}>
                            <FixedWrapper height={0} hideLine>
                              <div className="mt-2">
                                <GroupNode print={print} title={group.title} hosts={group.hosts} colorClass={group.color} />
                              </div>
                            </FixedWrapper>
                          </li>
                        ))}
                      </ul>
                    </li>

                    {/* LEVEL 3: COORDINATOR */}
                    <li>
                      <FixedWrapper height={260} />
                      <ul>
                        <li>
                          <FixedWrapper height={0} hideLine>
                            <div className="mt-2">
                              <HostNode print={print} host={coordinator} isTBA={coordinator.host_id === 'TBA'} />
                            </div>
                          </FixedWrapper>
                        </li>
                      </ul>
                    </li>

                    {/* LEVEL 3: LAUNDRY SUPERVISOR */}
                    <li>
                      <FixedWrapper height={260}>
                        <HostNode print={print} host={laundrySup} isTBA={laundrySup.host_id === 'TBA'} />
                      </FixedWrapper>
                      <ul>
                        <li>
                          <FixedWrapper height={0} hideLine>
                            <div className="mt-2">
                              <GroupNode print={print} title="Laundry" hosts={laundryStaff} colorClass="border-[#6D2158] text-[#6D2158]" />
                            </div>
                          </FixedWrapper>
                        </li>
                      </ul>
                    </li>
                  </ul>
                </li>

                {/* --- BRANCH 2: SUSTAINABILITY / LANDUSE MGR (Right) --- */}
                <li>
                  <FixedWrapper height={175}>
                    <HostNode print={print} host={landuseMgr} isTBA={landuseMgr.host_id === 'TBA'} />
                  </FixedWrapper>
                  <ul>
                    <li>
                      <FixedWrapper height={260}>
                        {gardenSups.length > 0 && (
                          <div className="flex flex-wrap justify-center gap-3">
                            {gardenSups.map(sup => <HostNode print={print} key={sup.id} host={sup} />)}
                          </div>
                        )}
                      </FixedWrapper>
                      <ul>
                        <li>
                          <FixedWrapper height={0} hideLine>
                            <div className="mt-2">
                              <GroupNode print={print} title="Garden" hosts={gardeners} colorClass="border-[#6D2158] text-[#6D2158]" />
                            </div>
                          </FixedWrapper>
                        </li>
                      </ul>
                    </li>
                  </ul>
                </li>

              </ul>
            </li>
          </ul>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <Loader2 className="animate-spin text-[#6D2158]" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBFD] flex flex-col font-sans overflow-hidden">
      
      {/* MAGICAL CSS TREE LINES & ZERO-DRIFT PRINT ENGINE */}
      <style dangerouslySetInnerHTML={{__html: `
        .org-tree ul { 
          display: flex; 
          justify-content: center; 
          align-items: flex-start; 
          padding-top: 36px; 
          position: relative; 
          margin: 0; 
          padding-left: 0; 
          list-style: none; 
        }
        .org-tree li { 
          position: relative; 
          padding: 36px 8px 0 8px; 
          text-align: center; 
          display: flex; 
          flex-direction: column; 
          align-items: center; 
        }
        .org-tree li::before, .org-tree li::after { 
          content: ''; 
          position: absolute; 
          top: 0; 
          right: 50%; 
          border-top: 2px solid #cbd5e1; 
          width: 50%; 
          height: 36px; 
          z-index: 0; 
        }
        .org-tree li::after { 
          right: auto; 
          left: 50%; 
          border-left: 2px solid #cbd5e1; 
        }
        
        .org-tree li:first-child::before, .org-tree li:last-child::after { border: 0 none; }
        .org-tree li:last-child::before { border-right: 2px solid #cbd5e1; border-radius: 0 10px 0 0; }
        .org-tree li:first-child::after { border-radius: 10px 0 0 0; }
        
        .org-tree li:only-child::after { display: none; }
        .org-tree li:only-child::before { 
          content: ''; 
          display: block; 
          position: absolute; 
          top: 0; 
          left: 50%; 
          border-left: 2px solid #cbd5e1; 
          border-top: none; 
          border-right: none; 
          width: 0; 
          height: 36px; 
          z-index: 0; 
          margin-left: -1px; 
          right: auto; 
          border-radius: 0; 
        }
        .org-tree li:only-child { padding-top: 36px; }
        
        .tree-root::after { display: none; }
        .tree-root::before { display: none; }
        .tree-root { padding-top: 0 !important; }

        .org-tree ul ul::before { 
          content: ''; 
          position: absolute; 
          top: 0; 
          left: 50%; 
          border-left: 2px solid #cbd5e1; 
          width: 0; 
          height: 36px; 
          z-index: 0; 
          margin-left: -1px; 
        }

        /* Print-only sheet: hidden (but laid out, so it can be measured) on screen. */
        #org-print-root { position: fixed; left: -100000px; top: 0; visibility: hidden; pointer-events: none; }
        #org-print-root .print-sheet { width: 1062px; height: 733px; }

        @media print {
          html, body { margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; background: white !important; }
          body > *:not(#org-print-root) { display: none !important; }
          #org-print-root { position: static !important; left: auto !important; visibility: visible !important; }
          #org-print-root, #org-print-root * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          #org-print-root .print-sheet { overflow: hidden; break-inside: avoid; page-break-after: avoid; }
          .org-tree li::before, .org-tree li::after, .org-tree ul ul::before { border-color: #64748b !important; }
        }
      `}} />

      {/* HEADER CONTROLS */}
      <div className="no-print">
        <PageHeader 
          title="Organizational Chart" 
          subtitle="Housekeeping Hierarchy" 
          actions={
            <div className="flex items-center gap-2">
              <button 
                onClick={fitToScreen} 
                className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                title="Fit to Screen"
              >
                <Maximize size={14}/> Fit Screen
              </button>
 <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/60" title="Paper size (landscape)">
                {(['A4', 'A3'] as Paper[]).map(p => (
                  <button key={p} onClick={() => setPaper(p)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${paper === p ? 'bg-white text-[#6D2158] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {p}
                  </button>
                ))}
              </div>
              <button 
                onClick={handlePrint} 
                className="flex items-center gap-1.5 bg-[#6D2158] hover:bg-[#5a1b49] text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer"
              >
                <Download size={14}/> Print / PDF ({paper} landscape)
              </button>
            </div>
          }
        />
      </div>

      {/* CANVAS ZOOM BUTTONS */}
      <div className="flex justify-end gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border-b border-slate-200/80 z-20 shadow-2xs relative shrink-0 no-print">
        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/60">
          <button 
            onClick={() => handleZoomBtn(-0.15)} 
            className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut size={16}/>
          </button>
          <div className="px-3 text-xs font-mono font-bold text-slate-700 w-14 text-center">
            {Math.round(displayScale * 100)}%
          </div>
          <button 
            onClick={() => handleZoomBtn(0.15)} 
            className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn size={16}/>
          </button>
          <button 
            onClick={fitToScreen} 
            className="p-1.5 hover:bg-white rounded-lg text-slate-600 ml-1 transition-colors cursor-pointer"
            title="Recenter Chart"
          >
            <RefreshCw size={14}/>
          </button>
        </div>
      </div>

      {/* DRAGGABLE CANVAS CONTAINER */}
      <div 
        ref={containerRef} 
        id="printable-area"
        className="flex-1 overflow-hidden bg-slate-50/50 cursor-grab active:cursor-grabbing relative touch-none select-none print:bg-white"
      >
        <div 
          ref={treeRef}
          className="org-tree absolute left-0 top-0 origin-top-left transition-transform duration-75 pb-24" 
        >
          {renderTree(false)}
        </div>
      </div>

      {/* ONE-PAGE PRINT SHEET (only visible when printing) */}
      {/* only reached after data loads, i.e. on the client */}
      {typeof document !== 'undefined' && createPortal(
        <div id="org-print-root" aria-hidden>
          <div className="print-sheet flex flex-col bg-white font-sans">
            <div className="flex items-end justify-between border-b-2 border-[#6D2158] pb-1.5 shrink-0" style={{ height: SHEET_HEADER_PX - 8 }}>
              <div>
                <h1 className="text-2xl font-black text-[#6D2158] uppercase tracking-tight leading-none">Housekeeping Organizational Chart</h1>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Six Senses Laamu · {format(new Date(), 'd MMMM yyyy')} · {hosts.length} hosts</p>
              </div>
              <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-sm bg-amber-400" /> DA</span>
                <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-sm bg-blue-400" /> DB</span>
                <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-sm bg-[#6D2158]" /> ATM</span>
              </div>
            </div>
            <div className="flex-1 min-h-0 flex items-start justify-center pt-2">
              <div ref={printTreeRef} className="org-tree w-max">
                {renderTree(true)}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
