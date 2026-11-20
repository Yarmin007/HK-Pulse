"use client";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, Plus, X, Save, Crown, Shield, User, Trash2, Camera, Loader2, Users,
  FileSpreadsheet, Briefcase, Pencil, Check, CalendarX, UserCog,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import Image from 'next/image';
import {
  PROFILE_TYPES, getProfileType, getResignedOn, renameHostKey, SUB_DEPARTMENTS, hostSubDept, boardAreaFor,
  type ProfileType, type TeamConfig,
} from '@/lib/hostProfile';

// --- TYPES ---
type Host = {
  id: string;
  full_name: string;
  host_id: string;
  role: string;
  host_level: 'DA' | 'DB' | 'ATM';
  status: 'Active' | 'Resigned';
  joining_date?: string | null;
  personal_mobile?: string | null;
  company_mobile?: string | null;
  mvpn?: string | null;
  image_url?: string | null;
  nicknames?: string | null;
  sub_department?: string | null;
};

type Designation = { id: string; name: string; rank: number };

type Draft = {
  host: Partial<Host>;
  displayName: string;
  subDept: string;
  profileType: ProfileType;
  resignedOn: string;
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const prettyDate = (ymd?: string | null) =>
  ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const errMsg = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Something went wrong');

const emptyDraft = (): Draft => ({
  host: { full_name: '', host_id: '', role: '', host_level: 'ATM', status: 'Active', personal_mobile: '', company_mobile: '', mvpn: '', nicknames: '', joining_date: todayStr() },
  displayName: '', subDept: '', profileType: 'PERMANENT', resignedOn: '',
});

const NEW_ROLE = '__new__';

export default function HostsProfilePage() {
  const [hostList, setHostList] = useState<Host[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [subDepts, setSubDepts] = useState<string[]>([]);
  const [configId, setConfigId] = useState<string | null>(null);
  const [teamConfig, setTeamConfig] = useState<TeamConfig>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'Active' | 'Resigned'>('Active');

  // Profile modal: `original` is null when creating a new profile.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [original, setOriginal] = useState<Host | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [addingRole, setAddingRole] = useState(false);

  // Designation manager
  const [showRoles, setShowRoles] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [roleToAdd, setRoleToAdd] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftAtOpen = useRef('');      // the popup's values when it opened (to spot unsaved edits)
  const pressedBackdrop = useRef(false); // press started on the dark background
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // --- FETCH ---
  const fetchAll = async () => {
    const [hostRes, constRes] = await Promise.all([
      supabase.from('hsk_hosts').select('*'),
      supabase.from('hsk_constants').select('*').in('type', ['role_rank', 'sub_department', 'team_viewer_config']),
    ]);

    const roles: Designation[] = [];
    const depts: string[] = [];
    (constRes.data || []).forEach((c: { id: string; type: string; label: string }) => {
      if (c.type === 'role_rank') {
        const [name, rank] = c.label.split('::');
        if (name) roles.push({ id: c.id, name: name.trim(), rank: parseInt(rank, 10) || 999 });
      } else if (c.type === 'sub_department') depts.push(c.label.trim());
      else if (c.type === 'team_viewer_config') {
        setConfigId(c.id);
        try { setTeamConfig(JSON.parse(c.label)); } catch { /* keep previous */ }
      }
    });
    roles.sort((a, b) => a.rank - b.rank);
    setDesignations(roles);
    // The six sub-departments, in their fixed order (attendance sheets group by them)
    setSubDepts([...SUB_DEPARTMENTS]);

    const rankOf = new Map(roles.map(r => [r.name.toLowerCase(), r.rank]));
    const hosts = ((hostRes.data || []) as Host[]).sort((a, b) => {
      const ra = rankOf.get((a.role || '').toLowerCase().trim()) ?? 999;
      const rb = rankOf.get((b.role || '').toLowerCase().trim()) ?? 999;
      if (ra !== rb) return ra - rb;
      const na = parseInt((a.host_id || '').replace(/\D/g, ''), 10) || 999999;
      const nb = parseInt((b.host_id || '').replace(/\D/g, ''), 10) || 999999;
      return na - nb;
    });
    setHostList(hosts);
    setIsLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // --- CONFIG (read fresh before writing so other pages' changes are not overwritten) ---
  const updateConfig = async (mutate: (cfg: TeamConfig) => TeamConfig) => {
    let current: TeamConfig = teamConfig;
    let id = configId;
    const { data } = await supabase.from('hsk_constants').select('id, label').eq('type', 'team_viewer_config').limit(1);
    if (data?.[0]) {
      id = data[0].id;
      try { current = JSON.parse(data[0].label); } catch { /* use local copy */ }
    }
    const next = mutate(current);
    const payload = JSON.stringify(next);
    if (id) {
      const { error } = await supabase.from('hsk_constants').update({ label: payload }).eq('id', id);
      if (error) throw error;
    } else {
      const { data: ins, error } = await supabase.from('hsk_constants').insert({ type: 'team_viewer_config', label: payload }).select().single();
      if (error) throw error;
      id = ins.id;
    }
    setConfigId(id);
    setTeamConfig(next);
  };

  const applyHostSettings = (cfg: TeamConfig, hostId: string, d: Draft, isResigned: boolean): TeamConfig => {
    const set = <T,>(map: Record<string, T> | undefined, val: T | '' | false | undefined) => {
      const m = { ...(map || {}) };
      if (val) m[hostId] = val as T; else delete m[hostId];
      return m;
    };
    return {
      ...cfg,
      nicknames: set(cfg.nicknames, d.displayName.trim()),
      hostDepartments: set(cfg.hostDepartments, d.subDept),
      profileTypes: set(cfg.profileTypes, d.profileType),
      // Attendance pages read this flag: only permanent hosts are on the sheet.
      excludeAttendance: set(cfg.excludeAttendance, d.profileType !== 'PERMANENT'),
      resignedOn: set(cfg.resignedOn, isResigned ? d.resignedOn : ''),
    };
  };

  // --- OPEN MODALS ---
  const openHost = (h: Host) => {
    setOriginal(h);
    const d: Draft = {
      host: { ...h },
      displayName: teamConfig.nicknames?.[h.host_id] || '',
      subDept: (() => { const d = hostSubDept(teamConfig, h); return d === 'Unassigned' ? '' : d; })(),
      profileType: getProfileType(teamConfig, h.host_id),
      resignedOn: getResignedOn(teamConfig, h.host_id),
    };
    draftAtOpen.current = JSON.stringify(d);
    setDraft(d);
    setAddingRole(false);
  };
  const openCreate = () => { setOriginal(null); const d = emptyDraft(); draftAtOpen.current = JSON.stringify(d); setDraft(d); setAddingRole(false); };

  // The popup only closes from the dark background when the press STARTED there (selecting text or
  // scrolling inside and letting go outside used to close it), and never silently drops unsaved edits.
  const backdropClose = (e: React.MouseEvent) => {
    const started = pressedBackdrop.current;
    pressedBackdrop.current = false;
    if (!started || e.target !== e.currentTarget || isSaving || isUploadingImage) return;
    if (draft && JSON.stringify(draft) !== draftAtOpen.current && !confirm('Close without saving your changes?')) return;
    closeModal();
  };
  const closeModal = () => { setDraft(null); setOriginal(null); setAddingRole(false); setNewRoleName(''); };

  const patchHost = (p: Partial<Host>) => setDraft(d => (d ? { ...d, host: { ...d.host, ...p } } : d));
  const patchDraft = (p: Partial<Draft>) => setDraft(d => (d ? { ...d, ...p } : d));

  // --- IMAGE UPLOAD ---
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !draft) return;
    setIsUploadingImage(true);
    try {
      const fileName = `${draft.host.host_id || 'new'}-${Date.now()}.${file.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('avatars').upload(fileName, file, { upsert: true });
      if (error) throw error;
      patchHost({ image_url: supabase.storage.from('avatars').getPublicUrl(fileName).data.publicUrl });
      toast.success('Photo uploaded');
    } catch (err) {
      toast.error(`Upload failed: ${errMsg(err)}`);
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- DESIGNATIONS ---
  const addDesignation = async (raw: string): Promise<string | null> => {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name) return null;
    const existing = designations.find(r => r.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.name;
    const rank = Math.max(0, ...designations.map(r => (r.rank < 999 ? r.rank : 0))) + 1;
    const { data, error } = await supabase.from('hsk_constants').insert({ type: 'role_rank', label: `${name}::${rank}` }).select().single();
    if (error) { toast.error(error.message); return null; }
    setDesignations(prev => [...prev, { id: data.id, name, rank }].sort((a, b) => a.rank - b.rank));
    toast.success(`Designation "${name}" added`);
    return name;
  };

  // Renames the designation everywhere: the list, every host holding it, and their uniform records.
  const renameDesignation = async (d: Designation, raw: string) => {
    const name = raw.trim().replace(/\s+/g, ' ');
    setRenaming(null);
    if (!name || name === d.name) return;
    if (designations.some(r => r.id !== d.id && r.name.toLowerCase() === name.toLowerCase())) {
      toast.error('That designation already exists'); return;
    }
    setIsSaving(true);
    try {
      const holders = hostList.filter(h => (h.role || '').trim().toLowerCase() === d.name.toLowerCase());
      const r1 = await supabase.from('hsk_constants').update({ label: `${name}::${d.rank}` }).eq('id', d.id);
      if (r1.error) throw r1.error;
      if (holders.length) {
        const r2 = await supabase.from('hsk_hosts').update({ role: name }).in('id', holders.map(h => h.id));
        if (r2.error) throw r2.error;
        await supabase.from('hsk_laundry_uniforms').update({ designation: name.toUpperCase() }).in('ssl_no', holders.map(h => h.host_id));
      }
      toast.success(`Renamed to "${name}"${holders.length ? ` for ${holders.length} host${holders.length > 1 ? 's' : ''}` : ''}`);
      await fetchAll();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteDesignation = async (d: Designation, holders: number) => {
    if (holders > 0) { toast.error('Move these hosts to another designation first'); return; }
    if (!confirm(`Remove the designation "${d.name}"?`)) return;
    await supabase.from('hsk_constants').delete().eq('id', d.id);
    setDesignations(prev => prev.filter(r => r.id !== d.id));
  };

  const roleCounts = useMemo(() => {
    const m = new Map<string, number>();
    hostList.filter(h => h.status !== 'Resigned').forEach(h => {
      const k = (h.role || '').trim().toLowerCase();
      m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  }, [hostList]);

  // "1715", "ssl1715", "SSl 1715" → "SSL 1715"; "int 132" → "INT 0132". Anything else is returned trimmed.
  const normalizeSsl = (raw: string) => {
    const m = raw.trim().match(/^(ssl|int|tf)?[\s\-_.]*(\d+)$/i);
    if (!m) return raw.trim();
    return `${(m[1] || 'SSL').toUpperCase()} ${m[2].padStart(4, '0')}`;
  };

  // --- SAVE PROFILE ---
  const handleSave = async () => {
    if (!draft) return;
    const h = draft.host;
    const fullName = (h.full_name || '').trim();
    if (!fullName) return toast.error('Full name is required');
    if (!(h.host_id || '').trim()) return toast.error('SSL No is required');
    if (!h.role) return toast.error('Designation is required');
    // Permanent hosts must have a proper "SSL 1234" number ("1715" or "ssl1715" is tidied to "SSL 1715").
    // Interns and taskforce may keep their INT / TF number.
    const hostId = draft.profileType === 'PERMANENT' ? normalizeSsl(h.host_id || '') : (h.host_id || '').trim();
    if (draft.profileType === 'PERMANENT' && !/^SSL \d{4,}$/.test(hostId) && !(/^(INT|TF) \d+$/.test(hostId) && /intern|taskforce/i.test(h.role))) {
      return toast.error('Permanent hosts need an SSL No like "SSL 1234"');
    }
    const isResigned = h.status === 'Resigned';
    if (isResigned && !draft.resignedOn) return toast.error('Set the last working day');
    if (hostList.some(x => x.host_id.trim().toLowerCase() === hostId.toLowerCase() && x.id !== original?.id)) {
      return toast.error(`SSL No ${hostId} is already used`);
    }

    setIsSaving(true);
    try {
      const prevSubDept = original ? (teamConfig.hostDepartments?.[original.host_id] || '') : '';
      // The allocation boards keep their own working area; only pass on a sub-department that maps to one board
      const boardArea = draft.subDept && draft.subDept !== prevSubDept ? boardAreaFor(draft.subDept) : null;
      const row = {
        full_name: fullName,
        host_id: hostId,
        role: h.role,
        host_level: h.host_level || 'ATM',
        status: h.status || 'Active',
        personal_mobile: h.personal_mobile || null,
        company_mobile: h.company_mobile || null,
        mvpn: h.mvpn || null,
        nicknames: h.nicknames || null,
        joining_date: h.joining_date || null,
        image_url: h.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=6D2158&color=fff`,
        // Allocation boards group by this column; keep it in step with the sub-department chosen here.
        ...(boardArea ? { sub_department: boardArea } : {}),
      };

      if (original) {
        const { error } = await supabase.from('hsk_hosts').update(row).eq('id', original.id);
        if (error) throw error;

        // Uniform records keep their own copy of name / SSL / designation / status.
        const uni: Record<string, string> = {};
        if (row.role !== original.role) uni.designation = row.role.toUpperCase();
        if (row.full_name !== original.full_name) uni.host_name = row.full_name.toUpperCase();
        if (row.host_id !== original.host_id) uni.ssl_no = row.host_id;
        if (row.status !== original.status) uni.status = isResigned ? 'Resigned' : 'Active';
        if (Object.keys(uni).length) await supabase.from('hsk_laundry_uniforms').update(uni).eq('ssl_no', original.host_id);

        // Attendance is kept by SSL No: move it to the new number, or the sheets lose this person's days
        if (row.host_id !== original.host_id) {
          const { error: attErr } = await supabase.from('hsk_attendance').update({ host_id: row.host_id }).eq('host_id', original.host_id);
          if (attErr) toast.error(`Attendance not moved to ${row.host_id}: ${attErr.message}`);
        }

        await updateConfig(cfg => applyHostSettings(renameHostKey(cfg, original.host_id, hostId), hostId, draft, isResigned));
        toast.success('Profile saved');
      } else {
        const { error } = await supabase.from('hsk_hosts').insert(row);
        if (error) throw error;
        await updateConfig(cfg => applyHostSettings(cfg, hostId, draft, isResigned));
        toast.success('Profile created');
      }
      closeModal();
      await fetchAll();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!original) return;
    if (!confirm(`Permanently delete ${original.full_name}? Mark them as resigned instead if you want to keep their history.`)) return;
    const { error } = await supabase.from('hsk_hosts').delete().eq('id', original.id);
    if (error) return toast.error(error.message);
    closeModal();
    fetchAll();
    toast.success('Profile deleted');
  };

  // --- FILTERING ---
  const filteredHosts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return hostList.filter(h => {
      if (activeTab === 'Active' ? h.status === 'Resigned' : h.status !== 'Resigned') return false;
      if (!q) return true;
      return [h.full_name, h.host_id, h.role, h.nicknames, teamConfig.nicknames?.[h.host_id], teamConfig.hostDepartments?.[h.host_id]]
        .some(v => (v || '').toLowerCase().includes(q));
    });
  }, [hostList, activeTab, searchQuery, teamConfig]);

  const activeHosts = hostList.filter(h => h.status !== 'Resigned');
  const people = activeHosts.filter(h => getProfileType(teamConfig, h.host_id) !== 'ACCOUNT');
  const stats = {
    total: people.length,
    da: people.filter(h => h.host_level === 'DA').length,
    db: people.filter(h => h.host_level === 'DB').length,
    atm: people.filter(h => h.host_level === 'ATM').length,
    resigned: hostList.length - activeHosts.length,
  };

  // --- EXCEL EXPORT: No, SSL No, Name, Designation ---
  const exportExcel = async () => {
    const rows = filteredHosts.filter(h => getProfileType(teamConfig, h.host_id) !== 'ACCOUNT');
    if (!rows.length) return toast.error('No hosts to export');
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Hosts', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'SSL No', key: 'ssl', width: 14 },
      { header: 'Name', key: 'name', width: 38 },
      { header: 'Designation', key: 'role', width: 32 },
    ];
    rows.forEach((h, i) => ws.addRow({ no: i + 1, ssl: h.host_id, name: h.full_name, role: h.role }));
    const border = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } };
    ws.eachRow((row, n) => {
      row.height = 20;
      row.eachCell(cell => {
        cell.border = { top: border, left: border, bottom: border, right: border };
        cell.alignment = { vertical: 'middle', horizontal: Number(cell.col) === 1 ? 'center' : 'left' };
        if (n === 1) {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6D2158' } };
        }
      });
    });
    ws.autoFilter = 'A1:D1';
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab === 'Active' ? 'Host List' : 'Resigned Hosts'} - ${prettyDate(todayStr())}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- UI PIECES ---
  const LevelBadge = ({ level }: { level: string }) => {
    if (level === 'DA') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200"><Crown size={10} /> DA</span>;
    if (level === 'DB') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 text-[10px] font-bold border border-sky-200"><Shield size={10} /> DB</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 text-[10px] font-bold border border-slate-200"><User size={10} /> ATM</span>;
  };

  const label = 'block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1';
  const input = 'w-full px-3 py-2.5 bg-white rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 outline-none focus:border-[#6D2158] focus:ring-2 focus:ring-[#6D2158]/10 transition';

  const renderDesignationField = () => {
    if (!draft) return null;
    const value = draft.host.role || '';
    const known = designations.some(r => r.name === value);
    if (addingRole) {
      return (
        <div className="flex gap-2">
          <input autoFocus className={input} placeholder="New designation, e.g. Butler" value={newRoleName}
            onChange={e => setNewRoleName(e.target.value)}
            onKeyDown={async e => {
              if (e.key === 'Enter') { const n = await addDesignation(newRoleName); if (n) { patchHost({ role: n }); setAddingRole(false); setNewRoleName(''); } }
              if (e.key === 'Escape') setAddingRole(false);
            }} />
          <button type="button" className="px-3 rounded-xl bg-[#6D2158] text-white" title="Add"
            onClick={async () => { const n = await addDesignation(newRoleName); if (n) { patchHost({ role: n }); setAddingRole(false); setNewRoleName(''); } }}>
            <Check size={16} />
          </button>
          <button type="button" className="px-3 rounded-xl bg-slate-100 text-slate-500" title="Cancel" onClick={() => setAddingRole(false)}><X size={16} /></button>
        </div>
      );
    }
    return (
      <select className={input} value={value}
        onChange={e => (e.target.value === NEW_ROLE ? setAddingRole(true) : patchHost({ role: e.target.value }))}>
        <option value="" disabled>Select designation</option>
        {!known && value && <option value={value}>{value}</option>}
        {designations.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
        <option value={NEW_ROLE}>+ Add new designation…</option>
      </select>
    );
  };

  return (
    <div className="min-h-screen p-4 md:p-6 pb-20 bg-[#FDFBFD] font-antiqua text-[#6D2158]">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-200 pb-5 gap-5">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold italic tracking-tight">Host Profiles</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Master Directory · {stats.total} Active Hosts</p>
        </div>
        <div className="flex gap-5 px-5 py-3 bg-white rounded-2xl border border-slate-100 shadow-sm w-full md:w-auto justify-between">
          {[['DA', stats.da, 'text-amber-600'], ['DB', stats.db, 'text-sky-600'], ['ATM', stats.atm, 'text-slate-700'], ['Resigned', stats.resigned, 'text-rose-500']].map(([k, v, c]) => (
            <div key={k as string} className="text-center">
              <span className={`block text-xl font-bold ${c}`}>{v}</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{k}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CONTROLS */}
      <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 mt-5 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3">
        <div className="flex bg-slate-100 p-1 rounded-xl">
          {(['Active', 'Resigned'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition ${activeTab === t ? `bg-white shadow-sm ${t === 'Active' ? 'text-[#6D2158]' : 'text-rose-600'}` : 'text-slate-400 hover:text-slate-600'}`}>
              {t === 'Active' ? <Users size={15} /> : <CalendarX size={15} />} {t === 'Active' ? 'Active' : 'Resigned'}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search name, SSL, designation…"
              className="w-full pl-9 pr-3 py-2.5 text-xs font-bold border border-slate-200 rounded-xl outline-none focus:border-[#6D2158] text-[#6D2158] placeholder-slate-300" />
          </div>
          <div className="grid grid-cols-3 sm:flex gap-2">
            <button onClick={exportExcel} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider hover:bg-emerald-100">
              <FileSpreadsheet size={15} /> Excel
            </button>
            <button onClick={() => setShowRoles(true)} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold uppercase tracking-wider hover:bg-slate-50">
              <Briefcase size={15} /> Designations
            </button>
            <button onClick={openCreate} className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#6D2158] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md hover:bg-[#5a1b49]">
              <Plus size={15} /> New
            </button>
          </div>
        </div>
      </div>

      {/* GRID */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#6D2158]" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 mt-5">
          {filteredHosts.map(host => {
            const nick = teamConfig.nicknames?.[host.host_id];
            const dept = teamConfig.hostDepartments?.[host.host_id];
            const type = getProfileType(teamConfig, host.host_id);
            const resignedOn = getResignedOn(teamConfig, host.host_id);
            const resigned = host.status === 'Resigned';
            return (
              <button key={host.id} onClick={() => openHost(host)}
                className={`text-left group rounded-2xl border bg-white p-4 flex gap-3 shadow-sm hover:shadow-lg hover:border-[#6D2158]/30 transition ${resigned ? 'border-rose-100 bg-rose-50/30' : 'border-slate-100'}`}>
                <div className={`relative w-14 h-14 rounded-2xl overflow-hidden shrink-0 bg-slate-100 ${resigned ? 'grayscale' : ''}`}>
                  <Image src={host.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(host.full_name)}&background=6D2158&color=fff`} fill sizes="56px" className="object-cover" alt="" unoptimized />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-slate-800 leading-tight truncate group-hover:text-[#6D2158]">{nick || host.full_name.split(' ')[0]}</h3>
                    <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">{host.host_id}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">{host.full_name}</p>
                  <p className="text-[10px] font-bold text-[#6D2158] uppercase tracking-wide truncate mt-1">{host.role}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <LevelBadge level={host.host_level || 'ATM'} />
                    {dept && <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-bold border border-indigo-100">{dept}</span>}
                    {type === 'TEMPORARY' && <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200">Temporary</span>}
                    {type === 'ACCOUNT' && <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold border border-slate-200">Not a person</span>}
                    {resigned && (
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${resignedOn ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {resignedOn ? `Left ${prettyDate(resignedOn)}` : 'Leaving date not set'}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          {filteredHosts.length === 0 && <div className="col-span-full py-12 text-center text-slate-400 font-bold italic">No profiles found.</div>}
        </div>
      )}

      {/* PROFILE MODAL (create + edit) */}
      {draft && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center sm:p-4"
          onPointerDown={e => { pressedBackdrop.current = e.target === e.currentTarget; }} onClick={backdropClose}>
          <div className="bg-white w-full sm:max-w-3xl rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[94dvh] sm:max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4 p-5 border-b border-slate-100">
              <button type="button" onClick={() => !isUploadingImage && fileInputRef.current?.click()}
                className="relative w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 shrink-0 group" title="Change photo">
                {isUploadingImage ? <Loader2 className="animate-spin text-[#6D2158] m-auto" size={20} />
                  : draft.host.image_url ? <Image src={draft.host.image_url} fill sizes="64px" className="object-cover" alt="" unoptimized />
                    : <Camera className="m-auto text-slate-400 absolute inset-0" size={22} />}
                <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white"><Camera size={18} /></span>
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold italic truncate">{original ? draft.host.full_name || 'Host profile' : 'New host profile'}</h2>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">{draft.host.role || 'No designation'} {draft.host.host_id ? `· ${draft.host.host_id}` : ''}</p>
              </div>
              <button onClick={closeModal} className="p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"><X size={18} /></button>
            </div>

            <div className="p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
              <div className="md:col-span-2">
                <label className={label}>Full name</label>
                <input className={input} value={draft.host.full_name || ''} onChange={e => patchHost({ full_name: e.target.value })} placeholder="e.g. Ahmed Ihsaan" />
              </div>
              <div>
                <label className={label}>SSL No</label>
                <input className={`${input} font-mono`} value={draft.host.host_id || ''} onChange={e => patchHost({ host_id: e.target.value })} placeholder="SSL 1234" />
                {draft.profileType === 'PERMANENT' && <p className="text-[10px] text-slate-500 mt-1">Required for permanent hosts: SSL and 4 digits (typing 1715 saves as SSL 1715)</p>}
              </div>
              <div>
                <label className={label}>Designation</label>
                {renderDesignationField()}
                {original && draft.host.role !== original.role && (
                  <p className="text-[10px] text-slate-500 mt-1">Updates the uniform record too. Allocation, attendance and org chart read it from here.</p>
                )}
              </div>
              <div>
                <label className={label}>Level</label>
                <select className={input} value={draft.host.host_level || 'ATM'} onChange={e => patchHost({ host_level: e.target.value as Host['host_level'] })}>
                  <option value="DA">DA (Dinomosphere A)</option>
                  <option value="DB">DB (Dinomosphere B)</option>
                  <option value="ATM">ATM (Atmosphere)</option>
                </select>
              </div>
              <div>
                <label className={label}>Sub-department</label>
                <select className={input} value={draft.subDept} onChange={e => patchDraft({ subDept: e.target.value })}>
                  <option value="">Unassigned</option>
                  {subDepts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* PROFILE TYPE */}
              <div className="md:col-span-2">
                <label className={label}>Profile type</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {PROFILE_TYPES.map(t => (
                    <button key={t.value} type="button" onClick={() => patchDraft({ profileType: t.value })}
                      className={`text-left p-3 rounded-xl border transition ${draft.profileType === t.value ? 'border-[#6D2158] bg-[#6D2158]/5 ring-2 ring-[#6D2158]/10' : 'border-slate-200 hover:border-slate-300'}`}>
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5"><UserCog size={13} className="text-[#6D2158]" /> {t.label}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{t.hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* EMPLOYMENT */}
              <div>
                <label className={label}>Joining date</label>
                <input type="date" className={input} value={draft.host.joining_date || ''} onChange={e => patchHost({ joining_date: e.target.value })} />
              </div>
              <div>
                <label className={label}>Status</label>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  {(['Active', 'Resigned'] as const).map(s => (
                    <button key={s} type="button"
                      onClick={() => { patchHost({ status: s }); if (s === 'Resigned' && !draft.resignedOn) patchDraft({ resignedOn: todayStr() }); }}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${draft.host.status === s ? `bg-white shadow-sm ${s === 'Active' ? 'text-emerald-600' : 'text-rose-600'}` : 'text-slate-400'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              {draft.host.status === 'Resigned' && (
                <div className="md:col-span-2 p-3 rounded-xl bg-rose-50 border border-rose-100 grid sm:grid-cols-2 gap-3 items-end">
                  <div>
                    <label className={`${label} !text-rose-500`}>Last working day</label>
                    <input type="date" className={input} value={draft.resignedOn} onChange={e => patchDraft({ resignedOn: e.target.value })} />
                  </div>
                  <p className="text-[11px] text-rose-700 leading-snug">They stay on attendance sheets up to this date, then drop off. Their login stops working once saved.</p>
                </div>
              )}

              {/* NAMES */}
              <div>
                <label className={label}>Dashboard name</label>
                <input className={input} value={draft.displayName} onChange={e => patchDraft({ displayName: e.target.value })} placeholder={(draft.host.full_name || '').split(' ')[0] || 'e.g. Ali'} />
              </div>
              <div>
                <label className={label}>Also known as (attendance bot)</label>
                <input className={input} value={draft.host.nicknames || ''} onChange={e => patchHost({ nicknames: e.target.value })} placeholder="e.g. Kappi, Abow" />
              </div>

              {/* CONTACT */}
              <div>
                <label className={label}>Personal mobile</label>
                <input className={input} inputMode="tel" value={draft.host.personal_mobile || ''} onChange={e => patchHost({ personal_mobile: e.target.value })} placeholder="+960…" />
              </div>
              <div>
                <label className={label}>Company mobile</label>
                <input className={input} inputMode="tel" value={draft.host.company_mobile || ''} onChange={e => patchHost({ company_mobile: e.target.value })} placeholder="+960…" />
              </div>
              <div>
                <label className={label}>MVPN</label>
                <input className={`${input} font-mono`} inputMode="numeric" value={draft.host.mvpn || ''} onChange={e => patchHost({ mvpn: e.target.value })} placeholder="e.g. 2843" />
              </div>
            </div>

            <div className="flex items-center gap-2 p-4 border-t border-slate-100 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {original && (
                <button onClick={handleDelete} className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-rose-600 hover:bg-rose-50 flex items-center gap-1.5">
                  <Trash2 size={14} /> Delete
                </button>
              )}
              <div className="flex-1" />
              <button onClick={closeModal} className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-500 hover:bg-slate-200">Cancel</button>
              <button onClick={handleSave} disabled={isSaving}
                className="px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#6D2158] text-white hover:bg-[#5a1b49] disabled:opacity-50 flex items-center gap-1.5">
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {original ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DESIGNATION MANAGER */}
      {showRoles && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center sm:p-4" onClick={() => { setShowRoles(false); setRenaming(null); }}>
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90dvh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold italic">Designations</h3>
                <p className="text-[11px] text-slate-500">Renaming one updates every host who has it. Order follows the ranks in Settings.</p>
              </div>
              <button onClick={() => { setShowRoles(false); setRenaming(null); }} className="p-2 rounded-full bg-slate-100 text-slate-500"><X size={18} /></button>
            </div>
            <div className="p-4 border-b border-slate-100 flex gap-2">
              <input className={input} placeholder="Add a designation…" value={roleToAdd} onChange={e => setRoleToAdd(e.target.value)}
                onKeyDown={async e => { if (e.key === 'Enter' && await addDesignation(roleToAdd)) setRoleToAdd(''); }} />
              <button onClick={async () => { if (await addDesignation(roleToAdd)) setRoleToAdd(''); }}
                className="px-4 rounded-xl bg-[#6D2158] text-white text-xs font-bold uppercase flex items-center gap-1"><Plus size={14} /> Add</button>
            </div>
            <div className="overflow-y-auto p-2">
              {designations.map(d => {
                const count = roleCounts.get(d.name.toLowerCase()) || 0;
                const isRen = renaming?.id === d.id;
                return (
                  <div key={d.id} className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-50">
                    <span className="w-6 text-[10px] font-mono text-slate-300">{d.rank}</span>
                    {isRen ? (
                      <input autoFocus className={`${input} !py-1.5`} value={renaming.value}
                        onChange={e => setRenaming({ id: d.id, value: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') renameDesignation(d, renaming.value); if (e.key === 'Escape') setRenaming(null); }} />
                    ) : (
                      <span className="flex-1 text-sm font-semibold text-slate-800">{d.name}</span>
                    )}
                    <span className="text-[10px] font-bold text-slate-400 w-14 text-right">{count} host{count === 1 ? '' : 's'}</span>
                    {isRen ? (
                      <button disabled={isSaving} onClick={() => renameDesignation(d, renaming.value)} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50"><Check size={15} /></button>
                    ) : (
                      <button onClick={() => setRenaming({ id: d.id, value: d.name })} className="p-1.5 rounded-lg text-slate-400 hover:text-[#6D2158] hover:bg-white" title="Rename"><Pencil size={14} /></button>
                    )}
                    <button onClick={() => deleteDesignation(d, count)} className={`p-1.5 rounded-lg ${count ? 'text-slate-200 cursor-not-allowed' : 'text-slate-400 hover:text-rose-600 hover:bg-white'}`} title={count ? 'In use' : 'Remove'}><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
