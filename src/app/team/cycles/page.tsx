"use client";
// Housekeeping Cycle Fleet — who has which tricycle / bicycle (HK-1…20, HM-1…3, PA-1…5, Pool-1…5).
// Join date, SSL no, name and designation come live from Host Profiles; export to Excel or PDF.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bike, Search, X, Loader2, FileSpreadsheet, FileDown, Plus, Wrench, CheckCircle2, CircleDashed,
  UserPlus, UserMinus, History, Trash2, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AdminOnly from '@/components/AdminOnly';
import { getDhakaDateStr } from '@/lib/dateUtils';
import {
  GROUPS, CycleGroup, CycleStatus, CycleType, CycleUnit, FleetHost,
  loadFleet, saveFleet, loadHosts, sortFleet, suggestedGroup, buildReportRows, exportFleetExcel, exportFleetPdf,
} from '@/lib/cycleFleet';

const errMsg = (err: unknown) => (err instanceof Error ? err.message : (err as { message?: string })?.message) || 'Unknown error';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nice = (iso?: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return y && m && d ? `${d} ${MONTHS[+m - 1]} ${y}` : '—';
};

const STATUS_STYLE: Record<CycleStatus, string> = {
  Assigned: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Spare: 'bg-slate-100 text-slate-500 border-slate-200',
  Repair: 'bg-amber-50 text-amber-700 border-amber-200',
};
const GROUP_STYLE: Record<CycleGroup, string> = {
  HK: 'bg-[#6D2158] text-white',
  HM: 'bg-indigo-600 text-white',
  PA: 'bg-teal-600 text-white',
  POOL: 'bg-sky-500 text-white',
};

type Filter = 'ALL' | CycleGroup;

function CycleFleetPage() {
  const today = getDhakaDateStr();
  const [units, setUnits] = useState<CycleUnit[]>([]);
  const [hosts, setHosts] = useState<FleetHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [group, setGroup] = useState<Filter>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | CycleStatus>('ALL');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<CycleUnit | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [hostSearch, setHostSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState<'' | 'xlsx' | 'pdf'>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fleet, hs] = await Promise.all([loadFleet(), loadHosts()]);
      setUnits(fleet.units);
      setHosts(hs);
    } catch (err) {
      toast.error('Could not load fleet: ' + errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const hostMap = useMemo(() => new Map(hosts.map(h => [h.id, h])), [hosts]);
  const unitByHost = useMemo(() => {
    const m = new Map<string, CycleUnit>();
    units.forEach(u => { if (u.host_id) m.set(u.host_id, u); });
    return m;
  }, [units]);

  const counts = useMemo(() => ({
    total: units.length,
    assigned: units.filter(u => u.status === 'Assigned').length,
    spare: units.filter(u => u.status === 'Spare').length,
    repair: units.filter(u => u.status === 'Repair').length,
  }), [units]);

  const q = query.trim().toLowerCase();
  const visible = units.filter(u => {
    if (group !== 'ALL' && u.group !== group) return false;
    if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
    if (!q) return true;
    const h = u.host_id ? hostMap.get(u.host_id) : undefined;
    return [u.code, u.remarks, h?.full_name, h?.host_id, h?.role].some(v => String(v || '').toLowerCase().includes(q));
  });

  // ---------- persistence ----------
  const commit = async (next: CycleUnit[], msg: string) => {
    setSaving(true);
    const prev = units;
    setUnits(sortFleet(next));
    try {
      await saveFleet(next);
      toast.success(msg);
      return true;
    } catch (err) {
      setUnits(prev);
      toast.error('Save failed: ' + errMsg(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const closeHistory = (u: CycleUnit, end: string): CycleUnit['history'] => {
    if (!u.host_id) return u.history;
    const h = hostMap.get(u.host_id);
    return [{ host_id: u.host_id, name: h?.full_name || 'Unknown', ssl: h?.host_id || '', from: u.assigned_on, to: end }, ...u.history].slice(0, 20);
  };

  // ---------- editor ----------
  const openEdit = (u: CycleUnit) => { setEditing({ ...u }); setIsNew(false); setHostSearch(''); setConfirmDelete(false); };

  const openAdd = () => {
    const g = GROUPS.find(x => x.key === (group === 'ALL' ? 'HK' : group))!;
    const used = units.filter(u => u.group === g.key).map(u => parseInt(u.code.split('-')[1] || '0', 10));
    const n = (used.length ? Math.max(...used) : 0) + 1;
    setEditing({ code: `${g.prefix}-${n}`, group: g.key, type: g.type, host_id: null, assigned_on: '', status: 'Spare', remarks: '', history: [] });
    setIsNew(true);
    setHostSearch('');
    setConfirmDelete(false);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const code = editing.code.trim();
    if (!/^[A-Za-z]+-\d+$/.test(code)) { toast.error('Cycle number must look like HK-21'); return; }
    if (isNew && units.some(u => u.code.toLowerCase() === code.toLowerCase())) { toast.error(`${code} already exists`); return; }

    const original = units.find(u => u.code === editing.code);
    let next = units.filter(u => u.code !== editing.code);
    let unit: CycleUnit = { ...editing, code, remarks: editing.remarks.trim() };

    const hostChanged = (original?.host_id || null) !== (unit.host_id || null);
    if (hostChanged && original) unit.history = closeHistory(original, today);
    if (unit.host_id && !unit.assigned_on) unit.assigned_on = today;
    if (!unit.host_id) { unit.assigned_on = ''; if (unit.status === 'Assigned') unit.status = 'Spare'; }
    if (unit.host_id && unit.status === 'Spare') unit.status = 'Assigned';

    // One cycle per host: release whatever they had before
    let movedFrom = '';
    if (unit.host_id) {
      next = next.map(u => {
        if (u.host_id !== unit.host_id) return u;
        movedFrom = u.code;
        return { ...u, history: closeHistory(u, today), host_id: null, assigned_on: '', status: u.status === 'Repair' ? 'Repair' : 'Spare' };
      });
    }
    unit = { ...unit };
    next = [...next, unit];

    const who = unit.host_id ? hostMap.get(unit.host_id)?.full_name : '';
    const ok = await commit(next, movedFrom ? `${who} moved from ${movedFrom} to ${unit.code}` : isNew ? `${unit.code} added` : `${unit.code} saved`);
    if (ok) setEditing(null);
  };

  const deleteUnit = async () => {
    if (!editing) return;
    const ok = await commit(units.filter(u => u.code !== editing.code), `${editing.code} removed`);
    if (ok) setEditing(null);
  };

  // Host picker list: suggested group first, then everyone; inactive hosts hidden
  const pickerHosts = useMemo(() => {
    if (!editing) return [];
    const s = hostSearch.trim().toLowerCase();
    return hosts
      .filter(h => !h.status || h.status.toLowerCase() === 'active')
      .filter(h => !s || h.full_name.toLowerCase().includes(s) || String(h.host_id || '').toLowerCase().includes(s) || String(h.role || '').toLowerCase().includes(s))
      .sort((a, b) => {
        const sa = suggestedGroup(a.role) === editing.group ? 0 : 1;
        const sb = suggestedGroup(b.role) === editing.group ? 0 : 1;
        return sa - sb || a.full_name.localeCompare(b.full_name);
      })
      .slice(0, s ? 60 : 30);
  }, [hosts, hostSearch, editing]);

  useEffect(() => {
    if (!editing) return;
    const o = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = o; };
  }, [editing]);

  // ---------- export ----------
  const runExport = async (kind: 'xlsx' | 'pdf') => {
    if (visible.length === 0) { toast.error('Nothing to export with these filters'); return; }
    setExporting(kind);
    try {
      const rows = buildReportRows(visible, hostMap);
      const gLabel = group === 'ALL' ? 'All groups' : GROUPS.find(g => g.key === group)!.label;
      const parts = [gLabel, statusFilter !== 'ALL' ? statusFilter : '', q ? `“${query.trim()}”` : '', nice(today)].filter(Boolean);
      const title = parts.join(' · ');
      const assigned = visible.filter(u => u.status === 'Assigned').length;
      const summary = `${visible.length} cycles · ${assigned} assigned · ${visible.filter(u => u.status === 'Spare').length} spare · ${visible.filter(u => u.status === 'Repair').length} in repair`;
      const fileBase = `HK_Cycle_Fleet_${group === 'ALL' ? 'All' : group}_${today}`;
      if (kind === 'xlsx') await exportFleetExcel(rows, title, fileBase);
      else await exportFleetPdf(rows, title, fileBase, summary);
      toast.success(kind === 'xlsx' ? 'Excel downloaded' : 'PDF downloaded');
    } catch (err) {
      toast.error('Export failed: ' + errMsg(err));
    } finally {
      setExporting('');
    }
  };

  const editHost = editing?.host_id ? hostMap.get(editing.host_id) : undefined;

  // ======================================================================================
  return (
    <div className="min-h-screen bg-slate-50 pb-32 md:pb-12">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#6D2158]/10 text-[#6D2158] flex items-center justify-center shrink-0"><Bike size={20} /></div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black text-[#6D2158] leading-tight">Cycle Fleet</h1>
            <p className="text-[11px] font-bold text-slate-400">Housekeeping tricycles &amp; bicycles</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button onClick={() => runExport('xlsx')} disabled={!!exporting || loading} className="flex-1 sm:flex-none h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs font-black text-emerald-700 hover:border-emerald-300 flex items-center justify-center gap-1.5 disabled:opacity-50">
              {exporting === 'xlsx' ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />} Excel
            </button>
            <button onClick={() => runExport('pdf')} disabled={!!exporting || loading} className="flex-1 sm:flex-none h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs font-black text-rose-700 hover:border-rose-300 flex items-center justify-center gap-1.5 disabled:opacity-50">
              {exporting === 'pdf' ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} PDF
            </button>
            <button onClick={openAdd} disabled={loading} className="flex-1 sm:flex-none h-10 px-3 rounded-xl bg-[#6D2158] text-white text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50">
              <Plus size={15} /> Add cycle
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-4 space-y-4">
        {/* Stats (tap to filter) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            ['ALL', 'Total cycles', counts.total, Bike, 'text-slate-800'],
            ['Assigned', 'Assigned', counts.assigned, CheckCircle2, 'text-emerald-600'],
            ['Spare', 'Spare', counts.spare, CircleDashed, 'text-slate-500'],
            ['Repair', 'In repair', counts.repair, Wrench, 'text-amber-600'],
          ] as const).map(([k, label, n, Icon, cls]) => (
            <button key={k} onClick={() => setStatusFilter(k)} className={`text-left rounded-2xl bg-white border p-3 transition-all ${statusFilter === k ? 'border-[#6D2158] ring-2 ring-[#6D2158]/10' : 'border-slate-200 hover:border-slate-300'}`}>
              <span className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">{label}</span>
                <Icon size={15} className={cls} />
              </span>
              <span className={`block text-2xl font-black mt-1 ${cls}`}>{loading ? '–' : n}</span>
            </button>
          ))}
        </div>

        {/* Group tabs + search */}
        <div className="flex flex-col lg:flex-row gap-2">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 lg:pb-0">
            {([{ key: 'ALL', label: 'All' }, ...GROUPS.map(g => ({ key: g.key, label: `${g.prefix} · ${g.label}` }))] as { key: Filter; label: string }[]).map(g => {
              const n = g.key === 'ALL' ? units.length : units.filter(u => u.group === g.key).length;
              return (
                <button key={g.key} onClick={() => setGroup(g.key)} className={`shrink-0 h-10 px-3.5 rounded-xl text-xs font-black border transition-all ${group === g.key ? 'bg-[#6D2158] border-[#6D2158] text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                  {g.label} <span className="opacity-60">{n}</span>
                </button>
              );
            })}
          </div>
          <div className="relative flex-1 lg:max-w-xs lg:ml-auto">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, SSL, cycle no." className="w-full h-10 pl-10 pr-9 rounded-xl bg-white border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
            {query && <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label="Clear search"><X size={15} /></button>}
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-[#6D2158]" /></div>
        ) : visible.length === 0 ? (
          <p className="py-16 text-center text-sm font-bold text-slate-400">No cycles match these filters.</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 text-left">
                      <th className="px-4 py-3">Cycle</th>
                      <th className="px-3 py-3">Join date</th>
                      <th className="px-3 py-3">SSL No</th>
                      <th className="px-3 py-3">Name</th>
                      <th className="px-3 py-3">Designation</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Remarks</th>
                      <th className="px-3 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visible.map(u => {
                      const h = u.host_id ? hostMap.get(u.host_id) : undefined;
                      return (
                        <tr key={u.code} onClick={() => openEdit(u)} className="hover:bg-purple-50/40 cursor-pointer">
                          <td className="px-4 py-2.5">
                            <span className="flex items-center gap-2">
                              <span className={`px-2 py-1 rounded-lg text-xs font-black ${GROUP_STYLE[u.group]}`}>{u.code}</span>
                              <span className="text-[10px] font-bold text-slate-400">{u.type}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap">{h ? nice(h.joining_date) : ''}</td>
                          <td className="px-3 py-2.5 text-xs font-mono font-bold text-slate-600 whitespace-nowrap">{h?.host_id || ''}</td>
                          <td className="px-3 py-2.5 font-black text-slate-800">{h?.full_name || <span className="text-xs font-bold text-slate-300">Unassigned</span>}</td>
                          <td className="px-3 py-2.5 text-xs font-semibold text-slate-500">{h?.role || ''}</td>
                          <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-md border text-[10px] font-black uppercase ${STATUS_STYLE[u.status]}`}>{u.status}</span></td>
                          <td className="px-3 py-2.5 text-xs font-semibold text-slate-600 max-w-[260px] truncate" title={u.remarks}>{u.remarks}</td>
                          <td className="px-3 py-2.5 text-slate-300"><ChevronRight size={16} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {visible.map(u => {
                const h = u.host_id ? hostMap.get(u.host_id) : undefined;
                return (
                  <button key={u.code} onClick={() => openEdit(u)} className="w-full text-left bg-white rounded-2xl border border-slate-200 p-3.5 flex items-center gap-3 active:scale-[0.99]">
                    <span className={`w-14 h-14 shrink-0 rounded-2xl flex flex-col items-center justify-center ${GROUP_STYLE[u.group]}`}>
                      <span className="text-sm font-black leading-none">{u.code}</span>
                      <span className="text-[8px] font-bold uppercase opacity-80 mt-1">{u.type}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={`text-sm font-black truncate ${h ? 'text-slate-800' : 'text-slate-300'}`}>{h?.full_name || 'Unassigned'}</span>
                        <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[9px] font-black uppercase ${STATUS_STYLE[u.status]}`}>{u.status}</span>
                      </span>
                      {h && <span className="block text-[11px] font-bold text-slate-400 truncate">{h.host_id} · {h.role} · Joined {nice(h.joining_date)}</span>}
                      {u.remarks && <span className="block text-[11px] font-semibold text-amber-700 truncate mt-0.5">{u.remarks}</span>}
                    </span>
                    <ChevronRight size={18} className="text-slate-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ===================== EDIT SHEET ===================== */}
      {editing && (
        <div className="fixed inset-0 z-[1000] flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setEditing(null)} />
          <div className="relative w-full md:max-w-lg bg-white rounded-t-[28px] md:rounded-[28px] shadow-2xl max-h-[92vh] flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="pt-2 pb-1 flex justify-center md:hidden"><span className="w-10 h-1.5 rounded-full bg-slate-200" /></div>
            <div className="px-5 pt-2 pb-3 flex items-center gap-3 border-b border-slate-100">
              <span className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center ${GROUP_STYLE[editing.group]}`}><Bike size={20} /></span>
              <div className="min-w-0 flex-1">
                {isNew ? (
                  <input value={editing.code} onChange={e => setEditing({ ...editing, code: e.target.value.toUpperCase().replace('POOL', 'Pool') })} className="w-full text-lg font-black text-slate-800 border-b border-slate-200 outline-none focus:border-[#6D2158]" />
                ) : <h3 className="text-lg font-black text-slate-800">{editing.code}</h3>}
                <p className="text-[11px] font-bold text-slate-400">{GROUPS.find(g => g.key === editing.group)?.label}</p>
              </div>
              <button onClick={() => setEditing(null)} className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center" aria-label="Close"><X size={18} /></button>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-5">
              {isNew && (
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Group</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {GROUPS.map(g => (
                      <button key={g.key} onClick={() => {
                        const used = units.filter(u => u.group === g.key).map(u => parseInt(u.code.split('-')[1] || '0', 10));
                        setEditing({ ...editing, group: g.key, type: g.type, code: `${g.prefix}-${(used.length ? Math.max(...used) : 0) + 1}` });
                      }} className={`h-10 rounded-xl text-xs font-black border-2 ${editing.group === g.key ? 'border-[#6D2158] bg-[#6D2158]/5 text-[#6D2158]' : 'border-slate-200 text-slate-500'}`}>{g.prefix}</button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Type</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['Tricycle', 'Bicycle'] as CycleType[]).map(t => (
                      <button key={t} onClick={() => setEditing({ ...editing, type: t })} className={`h-11 rounded-xl text-xs font-black border-2 ${editing.type === t ? 'border-[#6D2158] bg-[#6D2158]/5 text-[#6D2158]' : 'border-slate-200 text-slate-500'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Condition</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([['ok', 'Good'], ['Repair', 'Repair']] as const).map(([k, label]) => {
                      const on = k === 'Repair' ? editing.status === 'Repair' : editing.status !== 'Repair';
                      return (
                        <button key={k} onClick={() => setEditing({ ...editing, status: k === 'Repair' ? 'Repair' : (editing.host_id ? 'Assigned' : 'Spare') })} className={`h-11 rounded-xl text-xs font-black border-2 flex items-center justify-center gap-1 ${on ? (k === 'Repair' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-emerald-400 bg-emerald-50 text-emerald-700') : 'border-slate-200 text-slate-500'}`}>
                          {k === 'Repair' && <Wrench size={12} />} {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Assigned host */}
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Assigned to</p>
                {editHost ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3 flex items-center gap-3">
                    {editHost.image_url ? <img src={editHost.image_url} alt="" className="w-11 h-11 rounded-xl object-cover" /> : <span className="w-11 h-11 rounded-xl bg-white flex items-center justify-center text-sm font-black text-[#6D2158]">{editHost.full_name.charAt(0)}</span>}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-slate-800 truncate">{editHost.full_name}</p>
                      <p className="text-[11px] font-bold text-slate-500 truncate">{editHost.host_id} · {editHost.role}</p>
                      <p className="text-[11px] font-bold text-slate-400">Joined {nice(editHost.joining_date)}</p>
                    </div>
                    <button onClick={() => setEditing({ ...editing, host_id: null, assigned_on: '', status: editing.status === 'Repair' ? 'Repair' : 'Spare' })} className="h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs font-black text-rose-600 flex items-center gap-1"><UserMinus size={14} /> Remove</button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="relative border-b border-slate-100">
                      <UserPlus size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input value={hostSearch} onChange={e => setHostSearch(e.target.value)} placeholder="Search host by name or SSL" className="w-full h-11 pl-10 pr-3 text-sm font-bold outline-none" />
                    </div>
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-50">
                      {pickerHosts.map(h => {
                        const has = unitByHost.get(h.id);
                        return (
                          <button key={h.id} onClick={() => setEditing({ ...editing, host_id: h.id, assigned_on: today, status: editing.status === 'Repair' ? 'Repair' : 'Assigned' })} className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-slate-50">
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-bold text-slate-700 truncate">{h.full_name}</span>
                              <span className="block text-[11px] font-semibold text-slate-400 truncate">{h.host_id} · {h.role}</span>
                            </span>
                            {has && <span className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-700" title="Picking moves them from that cycle">has {has.code}</span>}
                          </button>
                        );
                      })}
                      {pickerHosts.length === 0 && <p className="py-6 text-center text-xs font-bold text-slate-400">No host found</p>}
                    </div>
                  </div>
                )}
                {editing.host_id && (
                  <label className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-500">
                    Since
                    <input type="date" value={editing.assigned_on} max={today} onChange={e => setEditing({ ...editing, assigned_on: e.target.value })} className="h-9 px-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold outline-none" />
                  </label>
                )}
              </div>

              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Remarks</p>
                <textarea rows={2} value={editing.remarks} onChange={e => setEditing({ ...editing, remarks: e.target.value })} placeholder="e.g. Flat rear tyre, basket missing, lock no. 12…" className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-semibold outline-none focus:border-[#6D2158] resize-none" />
              </div>

              {editing.history.length > 0 && (
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5"><History size={12} /> Previous riders</p>
                  <div className="space-y-1">
                    {editing.history.slice(0, 6).map((h, i) => (
                      <div key={i} className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-slate-50">
                        <span className="font-bold text-slate-600 truncate">{h.name} <span className="font-mono text-slate-400">{h.ssl}</span></span>
                        <span className="shrink-0 font-semibold text-slate-400">{h.from ? nice(h.from) : '?'} → {nice(h.to)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!isNew && (
                <div className="flex justify-center">
                  {confirmDelete ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-rose-600">Remove {editing.code} from the fleet?</span>
                      <button onClick={() => setConfirmDelete(false)} className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-black text-slate-600">Cancel</button>
                      <button onClick={deleteUnit} className="px-3 py-2 rounded-xl bg-rose-600 text-xs font-black text-white">Remove</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(true)} className="px-3 py-2 rounded-xl text-xs font-black text-rose-500 flex items-center gap-1.5"><Trash2 size={13} /> Remove cycle from fleet</button>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-100">
              <button onClick={saveEdit} disabled={saving} className="w-full h-12 rounded-2xl bg-[#6D2158] text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} {isNew ? 'Add to fleet' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <AdminOnly what="Cycle Fleet">
      <CycleFleetPage />
    </AdminOnly>
  );
}
