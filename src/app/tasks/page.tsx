"use client";
import React, { useState, useEffect } from 'react';
import { 
  CheckSquare, Plus, Bell, CalendarDays, RefreshCw, 
  Trash2, Loader2, CheckCircle2, Shield, Calendar, Box, X, Users, MapPin, AlertTriangle,
  PartyPopper, Landmark, Wine, Boxes, Layers, Truck, FileText, Timer, Pencil, BellOff, Eye
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import PageHeader from '@/components/PageHeader';

// --- VISUAL ARTWORK ENGINE ---
const getTaskBlockStyle = (title: string) => {
    const t = title.toLowerCase();
    
    // Default Clean HK Pulse Style
    const defaults = { 
        icon: CheckSquare, 
        mainBlockClass: 'bg-white border-slate-200 hover:border-[#6D2158]',
        artPanelClass: 'bg-slate-50 border-r border-slate-100',
        artPanelGradient: '',
        iconClass: 'text-slate-400',
        isFeyli: false
    };

    // 🇲🇻 Authentic Maldivian Feyli (Horizontal Sarong Pattern matching Pulse Theme)
    if (t.includes('cocktail')) {
        return { 
            icon: Wine, 
            mainBlockClass: 'bg-white border-slate-200 hover:border-[#6D2158] shadow-md',
            artPanelClass: 'border-r border-slate-200 relative overflow-hidden',
            // Authentic horizontal stripes: Black -> White lines -> HK Pulse Maroon -> White lines -> Black
            artPanelGradient: 'linear-gradient(to bottom, #111111 0%, #111111 30%, #ffffff 30%, #ffffff 32%, #111111 32%, #111111 35%, #ffffff 35%, #ffffff 37%, #6D2158 37%, #6D2158 63%, #ffffff 63%, #ffffff 65%, #111111 65%, #111111 68%, #ffffff 68%, #ffffff 70%, #111111 70%, #111111 100%)',
            iconClass: 'text-white drop-shadow-md z-10',
            isFeyli: true
        };
    }

    if (t.includes('payroll')) return { ...defaults, icon: Landmark, iconClass: 'text-emerald-600', artPanelClass: 'bg-emerald-50/50 border-r border-emerald-100' };
    if (t.includes('activity')) return { ...defaults, icon: CalendarDays, iconClass: 'text-blue-600', artPanelClass: 'bg-blue-50/50 border-r border-blue-100' };
    if (t.includes('minibar')) return { ...defaults, icon: Wine, iconClass: 'text-rose-600', artPanelClass: 'bg-rose-50/50 border-r border-rose-100' };
    if (t.includes('store')) return { ...defaults, icon: Boxes, iconClass: 'text-amber-600', artPanelClass: 'bg-amber-50/50 border-r border-amber-100' };
    if (t.includes('linen')) return { ...defaults, icon: Layers, iconClass: 'text-indigo-600', artPanelClass: 'bg-indigo-50/50 border-r border-indigo-100' };
    if (t.includes('purchase') || t.includes('requisition')) return { ...defaults, icon: FileText, iconClass: 'text-cyan-600', artPanelClass: 'bg-cyan-50/50 border-r border-cyan-100' };
    if (t.includes('supply') || t.includes('unloading')) return { ...defaults, icon: Truck, iconClass: 'text-orange-600', artPanelClass: 'bg-orange-50/50 border-r border-orange-100' };

    return defaults;
};

// Strict Dhaka Time Helper
const getDhakaDateStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const getDhakaTimeStr = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' }).format(new Date());

export default function AdminTaskHub() {
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const [tasks, setTasks] = useState<any[]>([]);
    const [inventorySchedules, setInventorySchedules] = useState<any[]>([]);

    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null); 
    
    // Upgraded Task State
    const [newTask, setNewTask] = useState({ 
        title: '', 
        description: '', 
        frequency: 'One-Off', 
        hasDueDate: false, // Default to false (Reminder mode)
        due_date: getDhakaDateStr(),
        due_time: '18:00',
        reminder_date: getDhakaDateStr(),
        reminder_time: '09:00',
        recurring_day: '1',
        is_last_day_of_month: false
    });

    const [selectedScheduleProgress, setSelectedScheduleProgress] = useState<any | null>(null);

    useEffect(() => {
        const session = localStorage.getItem('hk_pulse_session');
        const adminFlag = localStorage.getItem('hk_pulse_admin_auth') === 'true' || (session && JSON.parse(session).system_role === 'admin');
        setIsAdmin(!!adminFlag);

        if (adminFlag) {
            fetchData();
        } else {
            setIsLoading(false);
        }
    }, []);

    const fetchData = async () => {
        setIsLoading(true);

        const { data: tasksData } = await supabase.from('hsk_admin_tasks').select('*');
        if (tasksData) setTasks(tasksData);

        const { data: activeSchedules } = await supabase.from('hsk_inventory_schedules').select(`id, inventory_type, month_year, assignments:hsk_inventory_assignments(id, status, host_id, villa_number)`).eq('status', 'Active');
        const { data: hosts } = await supabase.from('hsk_hosts').select('host_id, full_name');
        const hostMap: Record<string, string> = {};
        if (hosts) hosts.forEach(h => hostMap[h.host_id] = h.full_name);
        
        if (activeSchedules) {
            const mappedSchedules = activeSchedules.map(sched => {
                const total = sched.assignments.length;
                const done = sched.assignments.filter((a: any) => a.status === 'Submitted').length;
                const percentage = total === 0 ? 0 : Math.round((done / total) * 100);
                
                const hostProgress: Record<string, { name: string, total: number, done: number, pendingLocations: string[] }> = {};
                sched.assignments.forEach((a: any) => {
                    const hId = a.host_id || 'unassigned';
                    if (!hostProgress[hId]) hostProgress[hId] = { name: hostMap[hId] || hId, total: 0, done: 0, pendingLocations: [] };
                    hostProgress[hId].total += 1;
                    if (a.status === 'Submitted') hostProgress[hId].done += 1;
                    else hostProgress[hId].pendingLocations.push(a.villa_number);
                });

                return { ...sched, total, done, percentage, detailedProgress: Object.values(hostProgress).sort((a, b) => (b.total - b.done) - (a.total - a.done)) };
            });
            setInventorySchedules(mappedSchedules);
        }
        setIsLoading(false);
    };

    const handleOpenNewTask = () => {
        setEditingTaskId(null);
        setNewTask({ 
            title: '', description: '', frequency: 'One-Off', hasDueDate: false, 
            due_date: getDhakaDateStr(), due_time: '18:00',
            reminder_date: getDhakaDateStr(), reminder_time: '09:00', recurring_day: '1', is_last_day_of_month: false
        });
        setIsTaskModalOpen(true);
    };

    const handleEditClick = (task: any) => {
        setEditingTaskId(task.id);
        setNewTask({
            title: task.title,
            description: task.description || '',
            frequency: task.frequency,
            hasDueDate: !!(task.due_date || task.due_time),
            due_date: task.due_date || getDhakaDateStr(),
            due_time: task.due_time || '18:00',
            reminder_date: task.reminder_date || getDhakaDateStr(),
            reminder_time: task.reminder_time || '09:00',
            recurring_day: task.recurring_day ? String(task.recurring_day) : '1',
            is_last_day_of_month: task.is_last_day_of_month || false
        });
        setIsTaskModalOpen(true);
    };

    const handleSaveTask = async () => {
        if (!newTask.title.trim()) return toast.error('Task title is required');
        
        const taskPayload = {
            title: newTask.title,
            description: newTask.description,
            frequency: newTask.frequency,
            due_date: newTask.hasDueDate && newTask.frequency === 'One-Off' ? newTask.due_date : null,
            due_time: newTask.hasDueDate ? newTask.due_time : null,
            reminder_date: newTask.frequency === 'One-Off' ? newTask.reminder_date : null,
            reminder_time: newTask.reminder_time,
            recurring_day: newTask.frequency !== 'One-Off' ? parseInt(newTask.recurring_day, 10) : null,
            is_last_day_of_month: newTask.is_last_day_of_month,
            status: 'Pending'
        };

        if (editingTaskId) {
            const { data, error } = await supabase.from('hsk_admin_tasks').update(taskPayload).eq('id', editingTaskId).select().single();
            if (!error && data) {
                setTasks(tasks.map(t => t.id === editingTaskId ? data : t));
                setIsTaskModalOpen(false);
                toast.success('Block Updated!');
            }
        } else {
            const { data, error } = await supabase.from('hsk_admin_tasks').insert([taskPayload]).select().single();
            if (!error && data) {
                setTasks([...tasks, data]);
                setIsTaskModalOpen(false);
                toast.success('Block Created!');
            }
        }
    };

    const handleCompleteTask = async (id: string, isCurrentlyComplete: boolean) => {
        const task = tasks.find(t => t.id === id);
        if (!task) return;

        // If it's a recurring task or reminder, 'completing' it just dismisses it for the current cycle
        if (!isCurrentlyComplete && task.frequency !== 'One-Off') {
            const { error } = await supabase.from('hsk_admin_tasks').update({ last_completed_at: new Date().toISOString() }).eq('id', id);
            if (!error) {
                setTasks(tasks.map(t => t.id === id ? { ...t, last_completed_at: new Date().toISOString() } : t));
                toast.success('Dismissed until next cycle!');
            }
            return;
        }

        const newStatus = isCurrentlyComplete ? 'Pending' : 'Completed';
        const { error } = await supabase.from('hsk_admin_tasks').update({ 
            status: newStatus, completed_at: newStatus === 'Completed' ? new Date().toISOString() : null
        }).eq('id', id);

        if (!error) {
            setTasks(tasks.map(t => t.id === id ? { ...t, status: newStatus } : t));
            if (newStatus === 'Completed') toast.success('Task Completed!');
        }
    };

    const handleDeleteTask = async (id: string) => {
        if (!confirm('Are you sure you want to permanently delete this item?')) return;
        const { error } = await supabase.from('hsk_admin_tasks').delete().eq('id', id);
        if (!error) setTasks(tasks.filter(t => t.id !== id));
    };

    const handleNotifyTask = async (task: any) => {
        toast.success('Sending reminder to team...');
        try { await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `Reminder: ${task.title}`, body: task.description || 'Please check your dashboard.' }) }); } catch (e) {}
    };

    // --- 🧠 SMART VISIBILITY ENGINE (DHAKA TIME SAFE) ---
    const processTasks = () => {
        const activeList: any[] = [];
        const allScheduledList: any[] = [];
        
        const dhakaDate = getDhakaDateStr();
        const dhakaTime = getDhakaTimeStr();
        const nowDhaka = new Date(`${dhakaDate}T${dhakaTime}:00+06:00`);

        tasks.forEach(task => {
            const isReminderOnly = !task.due_time; // If no due time, it's just a reminder block
            allScheduledList.push({...task, isReminderOnly});

            if (task.frequency === 'One-Off') {
                if (task.status !== 'Completed') {
                    const rDate = task.reminder_date || dhakaDate;
                    const rTime = task.reminder_time || '00:00';
                    const showDateTime = new Date(`${rDate}T${rTime}:00+06:00`);
                    
                    if (nowDhaka >= showDateTime) {
                        const isOverdue = task.due_date && task.due_date < dhakaDate;
                        activeList.push({ ...task, isOverdue, isReminderOnly });
                    }
                }
            } else {
                // RECURRING LOGIC
                let isActiveToday = false;

                if (task.frequency === 'Daily') isActiveToday = true;
                else if (task.frequency === 'Weekly') {
                    const todayDayStr = nowDhaka.getDay().toString(); // 0-6
                    if (todayDayStr === String(task.recurring_day)) isActiveToday = true;
                }
                else if (task.frequency === 'Monthly') {
                    if (task.is_last_day_of_month) {
                        // Check if today is the last day of the current month
                        const tomorrow = new Date(nowDhaka);
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        if (tomorrow.getDate() === 1) isActiveToday = true;
                    } else {
                        if (nowDhaka.getDate().toString() === String(task.recurring_day)) isActiveToday = true;
                    }
                }

                if (isActiveToday) {
                    const rTime = task.reminder_time || '00:00';
                    const showDateTime = new Date(`${dhakaDate}T${rTime}:00+06:00`);
                    
                    if (nowDhaka >= showDateTime) {
                        let dismissedToday = false;
                        if (task.last_completed_at) {
                            const lastDoneStr = task.last_completed_at.substring(0, 10); 
                            if (lastDoneStr === dhakaDate) dismissedToday = true;
                        }

                        if (!dismissedToday) {
                            activeList.push({ ...task, isOverdue: false, isReminderOnly });
                        }
                    }
                }
            }
        });

        // Sort active list: Tasks with deadlines first, then reminders
        activeList.sort((a, b) => {
            if (!a.isReminderOnly && b.isReminderOnly) return -1;
            if (a.isReminderOnly && !b.isReminderOnly) return 1;
            return 0;
        });

        return { activeList, allScheduledList };
    };

    const { activeList, allScheduledList } = processTasks();

    const getRecurringLabel = (task: any) => {
        if (task.frequency === 'Daily') return 'Every Day';
        if (task.frequency === 'Weekly') {
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return `Every ${days[task.recurring_day] || 'Week'}`;
        }
        if (task.frequency === 'Monthly') {
            if (task.is_last_day_of_month) return 'Last Day of Month';
            const day = task.recurring_day;
            const suffix = (day % 10 === 1 && day !== 11) ? 'st' : (day % 10 === 2 && day !== 12) ? 'nd' : (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
            return `Every ${day}${suffix} of Month`;
        }
        return task.frequency;
    };

    if (isLoading) return <div className="flex-1 flex items-center justify-center h-full"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>;

    if (!isAdmin) return (
        <div className="flex flex-col items-center justify-center h-[70vh] text-center p-8">
            <div className="w-24 h-24 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-6"><Shield size={40} /></div>
            <h2 className="text-3xl font-black text-slate-800 tracking-tight">Access Restricted</h2>
        </div>
    );

    return (
        <div className="flex flex-col min-h-screen bg-slate-50 font-sans text-slate-800 pb-20">
            <PageHeader title="Task Hub" date={new Date()} onDateChange={() => {}} />

            <div className="px-4 md:px-8 mt-4 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in">
                
                {/* LEFT: LIVE INVENTORY PROGRESS */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-slate-50 bg-emerald-50/50">
                            <h3 className="font-black text-emerald-700 text-lg flex items-center gap-2"><Box size={20}/> Live Audits</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Active inventory counts</p>
                        </div>
                        <div className="p-6 space-y-6">
                            {inventorySchedules.length === 0 ? (
                                <p className="text-sm font-bold text-slate-400 text-center py-6">No active inventory schedules.</p>
                            ) : (
                                inventorySchedules.map(sched => (
                                    <div key={sched.id} onClick={() => setSelectedScheduleProgress(sched)} className="space-y-2 cursor-pointer p-4 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all group">
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <h4 className="font-black text-slate-800 group-hover:text-[#6D2158] transition-colors">{sched.inventory_type}</h4>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{format(parseISO(sched.month_year + '-01'), 'MMMM yyyy')}</p>
                                            </div>
                                            <span className={`font-black text-lg ${sched.percentage === 100 ? 'text-emerald-500' : 'text-[#6D2158]'}`}>{sched.percentage}%</span>
                                        </div>
                                        <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                            <div className={`h-full transition-all duration-1000 ${sched.percentage === 100 ? 'bg-emerald-500' : 'bg-[#6D2158]'}`} style={{width: `${sched.percentage}%`}}></div>
                                        </div>
                                        <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                            <span>{sched.done} Done</span>
                                            <span>{sched.total} Total</span>
                                        </div>
                                        <div className="text-center pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-[9px] font-black text-[#6D2158] uppercase tracking-widest">Tap to view staff details</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT: ACTION CENTER TASK MANAGEMENT */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 flex flex-col min-h-[500px]">
                        
                        <div className="p-6 md:p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
                            <div>
                                <h3 className="font-black text-xl text-[#6D2158] flex items-center gap-2"><CheckSquare size={24}/> Action Center</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Manage Tasks & Auto-Reminders</p>
                            </div>
                            <button onClick={handleOpenNewTask} className="px-6 py-3 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-md hover:bg-[#5a1b49] active:scale-95 transition-all flex items-center gap-2 justify-center shrink-0">
                                <Plus size={16}/> New Block
                            </button>
                        </div>

                        <div className="p-4 md:p-8 flex-1 overflow-y-auto">
                            
                            {/* ACTIVE TASKS & REMINDERS */}
                            <div className="mb-10">
                                <h4 className="text-xs font-black text-[#6D2158] uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <Bell size={16}/> Active Right Now
                                </h4>
                                {activeList.length === 0 ? (
                                    <div className="text-center py-12 border border-dashed border-slate-200 rounded-3xl text-slate-400 bg-slate-50/50">
                                        <CheckSquare size={48} className="mx-auto mb-4 opacity-20"/>
                                        <p className="font-bold text-sm">All clear! No pending tasks or reminders right now.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {activeList.map(task => {
                                            const style = getTaskBlockStyle(task.title);
                                            const ArtIcon = style.icon;

                                            return (
                                                <div key={task.id} className={`rounded-2xl border transition-all flex items-stretch group overflow-hidden ${style.mainBlockClass} ${task.isOverdue ? 'border-rose-300 ring-2 ring-rose-100' : ''}`}>
                                                    
                                                    {/* --- ARTWORK PANEL --- */}
                                                    <div style={{background: style.artPanelGradient}} className={`w-20 md:w-24 flex items-center justify-center shrink-0 p-4 ${style.artPanelClass}`}>
                                                        <ArtIcon size={32} className={style.iconClass} strokeWidth={style.isFeyli ? 2.5 : 2}/>
                                                    </div>
                                                    
                                                    {/* --- CONTENT PANEL --- */}
                                                    <div className="flex-1 min-w-0 p-4 flex flex-col justify-center">
                                                        <div className="flex justify-between items-start gap-4">
                                                            <div className="flex-1 min-w-0">
                                                                <h4 className="font-black text-base md:text-lg leading-tight mb-1 text-slate-800">{task.title}</h4>
                                                                {task.description && <p className="text-xs font-bold text-slate-500 mb-3">{task.description}</p>}
                                                            </div>

                                                            {/* ACTION BUTTON (Complete for Tasks, Dismiss for Reminders) */}
                                                            {!task.isReminderOnly ? (
                                                                <button onClick={() => handleCompleteTask(task.id, false)} className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all border border-slate-200 text-slate-400 hover:bg-emerald-500 hover:text-white hover:border-emerald-600 shadow-sm" title="Mark Task Complete">
                                                                    <CheckCircle2 size={20} strokeWidth={2.5}/>
                                                                </button>
                                                            ) : (
                                                                <button onClick={() => handleCompleteTask(task.id, false)} className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all border border-slate-200 text-slate-400 hover:bg-slate-200 hover:text-slate-600 shadow-sm" title="Dismiss Reminder">
                                                                    <BellOff size={18} strokeWidth={2.5}/>
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* BADGES */}
                                                        <div className="flex flex-wrap items-center gap-2 mt-2">
                                                            {task.isReminderOnly ? (
                                                                <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md flex items-center gap-1 border bg-slate-100 border-slate-200 text-slate-500 shadow-sm">
                                                                    <Eye size={12}/> Reminder Only
                                                                </span>
                                                            ) : (
                                                                task.due_time && (
                                                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md flex items-center gap-1 border shadow-sm ${task.isOverdue ? 'bg-rose-100 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                                                        <Timer size={12}/> Due: {task.due_time}
                                                                    </span>
                                                                )
                                                            )}

                                                            <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md flex items-center gap-1 border bg-slate-50 border-slate-200 text-slate-500 shadow-sm`}>
                                                                <RefreshCw size={10}/> {getRecurringLabel(task)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* --- HOVER QUICK ACTIONS --- */}
                                                    <div className="flex flex-col gap-2 shrink-0 p-2 bg-slate-50 border-l border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity justify-center">
                                                        <button onClick={() => handleEditClick(task)} className="p-2 text-slate-400 bg-white border border-slate-200 rounded-lg hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors shadow-sm" title="Edit">
                                                            <Pencil size={14}/>
                                                        </button>
                                                        <button onClick={() => handleDeleteTask(task.id)} className="p-2 text-slate-400 bg-white border border-slate-200 rounded-lg hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition-colors shadow-sm" title="Delete">
                                                            <Trash2 size={14}/>
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* ALL CONFIGURED TASKS (Database View) */}
                            <div className="pt-6 border-t border-slate-100">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <CalendarDays size={16}/> All Configured Blocks
                                </h4>
                                <div className="space-y-3">
                                    {allScheduledList.map(task => (
                                        <div key={task.id} className="p-3 md:p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-4 group">
                                            <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                                                {task.isReminderOnly ? <Bell size={16}/> : <CheckSquare size={16}/>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-sm text-slate-700 truncate">{task.title}</h4>
                                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
                                                    {getRecurringLabel(task)}
                                                </p>
                                            </div>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                <button onClick={() => handleEditClick(task)} className="p-2 text-slate-400 hover:text-blue-600 transition-colors bg-white rounded-lg border shadow-sm"><Pencil size={14}/></button>
                                                <button onClick={() => handleDeleteTask(task.id)} className="p-2 text-slate-400 hover:text-rose-600 transition-colors bg-white rounded-lg border shadow-sm"><Trash2 size={14}/></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>

            {/* --- ADD / EDIT TASK BLOCK MODAL --- */}
            {isTaskModalOpen && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl flex flex-col animate-in zoom-in-95 overflow-hidden max-h-[90vh]">
                        <div className="p-6 bg-[#6D2158] text-white flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="font-black text-xl flex items-center gap-2">
                                    {editingTaskId ? <Pencil size={20}/> : <Plus size={20}/>} 
                                    {editingTaskId ? 'Edit Block' : 'New Action Block'}
                                </h3>
                                <p className="text-[10px] uppercase tracking-widest text-white/70 mt-1">Admin Action Center</p>
                            </div>
                            <button onClick={() => setIsTaskModalOpen(false)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"><X size={18}/></button>
                        </div>
                        
                        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar bg-slate-50/50">
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 block ml-1">Title</label>
                                <input type="text" placeholder="e.g. GM Cocktail Party" className="w-full p-4 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158] transition-colors shadow-sm" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} autoFocus/>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 block ml-1">Notes (Optional)</label>
                                <textarea rows={2} placeholder="Add any details here..." className="w-full p-4 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-[#6D2158] transition-colors resize-none shadow-sm" value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})} />
                            </div>
                            
                            <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-5 shadow-sm">
                                
                                <div>
                                    <label className="text-[10px] font-black uppercase text-[#6D2158] tracking-widest mb-2 block ml-1 border-b border-slate-100 pb-1">1. Schedule & Frequency</label>
                                    <select className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158] cursor-pointer" value={newTask.frequency} onChange={e => setNewTask({...newTask, frequency: e.target.value})}>
                                        <option value="One-Off">One-Off Date</option>
                                        <option value="Daily">Daily</option>
                                        <option value="Weekly">Weekly</option>
                                        <option value="Monthly">Monthly</option>
                                    </select>
                                </div>

                                {newTask.frequency === 'Weekly' && (
                                    <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                                        <span className="text-xs font-bold text-slate-500">Repeats Every:</span>
                                        <select className="p-2 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-[#6D2158] cursor-pointer" value={newTask.recurring_day} onChange={e => setNewTask({...newTask, recurring_day: e.target.value})}>
                                            <option value="1">Monday</option>
                                            <option value="2">Tuesday</option>
                                            <option value="3">Wednesday</option>
                                            <option value="4">Thursday</option>
                                            <option value="5">Friday</option>
                                            <option value="6">Saturday</option>
                                            <option value="0">Sunday</option>
                                        </select>
                                    </div>
                                )}

                                {newTask.frequency === 'Monthly' && (
                                    <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={newTask.is_last_day_of_month} onChange={(e) => setNewTask({...newTask, is_last_day_of_month: e.target.checked})} className="w-4 h-4 text-[#6D2158] rounded focus:ring-[#6D2158] accent-[#6D2158]"/>
                                            <span className="text-xs font-bold text-slate-700">Always on the Last Day of Month</span>
                                        </label>
                                        {!newTask.is_last_day_of_month && (
                                            <div className="flex items-center justify-between border-t border-slate-200 pt-3 mt-1">
                                                <span className="text-xs font-bold text-slate-500">Or pick specific date:</span>
                                                <input type="number" min="1" max="31" className="w-16 p-2 bg-white border border-slate-200 rounded-lg text-center text-sm font-bold outline-none focus:border-[#6D2158]" value={newTask.recurring_day} onChange={e => setNewTask({...newTask, recurring_day: e.target.value})}/>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div>
                                    <label className="text-[10px] font-black uppercase text-[#6D2158] tracking-widest mb-2 block ml-1 border-b border-slate-100 pb-1 mt-4">2. Reminder Time</label>
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                                        <p className="text-[10px] text-slate-500 font-bold leading-tight">When should this appear on your dashboard?</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            {newTask.frequency === 'One-Off' && (
                                                <input type="date" className="w-full p-3 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-[#6D2158]" value={newTask.reminder_date} onChange={e => setNewTask({...newTask, reminder_date: e.target.value})}/>
                                            )}
                                            <input type="time" className={`w-full p-3 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-[#6D2158] ${newTask.frequency !== 'One-Off' ? 'col-span-2' : ''}`} value={newTask.reminder_time} onChange={e => setNewTask({...newTask, reminder_time: e.target.value})}/>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black uppercase text-[#6D2158] tracking-widest mb-2 block ml-1 border-b border-slate-100 pb-1 mt-4">3. Task or Reminder?</label>
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={newTask.hasDueDate} onChange={(e) => setNewTask({...newTask, hasDueDate: e.target.checked})} className="w-4 h-4 text-[#6D2158] rounded focus:ring-[#6D2158] accent-[#6D2158]"/>
                                            <span className="text-xs font-black text-slate-700">Has a Strict Deadline?</span>
                                        </label>
                                        
                                        {!newTask.hasDueDate ? (
                                            <p className="text-[10px] font-bold text-slate-400 bg-white p-2 rounded-lg border border-slate-100 flex items-center gap-1.5"><Eye size={12}/> Acts as an info reminder. Auto-hides at midnight.</p>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-3">
                                                {newTask.frequency === 'One-Off' && (
                                                    <input type="date" className="w-full p-3 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-[#6D2158]" value={newTask.due_date} onChange={e => setNewTask({...newTask, due_date: e.target.value})}/>
                                                )}
                                                <div className="flex items-center gap-2 col-span-2">
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">Must be done by:</span>
                                                    <input type="time" className="flex-1 p-3 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-[#6D2158]" value={newTask.due_time} onChange={e => setNewTask({...newTask, due_time: e.target.value})}/>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>
                        </div>
                        
                        <div className="p-6 bg-white border-t border-slate-100 flex gap-3 shrink-0">
                            <button onClick={() => setIsTaskModalOpen(false)} className="px-6 py-4 bg-slate-50 text-slate-500 border border-slate-200 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-slate-100 transition-all active:scale-95">Cancel</button>
                            <button onClick={handleSaveTask} disabled={!newTask.title.trim()} className="flex-1 py-4 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-sm shadow-lg shadow-purple-900/20 hover:bg-[#5a1b49] disabled:opacity-50 transition-all active:scale-95 flex justify-center items-center gap-2">
                                <CheckCircle2 size={18}/> {editingTaskId ? 'Update Block' : 'Save Block'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- DETAILED PROGRESS MODAL --- */}
            {selectedScheduleProgress && (
                <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-200">
                    <div className="bg-[#FDFBFD] w-full max-w-2xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95">
                        
                        <div className="p-6 md:p-8 bg-[#6D2158] text-white flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="font-black text-xl md:text-2xl tracking-tight flex items-center gap-2"><Users size={24}/> Progress Breakdown</h3>
                                <p className="text-[10px] text-white/70 uppercase tracking-widest mt-1">{selectedScheduleProgress.inventory_type} • {format(parseISO(selectedScheduleProgress.month_year + '-01'), 'MMM yyyy')}</p>
                            </div>
                            <button onClick={() => setSelectedScheduleProgress(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={18}/></button>
                        </div>
                        
                        <div className="p-6 border-b border-slate-200 bg-white shrink-0 flex items-center justify-between">
                            <div>
                                <div className="text-3xl font-black text-[#6D2158]">{selectedScheduleProgress.percentage}%</div>
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Overall Completion</div>
                            </div>
                            <div className="text-right">
                                <div className="text-xl font-black text-slate-800">{selectedScheduleProgress.done} / {selectedScheduleProgress.total}</div>
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Locations Audited</div>
                            </div>
                        </div>

                        <div className="p-4 md:p-6 overflow-y-auto flex-1 custom-scrollbar space-y-3 bg-slate-50">
                            {selectedScheduleProgress.detailedProgress.length === 0 ? (
                                <p className="text-center font-bold text-slate-400 py-10">No staff assigned to this count yet.</p>
                            ) : (
                                selectedScheduleProgress.detailedProgress.map((hostData: any, idx: number) => {
                                    const isComplete = hostData.done === hostData.total;
                                    const staffPercentage = Math.round((hostData.done / hostData.total) * 100);

                                    return (
                                        <div key={idx} className={`p-4 md:p-5 rounded-2xl border transition-all flex flex-col gap-3 shadow-sm ${isComplete ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                                            
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${isComplete ? 'bg-emerald-500 text-white' : 'bg-purple-50 text-[#6D2158]'}`}>
                                                        {isComplete ? <CheckCircle2 size={20}/> : hostData.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <h4 className={`font-black text-sm md:text-base ${isComplete ? 'text-emerald-800' : 'text-slate-800'}`}>{hostData.name}</h4>
                                                        <p className={`text-[10px] font-bold uppercase tracking-widest ${isComplete ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                            {hostData.done} of {hostData.total} Done
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className={`font-black text-lg ${isComplete ? 'text-emerald-600' : 'text-[#6D2158]'}`}>
                                                    {staffPercentage}%
                                                </div>
                                            </div>

                                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div className={`h-full ${isComplete ? 'bg-emerald-500' : 'bg-[#6D2158]'}`} style={{width: `${staffPercentage}%`}}></div>
                                            </div>

                                            {!isComplete && hostData.pendingLocations.length > 0 && (
                                                <div className="mt-1 pt-3 border-t border-slate-100">
                                                    <p className="text-[9px] font-black uppercase text-rose-500 tracking-widest mb-2 flex items-center gap-1">
                                                        <AlertTriangle size={10}/> Waiting On:
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {hostData.pendingLocations.map((loc: string, i: number) => (
                                                            <span key={i} className="px-2 py-1 bg-rose-50 border border-rose-100 text-rose-700 rounded text-[10px] font-black flex items-center gap-1">
                                                                <MapPin size={10}/> {loc}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}