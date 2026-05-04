"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { getDhakaDateStr } from '@/lib/dateUtils';
import { TOTAL_VILLAS, JETTY_A, JETTY_B, JETTY_C, BEACH, parseVillas, getDefaultArea } from '@/app/allocation/lib/constants';
import { Loader2, Search, ChevronLeft, ChevronRight, Calendar, Sparkles, User, ArrowLeftRight, Phone, Hash, Smartphone } from 'lucide-react';
import { format, parseISO, addDays, subDays, isToday } from 'date-fns';
import Image from 'next/image';

export default function PublicDashboard() {
    const [isLoading, setIsLoading] = useState(true);
    const [allocations, setAllocations] = useState<any[]>([]);
    const [prevAllocations, setPrevAllocations] = useState<any[]>([]);
    const [hosts, setHosts] = useState<any[]>([]);
    const [masterList, setMasterList] = useState<any[]>([]);
    
    const [selectedDate, setSelectedDate] = useState(getDhakaDateStr());
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            const prevDate = format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd');

            const [allocRes, prevAllocRes, hostsRes, summaryRes] = await Promise.all([
                supabase.from('hsk_allocations').select('*').eq('report_date', selectedDate),
                supabase.from('hsk_allocations').select('*').eq('report_date', prevDate),
                supabase.from('hsk_hosts').select('*'),
                supabase.from('hsk_daily_summary').select('*').eq('report_date', selectedDate)
            ]);
            
            setAllocations(allocRes.data || []);
            setPrevAllocations(prevAllocRes.data || []);
            setHosts(hostsRes.data || []);
            setMasterList(summaryRes.data || []);
            setIsLoading(false);
        };
        fetchData();
    }, [selectedDate]);

    // --- AUTO SCROLL ON SEARCH ---
    useEffect(() => {
        if (searchQuery.trim() !== '') {
            setTimeout(() => {
                const query = searchQuery.trim();
                const el = document.getElementById(`villa-row-${query}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('ring-4', 'ring-amber-400/50', 'bg-amber-50');
                    setTimeout(() => el.classList.remove('ring-4', 'ring-amber-400/50', 'bg-amber-50'), 2000);
                }
            }, 300);
        }
    }, [searchQuery]);

    // --- DATE NAVIGATION ---
    const handlePrevDay = () => setSelectedDate(format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'));
    const handleNextDay = () => setSelectedDate(format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'));

    // --- DATA PROCESSING ---
    const yesterdayVillaMap = useMemo(() => {
        const map: Record<string, string> = {};
        prevAllocations.forEach((alloc: any) => {
            if (alloc.area === 'villa') {
                const villas = parseVillas(alloc.task_details || '');
                villas.forEach((v: number | string) => {
                    map[String(v)] = String(alloc.host_id);
                });
            }
        });
        return map;
    }, [prevAllocations]);

    const getVillaData = (vNum?: number) => {
        if (!vNum) return null;
        const match = masterList.find((r: any) => parseInt(r.villa_number) === vNum);
        const st = match?.status?.toUpperCase() || 'VAC';
        
        let colorClass = 'text-slate-500'; 
        let shortStatus = st;
        let timeStr = '';

        if (st.includes('ARR')) { colorClass = 'text-emerald-600'; if(match?.arrival_time) timeStr = match.arrival_time; }
        else if (st.includes('VAC') || st === 'VM/VAC') { colorClass = 'text-sky-600'; shortStatus = 'VAC'; }
        else if (st.includes('TMA')) { colorClass = 'text-amber-600'; }
        else if (st.includes('DEP')) { colorClass = 'text-rose-600'; if(match?.departure_time) timeStr = match.departure_time; }

        return { status: shortStatus, colorClass, timeStr };
    };

    // AVATAR GENERATOR
    const getAvatarColor = (name: string) => {
        const colors = ['bg-rose-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    const hostGroups = { jettyA: [] as any[], jettyB: [] as any[], jettyC: [] as any[], beach: [] as any[] };

    allocations.forEach((alloc: any) => {
        if (alloc.area !== 'villa') return;
        const host = hosts.find((h: any) => String(h.id) === String(alloc.host_id));
        if (!host) return;

        const myVillas = parseVillas(alloc.task_details || '').map(String).filter((v: string) => v !== '');
        if (myVillas.length === 0) return;

        // ⚡ MAJORITY RULES LOGIC: Count which jetty has the most rooms for this attendant
        const counts = { jettyA: 0, jettyB: 0, jettyC: 0, beach: 0 };

        myVillas.forEach((vStr: string) => {
            const vNum = parseInt(vStr, 10);
            if (isNaN(vNum)) return;

            if (vNum >= 1 && vNum <= 35) counts.jettyA++;
            else if (vNum >= 37 && vNum <= 50) counts.jettyB++;
            else if (vNum >= 59 && vNum <= 79) counts.jettyC++;
            else counts.beach++; // Everything else (up to 97) is beach
        });

        // Find the category with the highest count
        let targetJetty = 'jettyA';
        let maxCount = -1;
        for (const [jetty, count] of Object.entries(counts)) {
            if (count > maxCount) {
                maxCount = count;
                targetJetty = jetty;
            }
        }

        hostGroups[targetJetty as keyof typeof hostGroups].push(host);
    });

    const isPublished = allocations.filter((a: any) => a.area === 'villa' && a.task_details?.trim() !== '').length > 0;

    // Helper to pad arrays with 'null' values so the grid columns are always filled perfectly
    const padArray = (arr: any[], length: number) => {
        const padded = [...arr];
        while (padded.length < length) {
            padded.push(null);
        }
        return padded;
    };

    // Find the maximum number of villas assigned to ANY host today so we can pad all cards identically
    let globalMaxVillas = 8;
    hostGroups.jettyA.concat(hostGroups.jettyB, hostGroups.jettyC, hostGroups.beach).forEach((host: any) => {
        const alloc = allocations.find((a: any) => String(a.host_id) === String(host.id));
        const myVillas = parseVillas(alloc?.task_details || '').map(String).filter((v: string) => v !== '');
        if (myVillas.length > globalMaxVillas) globalMaxVillas = myVillas.length;
    });

    const paddedJettyA = padArray(hostGroups.jettyA, 7);
    const paddedJettyB = padArray(hostGroups.jettyB, 3);
    const paddedJettyC = padArray(hostGroups.jettyC, 4);
    const paddedBeach = padArray(hostGroups.beach, 7);

    const renderDashboardCard = (host: any, key: string, themeColor: string, themeBg: string, themeText: string) => {
        // RENDERING EMPTY PLACEHOLDER CARD
        if (!host) {
            return (
                <div key={key} className="flex flex-col w-full h-full bg-slate-50/40 rounded-2xl overflow-hidden border border-slate-200 border-dashed opacity-60">
                    <div className="p-3 border-b border-slate-200 flex flex-col gap-2 bg-slate-100/50 min-h-[92px]">
                        {/* Empty Name Blocks */}
                        <div className="flex flex-col gap-1.5 w-full">
                            <div className="h-4 w-3/4 bg-slate-200 rounded"></div>
                            <div className="h-2 w-1/2 bg-slate-200 rounded"></div>
                        </div>
                        {/* Empty Avatar & Contacts */}
                        <div className="flex items-center gap-3 mt-1">
                            <div className="w-10 h-10 rounded-[0.8rem] bg-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                                <User size={18} />
                            </div>
                            <div className="flex flex-col gap-1.5 w-full">
                                <div className="h-2 w-full bg-slate-200 rounded"></div>
                                <div className="h-2 w-2/3 bg-slate-200 rounded"></div>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col flex-1 p-2 gap-1 bg-slate-50/20">
                        <div className="grid grid-cols-5 text-[9px] font-black uppercase tracking-widest text-slate-300 px-2 py-1">
                            <div className="col-span-2">Villa</div>
                            <div className="col-span-3 text-right">Status</div>
                        </div>
                        {Array.from({ length: globalMaxVillas }).map((_, i) => (
                            <div key={`empty-row-${i}`} className="grid grid-cols-5 items-center px-3 py-2 rounded-xl bg-slate-100/30 border border-slate-100/50 min-h-[34px]">
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        // RENDERING ACTUAL HOST CARD
        const alloc = allocations.find((a: any) => String(a.host_id) === String(host.id));
        const myVillas = parseVillas(alloc?.task_details || '').map(String).filter((s: string) => s !== '');
        
        const nickname = host.nicknames ? host.nicknames.split(',')[0].trim() : host.full_name.split(' ')[0];
        const fullName = host.full_name;
        const initials = nickname.substring(0, 2).toUpperCase();
        const avatarFallbackColor = getAvatarColor(nickname);
        const hasHighlightedVilla = searchQuery && myVillas.some((v: string) => v === searchQuery.trim());

        // Pad the villas array to match the global max length exactly
        const paddedVillas = Array.from({ length: globalMaxVillas }).map((_, i) => myVillas[i] || '');

        return (
            <div key={key} className={`flex flex-col w-full h-full bg-white rounded-2xl overflow-hidden shadow-sm border transition-all duration-300 ${hasHighlightedVilla ? 'border-amber-400 ring-4 ring-amber-400/20 scale-[1.02] z-10 highlighted-villa-card' : `border-slate-200 hover:shadow-md hover:border-${themeColor}`}`}>
                
                {/* Host Header - UPDATED LAYOUT */}
                <div className={`p-3 border-b border-slate-100 flex flex-col gap-2 bg-gradient-to-br from-white to-slate-50`}>
                    
                    {/* Names on Top (Full Width) */}
                    <div className="flex flex-col w-full min-w-0">
                        <span className="text-base font-black text-slate-800 leading-tight break-words line-clamp-2" title={nickname}>{nickname}</span>
                        <span className="text-[10px] font-bold text-slate-400 leading-tight mt-0.5 truncate" title={fullName}>{fullName}</span>
                    </div>

                    {/* Avatar & Contact Below */}
                    <div className="flex items-center gap-3 mt-1">
                        <div className={`relative w-10 h-10 rounded-[0.8rem] flex items-center justify-center text-white font-black text-xs shadow-sm shrink-0 overflow-hidden ${host.image_url ? 'bg-slate-100 border border-slate-200' : avatarFallbackColor}`}>
                            {host.image_url ? (
                                <Image src={host.image_url} alt={nickname} fill className="object-cover" sizes="40px" />
                            ) : initials}
                        </div>
                        <div className="flex flex-col gap-1 min-w-0">
                            {host.company_mobile && (
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 truncate">
                                    <Phone size={10} className={themeText} /> {host.company_mobile}
                                </div>
                            )}
                            {host.mvpn && (
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 truncate">
                                    <Hash size={10} className={themeText} /> {host.mvpn}
                                </div>
                            )}
                            {host.personal_mobile && (
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 truncate">
                                    <Smartphone size={10} className={themeText} /> {host.personal_mobile}
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                {/* Villas List */}
                <div className="flex flex-col flex-1 p-2 gap-1 bg-slate-50/50">
                    <div className="grid grid-cols-5 text-[9px] font-black uppercase tracking-widest text-slate-400 px-2 py-1">
                        <div className="col-span-2">Villa</div>
                        <div className="col-span-3 text-right">Status</div>
                    </div>
                    
                    {paddedVillas.map((v: string, i: number) => {
                        // Render Empty Placeholder Row
                        if (!v) {
                            return (
                                <div key={`empty-${i}`} className="grid grid-cols-5 items-center px-3 py-2 rounded-xl bg-white/40 border border-slate-100 min-h-[34px]">
                                    <div className="col-span-2"></div>
                                    <div className="col-span-3"></div>
                                </div>
                            );
                        }

                        // Render Actual Villa Row
                        const vNum = parseInt(v, 10);
                        const data = !isNaN(vNum) ? getVillaData(vNum) : null;
                        const isHighlighted = searchQuery && v === searchQuery.trim();
                        const wasChanged = yesterdayVillaMap[v] && yesterdayVillaMap[v] !== String(host.id);
                        
                        return (
                            <div id={`villa-row-${v}`} key={i} className={`grid grid-cols-5 items-center px-3 py-2 rounded-xl transition-all duration-500 ${isHighlighted ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-white border border-slate-100 min-h-[34px]'}`}>
                                <div className="col-span-2 flex items-center gap-1.5">
                                    <span className={`font-black text-sm ${isHighlighted ? 'text-amber-900' : 'text-slate-700'}`}>{v}</span>
                                    {wasChanged && (
                                        <span className="flex items-center justify-center bg-purple-100 text-purple-600 rounded p-0.5" title="Reassigned from yesterday">
                                            <ArrowLeftRight size={10}/>
                                        </span>
                                    )}
                                </div>
                                <div className={`col-span-3 text-right flex flex-col items-end justify-center text-[10px] font-bold leading-tight ${isHighlighted ? 'text-amber-800' : data?.colorClass || 'text-slate-400'}`}>
                                    <span>{data?.status || 'N/A'}</span>
                                    {data?.timeStr && <span className="text-[8px] opacity-70 leading-none mt-0.5">@{data.timeStr}</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[50] overflow-y-auto overflow-x-auto bg-slate-50 font-sans pb-20 custom-scrollbar">
            
            {/* STICKY HEADER */}
            <div className="sticky top-0 z-50 bg-[#6D2158] text-white shadow-xl min-w-[1400px]">
                <div className="px-8 py-4 flex flex-row gap-4 items-center justify-between">
                    
                    {/* Brand / Title & HK Pulse Logo */}
                    <div className="flex items-center gap-3">
                        <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm border border-white/20">
                            <svg viewBox="0 0 779.0408 559.8364" className="h-6 w-auto text-pink-300 drop-shadow-lg">
                                <g>
                                    <path fill="currentColor" d="M446.3249,154.1565c-7.1645,48.7463-10.5173,97.9279-15.0613,148.5227l-13.8244,153.9282c-.3069,3.4173-5.5762,7.5945-8.4078,7.3067-3.0506-.3101-7.3739-4.1613-8.0238-7.8856l-32.9782-188.9979-18.3056,50.2868-334.1757.4772c-4.158.0059-7.9278-2.9903-8.7051-5.6231-.8254-2.7956,2.2962-9.9766,6.6902-9.9796l325.2134-.2193,23.3418-69.9428c.9398-2.816,4.8921-6.2965,7.3071-6.1549s7.3561,4.0239,7.8589,6.6598l29.6772,155.5961,14.8807-155.5515,14.5905-136.2981c.2809-2.6239,2.1755-10.3733,4.7519-10.7483l10.7277-15.5614c.8189-7.7266-7.7576-10.913-13.0879-9.9415-4.4065.8032-11.3235,5.9248-12.0528,12.4835l-17.7598,159.7114c-.3191,2.8694-10.5707,2.4459-10.5734-.1849l-.2501-245.2915,61.8527-.4319,1.0441,113.9918L570.238.0704l65.6921.3899-100.0107,109.7625,106.5394,138.8418-71.9084.6198-74.999-97.936-28.7757,29.539,22.8739,146.5134,24.2284-84.3501c.6584-2.2921,4.5749-5.7373,6.7842-5.9222,2.2074-.1847,6.775,2.8888,7.7913,5.471l23.2836,59.1596,166.8207.0069c-3.479-6.3327-6.8911-11.937-9.0245-17.7921-3.6963-10.1445,1.5657-20.6071,9.5988-24.2859,8.7745-4.0183,18.424-.8301,25.2361,6.6117,6.7648-7.795,17.1264-10.4345,25.7726-5.1451,7.7731,4.7554,11.8203,16.1402,6.4511,26.4242-6.2167,11.9073-18.4522,25.0592-31.4581,29.559l-202.8377-.2423-19.568-45.8937-27.395,95.6932c-.7754,2.7085-5.2918,7.1034-7.8761,7.3902-3.2398.3595-8.2946-3.8743-8.907-7.9108l-32.2252-212.4179Z"/>
                                    <polygon fill="currentColor" points="343.4116 249.5996 291.7421 249.3681 291.5403 150.0811 185.0103 150.1367 184.7339 249.7369 123.407 249.6255 123.4782 .1828 184.624 0 185.0213 98.2849 291.5769 97.7809 291.7613 .1355 353.5124 .3382 353.7136 219.3424 343.4116 249.5996"/>
                                    <path fill="currentColor" d="M757.5278,473.4462l-87.5517.5215.0463,67.2512,103.6492-.0449-.0066,16.3618-121.8009-.0313-.2756-180.4659,117.7959.1358.1099,16.1483-99.4879-.0965-.1241,63.7011,85.6803.3468c1.9428,2.8477,2.1397,7.7004,1.9653,16.1721Z"/>
                                    <path fill="currentColor" d="M288.1135,377.7922l18.0816-.2947-.5409,115.7788c-.0982,21.021-9.8277,42.483-27.5179,54.0608-25.3532,16.5931-60.0694,16.7763-85.3435-.115-17.5004-11.6959-27.12-33.3207-27.2318-54.4116l-.6095-114.984,17.9897-.2039,1.2298,118.0705c.2984,28.648,23.3414,46.058,50.1972,46.5803,29.2568.569,53.2062-19.0568,53.3199-49.7185l.4255-114.7628Z"/>
                                    <path fill="currentColor" d="M80.942,495.7405c-20.5601,2.9274-40.4425,1.3546-62.482,1.1356l-.4798,60.1896-17.8739-.2755-.1063-179.4095c25.4379-.2739,51.1778-.857,76.1557.7138,33.1766,2.0864,54.4285,27.116,54.336,58.9226-.0868,29.8411-17.8761,54.2136-49.5497,58.7234ZM112.8012,435.9662c-1.5988-53.072-61.7208-41.1317-94.6485-42.2686l.1722,86.8255c20.3889.0232,38.1689.5732,56.3045-.881,23.4086-1.8771,38.8952-19.662,38.1717-43.6759Z"/>
                                    <path fill="currentColor" d="M489.5993,537.7297c-1.5288-4.3604,2.0379-12.9604,4.9815-16.4828,23.7972,19.5208,54.528,27.7196,83.2839,17.6539,12.2654-4.2934,19.3082-15.1022,19.64-26.5478,1.0952-37.7761-65.8095-30.546-92.437-56.7106-12.128-11.9172-14.1085-28.7605-9.8061-45.0677,11.2687-42.7111,80.8481-42.382,113.2302-20.809-1.3807,6.0145-3.042,10.9922-5.2268,15.8878-22.334-12.511-45.8544-17.4775-69.5368-10.2088-12.917,3.9645-21.0138,14.2578-21.8392,26.5353-.8559,12.7304,7.5603,24.6303,21.0232,29.0818l50.3752,16.6562c20.0579,6.632,32.4612,22.8579,32.5008,42.6709.0391,19.5797-11.2835,36.7803-31.2853,43.8924-31.4059,11.1671-67.4314,5.4102-94.9037-16.5515Z"/>
                                    <path fill="currentColor" d="M471.7684,540.9736c.5889,5.2165.6534,10.1802.2602,16.5435l-112.8218.0037-.1418-179.3732,18.4355-.5393.0973,163.3538,94.1706.0115Z"/>
                                </g>
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-xl font-black tracking-tight leading-tight">Housekeeping Villa Attendants</h1>
                            <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest flex items-center gap-1">
                                <Sparkles size={10}/> Daily Allocation
                            </p>
                        </div>
                    </div>

                    {/* Controls Row */}
                    <div className="flex items-center gap-4">
                        {/* Search Bar */}
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input 
                                type="text" 
                                placeholder="Search Villa No..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl text-slate-800 font-bold text-sm outline-none focus:ring-4 focus:ring-pink-500/30 transition-all shadow-sm placeholder:text-slate-400"
                            />
                        </div>

                        {/* Date Navigator */}
                        <div className="flex items-center bg-white/10 rounded-xl p-1 backdrop-blur-sm border border-white/20">
                            <button onClick={handlePrevDay} className="p-2 hover:bg-white/20 rounded-lg transition-colors active:scale-95"><ChevronLeft size={18}/></button>
                            <div className="flex items-center gap-2 px-4 cursor-pointer relative">
                                <Calendar size={14} className="text-pink-300"/>
                                <span className="font-black text-sm tracking-wide">
                                    {isToday(parseISO(selectedDate)) ? 'Today' : format(parseISO(selectedDate), 'MMM dd, yyyy')}
                                </span>
                                <input 
                                    type="date" 
                                    value={selectedDate}
                                    onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                />
                            </div>
                            <button onClick={handleNextDay} className="p-2 hover:bg-white/20 rounded-lg transition-colors active:scale-95"><ChevronRight size={18}/></button>
                        </div>
                    </div>
                </div>
            </div>

            {/* MAIN DASHBOARD CONTENT */}
            <div className="px-8 mt-8 min-w-[1400px]">
                
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-4">
                        <Loader2 className="animate-spin text-[#6D2158]" size={40}/>
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing Directory...</p>
                    </div>
                ) : !isPublished ? (
                    // EMPTY STATE (NOT PUBLISHED)
                    <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-12 text-center max-w-2xl mx-auto mt-12 flex flex-col items-center">
                        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center border-8 border-slate-100 mb-6">
                            <Calendar size={40} className="text-slate-300"/>
                        </div>
                        <h2 className="text-2xl font-black text-slate-800 mb-2">
                            {isToday(parseISO(selectedDate)) ? "Today's Allocation Pending" : `Allocation Not Set for ${format(parseISO(selectedDate), 'MMM do')}`}
                        </h2>
                        <p className="text-slate-500 font-medium max-w-md">
                            The Housekeeping Coordinators have not yet published the allocations for <strong className="text-slate-700">{format(parseISO(selectedDate), 'EEEE, MMMM do, yyyy')}</strong>.
                        </p>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-8">Please check back later or select another date.</p>
                    </div>
                ) : (
                    // DASHBOARD STRICT 7-COLUMN GRID
                    <div className="flex flex-col gap-10 w-full">
                        
                        {/* Jetty A Section (Row 1 - Full 7 Columns) */}
                        <section className="w-full">
                            <div className="bg-[#6D2158] text-white py-2 px-4 rounded-xl mb-4 shadow-sm flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-white/50 shadow-sm"></span>
                                <h3 className="text-sm font-black uppercase tracking-widest">Jetty A</h3>
                            </div>
                            <div className="grid grid-cols-7 gap-4">
                                {paddedJettyA.map((host: any, i: number) => renderDashboardCard(host, `A-${i}`, 'pink-300', 'bg-[#6D2158]', 'text-pink-600'))}
                            </div>
                        </section>

                        {/* Jetty B & Jetty C Section (Row 2 - 3 Cols + 4 Cols = 7 Cols) */}
                        <div className="grid grid-cols-7 gap-4 w-full">
                            
                            {/* Jetty B (3 Columns) */}
                            <section className="col-span-3 flex flex-col">
                                <div className="bg-emerald-500 text-white py-2 px-4 rounded-xl mb-4 shadow-sm flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-white/50 shadow-sm"></span>
                                    <h3 className="text-sm font-black uppercase tracking-widest">Jetty B</h3>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    {paddedJettyB.map((host: any, i: number) => renderDashboardCard(host, `B-${i}`, 'emerald-500', 'bg-emerald-500', 'text-emerald-500'))}
                                </div>
                            </section>

                            {/* Jetty C (4 Columns) */}
                            <section className="col-span-4 flex flex-col">
                                <div className="bg-blue-500 text-white py-2 px-4 rounded-xl mb-4 shadow-sm flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-white/50 shadow-sm"></span>
                                    <h3 className="text-sm font-black uppercase tracking-widest">Jetty C</h3>
                                </div>
                                <div className="grid grid-cols-4 gap-4">
                                    {paddedJettyC.map((host: any, i: number) => renderDashboardCard(host, `C-${i}`, 'blue-500', 'bg-blue-500', 'text-blue-500'))}
                                </div>
                            </section>
                            
                        </div>

                        {/* Beach Section (Row 3 - Full 7 Columns) */}
                        <section className="w-full">
                            <div className="bg-amber-500 text-white py-2 px-4 rounded-xl mb-4 shadow-sm flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-white/50 shadow-sm"></span>
                                <h3 className="text-sm font-black uppercase tracking-widest">Beach Villas</h3>
                            </div>
                            <div className="grid grid-cols-7 gap-4">
                                {paddedBeach.map((host: any, i: number) => renderDashboardCard(host, `Beach-${i}`, 'amber-500', 'bg-amber-500', 'text-amber-500'))}
                            </div>
                        </section>

                    </div>
                )}
            </div>
        </div>
    );
}