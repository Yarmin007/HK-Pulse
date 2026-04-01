"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  CalendarDays, FileText, UploadCloud, CheckCircle2, XCircle, 
  Clock, ShieldCheck, Search, AlertCircle, ChevronRight, Stethoscope, 
  Loader2, ArrowRight, Trash2, ShieldAlert, Camera, MessageCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { differenceInDays, parseISO, addDays, format } from 'date-fns';
import toast from 'react-hot-toast';

// IMPORT THE REAL MATH ENGINE FROM YOUR UTILS
import { computeLeaveBalancesRPC } from '@/lib/payrollMath';
import { getDhakaDateStr } from '@/lib/dateUtils';

// --- TYPES ---
type Host = { id: string; host_id: string; full_name: string; role: string; department: string; off_balance?: number; balOff?: number; };
type LeaveRequest = { id: string; host_id: string; host_name: string; leave_type: string; start_date: string; end_date: string; total_days: number; status: 'Pending' | 'Approved' | 'Denied'; mc_url: string | null; resort_doctor: boolean; is_extension: boolean; parent_leave_id: string | null; created_at: string; };
type UnresolvedMC = { id: string; host_id: string; host_name: string; type: string; dates: string[]; };

export default function LeaveRequestMode() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<Host | null>(null);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [unresolvedMCs, setUnresolvedMCs] = useState<UnresolvedMC[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurging, setIsPurging] = useState(false);
  const [adminTab, setAdminTab] = useState<'PENDING' | 'APPROVED'>('PENDING');

  // --- MATH DEPENDENCIES ---
  const [rpcStats, setRpcStats] = useState<any[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<any[]>([]);
  const [anniversaryLeaves, setAnniversaryLeaves] = useState<any[]>([]);
  const cutoffDate = getDhakaDateStr();

  // --- FORM STATE ---
  const [formData, setFormData] = useState({ leave_type: 'OFF/PH Clearance', start_date: '', end_date: '', is_extension: false, parent_leave_id: null as string | null });
  
  // --- MC RESOLUTION STATE ---
  const [resolvingMC, setResolvingMC] = useState<UnresolvedMC | null>(null);
  const [selectedMCDates, setSelectedMCDates] = useState<string[]>([]);
  const [mcFile, setMcFile] = useState<File | null>(null); 
  const [resortDoctor, setResortDoctor] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- ADMIN RE-UPLOAD STATE ---
  const [reuploadReq, setReuploadReq] = useState<LeaveRequest | null>(null);
  const [reuploadFile, setReuploadFile] = useState<File | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
      setIsLoading(true);
      try {
          const sessionData = localStorage.getItem('hk_pulse_session');
          const adminAuth = localStorage.getItem('hk_pulse_admin_auth');
          let adminFlag = false;
          let loggedHostId = '';

          if (sessionData) {
              const parsed = JSON.parse(sessionData);
              adminFlag = parsed.system_role === 'admin' || adminAuth === 'true';
              loggedHostId = String(parsed.host_id || '').trim();
          } else if (adminAuth === 'true') {
              adminFlag = true;
          }
          setIsAdmin(adminFlag);

          const [hostRes, constRes, rpcRes, anniRes] = await Promise.all([
              supabase.from('hsk_hosts').select('*').neq('status', 'Resigned'),
              supabase.from('hsk_constants').select('*').eq('type', 'public_holiday'),
              supabase.rpc('get_all_attendance_stats', { p_target_date: cutoffDate }),
              supabase.from('hsk_attendance').select('host_id, date, status_code').in('status_code', ['SL', 'EL', 'RR']).gte('date', '2025-01-01')
          ]);

          if (hostRes.data) {
              setHosts(hostRes.data as Host[]);
              if (loggedHostId) {
                  const me = hostRes.data.find(h => String(h.host_id).trim() === loggedHostId);
                  if (me) setCurrentUser(me as Host);
              }
          }

          if (constRes.data) {
              const loadedHolidays = constRes.data.map((c: any) => { const [d, n] = c.label.split('::'); return { id: c.id, date: d, name: n }; });
              setPublicHolidays(loadedHolidays);
          }

          setRpcStats(rpcRes.data || []);
          setAnniversaryLeaves(anniRes.data || []);

          const { data: reqData } = await supabase.from('hsk_leave_requests').select('*').order('created_at', { ascending: false });
          const parsedRequests = (reqData || []) as LeaveRequest[];
          setRequests(parsedRequests);

          const now = new Date();
          const y = now.getFullYear();
          const m = now.getMonth() + 1;
          const d = now.getDate();

          let startMonth = d <= 20 ? m - 1 : m;
          let startYear = y;
          if (startMonth === 0) { startMonth = 12; startYear -= 1; }

          let endMonth = d <= 20 ? m : m + 1;
          let endYear = y;
          if (endMonth === 13) { endMonth = 1; endYear += 1; }

          const pad = (n: number) => n.toString().padStart(2, '0');
          const startStr = `${startYear}-${pad(startMonth)}-21`;
          const endStr = `${endYear}-${pad(endMonth)}-20`;

          const { data: attData } = await supabase
              .from('hsk_attendance')
              .select('host_id, date, status_code')
              .gte('date', startStr)
              .lte('date', endStr)
              .in('status_code', ['SL', 'EL'])
              .order('date', { ascending: true });

          const unresolvedMap: Record<string, UnresolvedMC> = {};

          if (attData && hostRes.data) {
              attData.forEach(record => {
                  const dateStr = record.date.split('T')[0];
                  const isCovered = parsedRequests.some(req => req.host_id === record.host_id && req.start_date <= dateStr && req.end_date >= dateStr && (req.mc_url || req.resort_doctor));
                  if (!isCovered) {
                      const key = `${record.host_id}_${record.status_code}`;
                      if (!unresolvedMap[key]) {
                          const host = hostRes.data.find(h => h.host_id === record.host_id);
                          unresolvedMap[key] = { id: key, host_id: record.host_id, host_name: host?.full_name || record.host_id, type: record.status_code === 'SL' ? 'Sick Leave' : 'Emergency Leave', dates: [] };
                      }
                      unresolvedMap[key].dates.push(dateStr);
                  }
              });
          }
          setUnresolvedMCs(Object.values(unresolvedMap));
      } catch (error) { toast.error("Failed to load data."); }
      setIsLoading(false);
  };

  const handleDateChange = (field: 'start_date' | 'end_date', val: string) => {
      setFormData(prev => {
          const next = { ...prev, [field]: val };
          if (next.start_date && next.end_date && next.end_date < next.start_date) next.end_date = next.start_date;
          return next;
      });
  };

  const calculateDays = (start: string, end: string) => {
      if (!start || !end) return 0;
      return differenceInDays(parseISO(end), parseISO(start)) + 1;
  };

  const uploadProcessedMC = async (file: File, hostId: string) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${hostId}_${Date.now()}.${fileExt}`;
      const filePath = `mc_uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('documents').getPublicUrl(filePath);
      return data.publicUrl;
  };

  const submitLeaveRequest = async () => {
      if (!currentUser) return toast.error("User session not found.");
      if (!formData.start_date || !formData.end_date) return toast.error("Please select dates.");
      
      setIsSubmitting(true);
      try {
          const payload = {
              host_id: currentUser.host_id,
              host_name: currentUser.full_name,
              leave_type: formData.leave_type,
              start_date: formData.start_date,
              end_date: formData.end_date,
              total_days: calculateDays(formData.start_date, formData.end_date),
              status: 'Pending',
              is_extension: formData.is_extension,
              parent_leave_id: formData.parent_leave_id
          };
          const { error } = await supabase.from('hsk_leave_requests').insert([payload]);
          if (error) throw error;

          toast.success(formData.is_extension ? "Extension requested successfully!" : "Leave requested successfully!");
          setFormData({ leave_type: 'OFF/PH Clearance', start_date: '', end_date: '', is_extension: false, parent_leave_id: null });
          fetchData();
      } catch (err: any) { toast.error("Failed to submit request."); }
      setIsSubmitting(false);
  };

  const submitMCResolution = async () => {
      if (!resolvingMC) return;
      if (selectedMCDates.length === 0) return toast.error("Please select the dates this MC covers.");
      if (!resortDoctor && !mcFile) return toast.error("Please select a document.");

      setIsSubmitting(true);
      try {
          let mcUrl = null;
          if (mcFile && !resortDoctor) {
              toast.loading("Uploading Document...", { id: 'mc' });
              mcUrl = await uploadProcessedMC(mcFile, resolvingMC.host_id);
              toast.success("MC Securely Uploaded!", { id: 'mc' });
          }

          const sortedDates = [...selectedMCDates].sort();
          const payload = {
              host_id: resolvingMC.host_id,
              host_name: resolvingMC.host_name,
              leave_type: resolvingMC.type,
              start_date: sortedDates[0],
              end_date: sortedDates[sortedDates.length - 1],
              total_days: selectedMCDates.length, 
              status: isAdmin ? 'Approved' : 'Pending',
              mc_url: mcUrl,
              resort_doctor: resortDoctor,
              is_extension: false,
              parent_leave_id: null
          };

          const { error } = await supabase.from('hsk_leave_requests').insert([payload]);
          if (error) throw error;

          toast.success("MC resolved for selected dates!");
          setResolvingMC(null);
          setSelectedMCDates([]);
          setMcFile(null);
          setResortDoctor(false);
          fetchData();
      } catch (err: any) { toast.error("Failed to submit MC."); }
      setIsSubmitting(false);
  };

  const submitReuploadMC = async () => {
      if (!reuploadReq || !reuploadFile) return;
      setIsSubmitting(true);
      try {
          toast.loading("Uploading new document...", { id: 'reupload' });
          const newUrl = await uploadProcessedMC(reuploadFile, reuploadReq.host_id);

          // Optional: Attempt to delete the old file to save space
          if (reuploadReq.mc_url) {
              const oldFileName = reuploadReq.mc_url.split('/').pop();
              if (oldFileName) await supabase.storage.from('documents').remove([`mc_uploads/${oldFileName}`]);
          }

          const { error } = await supabase.from('hsk_leave_requests').update({ mc_url: newUrl, resort_doctor: false }).eq('id', reuploadReq.id);
          if (error) throw error;

          toast.success("MC updated successfully!", { id: 'reupload' });
          setReuploadReq(null);
          setReuploadFile(null);
          fetchData();
      } catch (err: any) {
          toast.error("Failed to update MC.", { id: 'reupload' });
      }
      setIsSubmitting(false);
  };

  const clearMCAdmin = async (mc: UnresolvedMC) => {
      if (!confirm(`Are you sure you want to completely clear the MC requirement for ${mc.host_name}?\n\nThis will auto-approve the sickness in the system without requiring a document.`)) return;
      setIsSubmitting(true);
      toast.loading("Clearing requirement...", { id: 'clear_mc' });
      try {
          const sortedDates = [...mc.dates].sort();
          const payload = {
              host_id: mc.host_id, host_name: mc.host_name, leave_type: mc.type,
              start_date: sortedDates[0], end_date: sortedDates[sortedDates.length - 1],
              total_days: mc.dates.length, status: 'Approved', mc_url: null, resort_doctor: true, is_extension: false, parent_leave_id: null
          };
          const { error } = await supabase.from('hsk_leave_requests').insert([payload]);
          if (error) throw error;
          toast.success("MC cleared successfully!", { id: 'clear_mc' });
          fetchData();
      } catch (err: any) { toast.error("Failed to clear MC.", { id: 'clear_mc' }); }
      setIsSubmitting(false);
  };

  const openExtensionForm = (parentReq: LeaveRequest) => {
      setFormData({ leave_type: parentReq.leave_type, start_date: format(addDays(parseISO(parentReq.end_date), 1), 'yyyy-MM-dd'), end_date: '', is_extension: true, parent_leave_id: parentReq.id });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast.success("Ready to extend. Select your new end date.");
  };

  const cancelExtension = () => setFormData({ leave_type: 'OFF/PH Clearance', start_date: '', end_date: '', is_extension: false, parent_leave_id: null });

  const updateRequestStatus = async (id: string, newStatus: 'Approved' | 'Denied') => {
      try {
          const { error } = await supabase.from('hsk_leave_requests').update({ status: newStatus }).eq('id', id);
          if (error) throw error;
          toast.success(`Request ${newStatus}!`);
          fetchData();
      } catch (err) { toast.error(`Failed to ${newStatus.toLowerCase()} request.`); }
  };

  const purgeOldMCs = async () => {
      if (!confirm("This will permanently delete all MC files older than 30 days to clear storage. Continue?")) return;
      setIsPurging(true);
      toast.loading("Scanning for old MCs...", { id: 'purge' });
      try {
          const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const { data: oldRequests } = await supabase.from('hsk_leave_requests').select('id, mc_url').not('mc_url', 'is', null).lt('created_at', thirtyDaysAgo.toISOString());

          if (!oldRequests || oldRequests.length === 0) {
              toast.success("No old MCs to clean up!", { id: 'purge' });
              setIsPurging(false); return;
          }

          let purgedCount = 0;
          for (const req of oldRequests) {
              const urlParts = req.mc_url.split('/');
              const filePath = `mc_uploads/${urlParts[urlParts.length - 1]}`;
              await supabase.storage.from('documents').remove([filePath]);
              await supabase.from('hsk_leave_requests').update({ mc_url: null }).eq('id', req.id);
              purgedCount++;
          }
          toast.success(`Successfully deleted ${purgedCount} old MC files!`, { id: 'purge' });
          fetchData();
      } catch (e) { toast.error("Failed to purge MCs.", { id: 'purge' }); }
      setIsPurging(false);
  };

  const getBalOffForHost = (hostId: string) => {
      const host = hosts.find(h => h.host_id === hostId);
      if (!host) return 0;
      const balances = computeLeaveBalancesRPC(host, [], rpcStats, cutoffDate, publicHolidays, anniversaryLeaves);
      return balances?.balOff ? parseFloat(balances.balOff) : 0;
  };

  const adminViewList = useMemo(() => {
      return requests.filter(r => adminTab === 'PENDING' ? r.status === 'Pending' : r.status !== 'Pending')
          .map(r => ({ ...r, computedBalOff: getBalOffForHost(r.host_id) }))
          .sort((a, b) => adminTab === 'PENDING' ? (b.computedBalOff !== a.computedBalOff ? b.computedBalOff - a.computedBalOff : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [requests, hosts, adminTab, rpcStats]);

  const myRequests = requests.filter(r => r.host_id === currentUser?.host_id);
  const myUnresolvedMCs = unresolvedMCs.filter(mc => mc.host_id === currentUser?.host_id);
  const currentUserBal = currentUser ? getBalOffForHost(currentUser.host_id) : 0;

  if (isLoading) return <div className="flex h-screen w-full items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-[#6D2158]" size={40}/></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-24 md:pb-6 font-sans text-slate-800 w-full flex flex-col overflow-x-hidden relative">

      {/* ================= HOST VIEW ================= */}
      {!isAdmin && (
          <div className="flex flex-col lg:flex-row gap-6 w-full animate-in fade-in">
              {/* LEFT COL: LEAVE REQUEST FORM */}
              <div className="w-full lg:w-[400px] shrink-0 flex flex-col gap-6">
                  <div className="bg-[#6D2158] rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                      <h2 className="text-sm font-bold opacity-80 uppercase tracking-widest">Available Balance</h2>
                      <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-4xl font-black">{currentUserBal}</span>
                          <span className="text-sm font-bold opacity-80">Off Days (O)</span>
                      </div>
                      <p className="text-xs opacity-70 mt-4 leading-relaxed">Your available OFF balance is pulled directly from your latest payroll calculations.</p>
                  </div>

                  {/* UNRESOLVED MC ALERTS */}
                  {myUnresolvedMCs.length > 0 && (
                      <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 shadow-sm">
                          <div className="flex items-center gap-2 text-rose-700 mb-3">
                              <ShieldAlert size={18} />
                              <h3 className="font-black text-sm uppercase tracking-widest">Action Required</h3>
                          </div>
                          <div className="space-y-3">
                              {myUnresolvedMCs.map(mc => (
                                  <div key={mc.id} className="bg-white rounded-xl p-4 border border-rose-100 shadow-sm flex flex-col gap-3">
                                      <div>
                                          <p className="text-xs font-bold text-slate-800">Pending {mc.type}</p>
                                          <p className="text-[10px] text-rose-600 font-bold mt-1">Dates: {mc.dates.map(d => format(parseISO(d), 'dd MMM')).join(', ')}</p>
                                      </div>
                                      <button onClick={() => { setResolvingMC(mc); setSelectedMCDates([...mc.dates]); }} className="w-full bg-rose-600 text-white py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition-colors">
                                          Resolve Now
                                      </button>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}

                  <div className="bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                      <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                          <div>
                              <h2 className="text-lg font-black text-[#6D2158]">{formData.is_extension ? 'Request Extension' : 'New Leave Request'}</h2>
                              {formData.is_extension && <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mt-1">Extending an existing approved leave</p>}
                          </div>
                          {formData.is_extension && <button onClick={cancelExtension} className="text-xs font-bold text-slate-400 hover:text-rose-600 transition-colors">Cancel</button>}
                      </div>
                      
                      <div className="p-6 space-y-5">
                          <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Leave Type</label>
                              <select disabled={formData.is_extension} className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158] disabled:opacity-50" value={formData.leave_type} onChange={e => setFormData({...formData, leave_type: e.target.value})}>
                                  <option value="OFF/PH Clearance">OFF/PH Clearance</option>
                                  <option value="Annual Leave">Annual Leave</option>
                              </select>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Start Date</label>
                                  <input disabled={formData.is_extension} type="date" className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158] disabled:opacity-50 text-slate-700" value={formData.start_date} onChange={e => handleDateChange('start_date', e.target.value)}/>
                              </div>
                              <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">End Date</label>
                                  <input type="date" min={formData.start_date} className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158] text-slate-700" value={formData.end_date} onChange={e => handleDateChange('end_date', e.target.value)}/>
                              </div>
                          </div>

                          <div className="bg-[#6D2158]/5 p-3 rounded-xl text-center border border-[#6D2158]/20">
                              <span className="text-xs font-bold text-slate-600">Total Requested: </span>
                              <span className="text-lg font-black text-[#6D2158] ml-1">{calculateDays(formData.start_date, formData.end_date)} Days</span>
                          </div>
                          
                          <button onClick={submitLeaveRequest} disabled={isSubmitting} className="w-full mt-4 bg-[#6D2158] text-white py-4 rounded-xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-[#5a1b49] disabled:opacity-50 transition-all flex justify-center items-center gap-2">
                              {isSubmitting ? <Loader2 className="animate-spin" size={16}/> : <CheckCircle2 size={16}/>}
                              Submit Request
                          </button>
                      </div>
                  </div>
              </div>

              {/* RIGHT COL: HOST REQUESTS LIST */}
              <div className="flex-1 flex flex-col space-y-4">
                  <div className="flex justify-between items-end pb-2 border-b border-slate-200">
                      <h2 className="text-lg font-black text-slate-800">My History</h2>
                      <span className="text-xs font-bold text-slate-400">{myRequests.length} Records</span>
                  </div>

                  {myRequests.length === 0 ? (
                      <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center text-slate-400 h-full flex flex-col items-center justify-center">
                          <CalendarDays size={48} className="mx-auto mb-4 opacity-20"/>
                          <p className="font-bold">No leave requests found.</p>
                          <p className="text-xs mt-2">Submit a request using the form to see it here.</p>
                      </div>
                  ) : (
                      <div className="space-y-3">
                          {myRequests.map(req => (
                              <div key={req.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-[#6D2158]/30 transition-colors">
                                  <div>
                                      <div className="flex items-center gap-2 mb-1">
                                          <span className="font-black text-slate-800">{req.leave_type}</span>
                                          {req.is_extension && <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-black uppercase tracking-widest">Extension</span>}
                                      </div>
                                      <p className="text-xs font-bold text-slate-500">{format(parseISO(req.start_date), 'dd MMM yyyy')} <ArrowRight size={12} className="inline mx-1"/> {format(parseISO(req.end_date), 'dd MMM yyyy')}</p>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">{req.total_days} Days Total</p>
                                  </div>
                                  
                                  <div className="flex items-center gap-4 sm:flex-col sm:items-end">
                                      <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5
                                          ${req.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : req.status === 'Denied' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                          {req.status === 'Pending' && <Clock size={12}/>}
                                          {req.status === 'Approved' && <ShieldCheck size={12}/>}
                                          {req.status === 'Denied' && <XCircle size={12}/>}
                                          {req.status}
                                      </span>

                                      {req.status === 'Approved' && (
                                          <button onClick={() => openExtensionForm(req)} className="text-[10px] font-bold text-[#6D2158] hover:underline flex items-center gap-1">
                                              Extend Leave <ChevronRight size={12}/>
                                          </button>
                                      )}
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* RESOLVE MC MODAL (SHARED BY HOST & ADMIN) */}
      {resolvingMC && (
          <div className="fixed inset-0 z-[50] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
                  <div className="p-6 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
                      <div>
                          <h2 className="text-lg font-black text-rose-800">Resolve {resolvingMC.type}</h2>
                          <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest mt-1">
                              {isAdmin ? `For ${resolvingMC.host_name}` : 'Select dates and upload document'}
                          </p>
                      </div>
                      <button onClick={() => { setResolvingMC(null); setMcFile(null); setResortDoctor(false); setSelectedMCDates([]); }} className="p-2 bg-white text-rose-500 rounded-full hover:bg-rose-100 transition-colors"><XCircle size={20}/></button>
                  </div>
                  
                  <div className="p-6 space-y-5">
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Which dates does this MC cover?</p>
                          <div className="flex flex-col gap-2 max-h-[150px] overflow-y-auto custom-scrollbar">
                              {resolvingMC.dates.map(d => (
                                  <label key={d} className="flex items-center gap-3 bg-white border border-slate-200 px-4 py-3 rounded-lg cursor-pointer hover:border-rose-300 transition-colors">
                                      <input 
                                          type="checkbox" 
                                          className="w-4 h-4 accent-rose-600"
                                          checked={selectedMCDates.includes(d)} 
                                          onChange={(e) => {
                                              if (e.target.checked) setSelectedMCDates([...selectedMCDates, d]);
                                              else setSelectedMCDates(selectedMCDates.filter(x => x !== d));
                                          }} 
                                      />
                                      <span className="text-sm font-bold text-slate-700">{format(parseISO(d), 'EEEE, dd MMM yyyy')}</span>
                                  </label>
                              ))}
                          </div>
                      </div>

                      <div className="space-y-4">
                          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl cursor-pointer hover:bg-blue-100 transition-colors" onClick={() => setResortDoctor(!resortDoctor)}>
                              <input type="checkbox" checked={resortDoctor} readOnly className="w-4 h-4 accent-blue-600 cursor-pointer"/>
                              <div className="flex-1">
                                  <p className="text-xs font-black text-blue-900 flex items-center gap-1">
                                      <Stethoscope size={14}/> I consulted the Resort Doctor
                                  </p>
                                  <p className="text-[10px] text-blue-700 font-medium">No MC upload required.</p>
                              </div>
                          </div>

                          {!resortDoctor && (
                              <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center hover:bg-slate-50 relative transition-colors">
                                  <input type="file" accept="image/*,.pdf" onChange={e => setMcFile(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"/>
                                  <UploadCloud className="text-slate-400 mb-2" size={24}/>
                                  {mcFile ? (
                                      <p className="text-xs font-bold text-emerald-600 text-center truncate px-4">{mcFile.name}</p>
                                  ) : (
                                      <>
                                          <p className="text-xs font-bold text-slate-600">Select Photo or PDF</p>
                                          <p className="text-[10px] text-slate-400 mt-1">Tap to browse files or camera</p>
                                      </>
                                  )}
                              </div>
                          )}
                      </div>

                      <button onClick={submitMCResolution} disabled={isSubmitting || selectedMCDates.length === 0 || (!resortDoctor && !mcFile)} className="w-full bg-rose-600 text-white py-4 rounded-xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-rose-700 disabled:opacity-50 transition-all flex justify-center items-center gap-2">
                          {isSubmitting ? <Loader2 className="animate-spin" size={16}/> : <CheckCircle2 size={16}/>}
                          Submit Resolution
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* ================= ADMIN VIEW ================= */}
      {isAdmin && (
          <div className="w-full space-y-6 animate-in fade-in">
              
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div>
                      <h1 className="text-2xl font-black text-emerald-800 flex items-center gap-2"><ShieldCheck/> Leave Administration</h1>
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Review, approve, and manage extensions</p>
                  </div>
                  <button onClick={purgeOldMCs} disabled={isPurging} className="bg-white border border-rose-200 text-rose-600 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm hover:bg-rose-50 transition-all flex items-center gap-2 disabled:opacity-50">
                      {isPurging ? <Loader2 className="animate-spin" size={16}/> : <Trash2 size={16}/>}
                      Auto-Clean Old MCs
                  </button>
              </div>

              {/* ADMIN DASHBOARD CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-amber-200">
                      <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-3"><Clock size={20}/></div>
                      <p className="text-3xl font-black text-slate-800">{requests.filter(r => r.status === 'Pending').length}</p>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Pending Form Requests</p>
                  </div>
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-rose-200">
                      <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-3"><AlertCircle size={20}/></div>
                      <p className="text-3xl font-black text-slate-800">{unresolvedMCs.length}</p>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Action Required: MCs</p>
                  </div>
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-200">
                      <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3"><CheckCircle2 size={20}/></div>
                      <p className="text-3xl font-black text-slate-800">{requests.filter(r => r.status === 'Approved').length}</p>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Approved YTD</p>
                  </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
                  
                  {/* ADMIN TABLE (PENDING OR APPROVED) */}
                  <div className="xl:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                      <div className="p-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 shrink-0">
                          <div className="flex bg-white rounded-lg p-1 border border-slate-200 w-max shadow-sm">
                              <button onClick={() => setAdminTab('PENDING')} className={`px-4 py-1.5 rounded-md text-xs font-black uppercase tracking-widest transition-colors ${adminTab === 'PENDING' ? 'bg-amber-100 text-amber-700' : 'text-slate-400 hover:bg-slate-50'}`}>Pending Queue</button>
                              <button onClick={() => setAdminTab('APPROVED')} className={`px-4 py-1.5 rounded-md text-xs font-black uppercase tracking-widest transition-colors ${adminTab === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400 hover:bg-slate-50'}`}>Approved / History</button>
                          </div>
                      </div>

                      <div className="divide-y divide-slate-100 overflow-x-auto">
                          <table className="w-full text-left whitespace-nowrap">
                              <thead className="bg-slate-50/50">
                                  <tr>
                                      <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Host</th>
                                      <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Leave Details</th>
                                      <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">MC Status</th>
                                      <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Actions</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {adminViewList.length === 0 ? (
                                      <tr><td colSpan={4} className="p-10 text-center text-slate-400 font-bold italic">No requests to display!</td></tr>
                                  ) : (
                                      adminViewList.map(req => (
                                          <tr key={req.id} className="hover:bg-slate-50 transition-colors group">
                                              <td className="p-4">
                                                  <p className="font-black text-slate-800 text-sm">{req.host_name}</p>
                                                  <p className="text-[10px] font-mono text-slate-400 mt-0.5">{req.host_id}</p>
                                              </td>
                                              <td className="p-4">
                                                  <div className="flex items-center gap-2 mb-1">
                                                      <span className="font-bold text-slate-700 text-xs">{req.leave_type}</span>
                                                      {req.is_extension && <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase font-black">EXT</span>}
                                                  </div>
                                                  <p className="text-[10px] font-bold text-slate-500">{format(parseISO(req.start_date), 'dd/MM')} - {format(parseISO(req.end_date), 'dd/MM')} ({req.total_days} Days)</p>
                                              </td>
                                              <td className="p-4">
                                                  {['Sick Leave', 'Emergency Leave'].includes(req.leave_type) ? (
                                                      req.resort_doctor ? (
                                                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded flex w-max items-center gap-1"><Stethoscope size={12}/> Resort Doc</span>
                                                      ) : req.mc_url ? (
                                                          <a href={req.mc_url} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded flex w-max items-center gap-1 hover:bg-emerald-100 transition-colors"><FileText size={12}/> View MC</a>
                                                      ) : (
                                                          <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded flex w-max items-center gap-1"><AlertCircle size={12}/> Missing MC</span>
                                                      )
                                                  ) : (
                                                      <span className="text-[10px] font-bold text-slate-300">-</span>
                                                  )}
                                              </td>
                                              <td className="p-4 text-right">
                                                  <div className="flex items-center justify-end gap-2">
                                                      
                                                      {/* WHATSAPP DOC BUTTON */}
                                                      {['Sick Leave', 'Emergency Leave'].includes(req.leave_type) && req.mc_url && (
                                                          <a href={`https://wa.me/?text=${encodeURIComponent(`Please review MC for ${req.host_name} (${req.host_id}).\nDates: ${format(parseISO(req.start_date),'dd MMM')} to ${format(parseISO(req.end_date),'dd MMM')}\n\nMC Link: ${req.mc_url}`)}`} target="_blank" rel="noopener noreferrer" className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors" title="Send to Doctor via WhatsApp">
                                                              <MessageCircle size={18}/>
                                                          </a>
                                                      )}

                                                      {/* RE-UPLOAD MC BUTTON (ADMIN OVERRIDE) */}
                                                      {['Sick Leave', 'Emergency Leave'].includes(req.leave_type) && (
                                                          <button onClick={() => setReuploadReq(req)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Replace/Upload New MC">
                                                              <UploadCloud size={18}/>
                                                          </button>
                                                      )}
                                                      
                                                      {adminTab === 'PENDING' ? (
                                                          <>
                                                              <button onClick={() => updateRequestStatus(req.id, 'Denied')} className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Deny"><XCircle size={18}/></button>
                                                              <button onClick={() => updateRequestStatus(req.id, 'Approved')} className="px-4 py-2 bg-emerald-500 text-white hover:bg-emerald-600 rounded-lg text-xs font-black uppercase tracking-widest shadow-sm transition-colors flex items-center gap-1"><CheckCircle2 size={14}/> Approve</button>
                                                          </>
                                                      ) : (
                                                          <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${req.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                              {req.status}
                                                          </span>
                                                      )}
                                                  </div>
                                              </td>
                                          </tr>
                                      ))
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>

                  {/* ADMIN MISSING MC TRACKER */}
                  <div className="xl:col-span-1 bg-white rounded-3xl shadow-sm border border-rose-200 overflow-hidden flex flex-col">
                      <div className="p-5 bg-rose-50 border-b border-rose-200 flex justify-between items-center">
                          <h2 className="font-black text-rose-800 flex items-center gap-2"><AlertCircle size={18}/> Missing MC Tracker</h2>
                      </div>
                      <div className="p-3 bg-white border-b border-rose-100 text-[10px] font-bold text-rose-500 uppercase tracking-widest text-center">
                          Scanning active payroll cycle
                      </div>
                      <div className="divide-y divide-rose-100 max-h-[500px] overflow-y-auto custom-scrollbar">
                          {unresolvedMCs.length === 0 ? (
                              <div className="p-10 text-center text-slate-400 font-bold italic">All rostered MCs accounted for!</div>
                          ) : (
                              unresolvedMCs.map(mc => (
                                  <div key={mc.id} className="p-5 flex flex-col gap-1.5 hover:bg-rose-50/50 transition-colors">
                                      <div className="flex justify-between items-start">
                                          <div>
                                              <p className="font-black text-slate-800 text-sm">{mc.host_name}</p>
                                              <p className="text-[9px] font-mono text-slate-400">{mc.host_id}</p>
                                          </div>
                                          <span className="text-[9px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-black uppercase tracking-widest">{mc.type}</span>
                                      </div>
                                      <p className="text-[10px] text-slate-500 font-bold mt-2">Missing for {mc.dates.length} rostered day(s):</p>
                                      <p className="text-[10px] text-rose-600 font-medium leading-relaxed">{mc.dates.map(d => format(parseISO(d), 'dd MMM')).join(', ')}</p>
                                      
                                      <div className="flex gap-2 mt-3 pt-3 border-t border-rose-100/50">
                                          <button onClick={() => { setResolvingMC(mc); setSelectedMCDates([...mc.dates]); }} className="flex-1 bg-white border border-rose-200 text-rose-600 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-rose-50 transition-colors flex items-center justify-center gap-1 shadow-sm">
                                              <UploadCloud size={14}/> Upload
                                          </button>
                                          <button onClick={() => clearMCAdmin(mc)} className="flex-1 bg-white border border-slate-200 text-slate-500 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-slate-50 hover:text-slate-700 transition-colors flex items-center justify-center gap-1 shadow-sm">
                                              <CheckCircle2 size={14}/> Clear
                                          </button>
                                      </div>
                                  </div>
                              ))
                          )}
                      </div>
                  </div>
              </div>

          </div>
      )}

      {/* ADMIN RE-UPLOAD MC MODAL */}
      {reuploadReq && isAdmin && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
                  <div className="p-6 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
                      <div>
                          <h2 className="text-lg font-black text-blue-800">Update MC</h2>
                          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-1">
                              For {reuploadReq.host_name}
                          </p>
                      </div>
                      <button onClick={() => { setReuploadReq(null); setReuploadFile(null); }} className="p-2 bg-white text-blue-500 rounded-full hover:bg-blue-100 transition-colors"><XCircle size={20}/></button>
                  </div>
                  
                  <div className="p-6 space-y-5">
                      <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center hover:bg-slate-50 relative transition-colors">
                          <input type="file" accept="image/*,.pdf" onChange={e => setReuploadFile(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"/>
                          <UploadCloud className="text-slate-400 mb-2" size={24}/>
                          {reuploadFile ? (
                              <p className="text-xs font-bold text-emerald-600 text-center truncate px-4">{reuploadFile.name}</p>
                          ) : (
                              <>
                                  <p className="text-xs font-bold text-slate-600">Select New Photo or PDF</p>
                                  <p className="text-[10px] text-slate-400 mt-1">Tap to browse files or camera</p>
                              </>
                          )}
                      </div>

                      <button onClick={submitReuploadMC} disabled={isSubmitting || !reuploadFile} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-blue-700 disabled:opacity-50 transition-all flex justify-center items-center gap-2">
                          {isSubmitting ? <Loader2 className="animate-spin" size={16}/> : <CheckCircle2 size={16}/>}
                          Replace Document
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}