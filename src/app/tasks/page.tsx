"use client";
import React, { useState, useEffect } from 'react';
import { 
  CheckSquare, Plus, Bell, CalendarDays, RefreshCw, 
  Trash2, Loader2, CheckCircle2, Shield, Calendar, Box, X, Users, MapPin, AlertTriangle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import PageHeader from '@/components/PageHeader';

export default function AdminTaskHub() {
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const [tasks, setTasks] = useState<any[]>([]);
    const [inventorySchedules, setInventorySchedules] = useState<any[]>([]);

    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [newTask, setNewTask] = useState({ title: '', description: '', frequency: 'One-Off', due_date: format(new Date(), 'yyyy-MM-dd') });

    // --- PROGRESS MODAL STATE ---
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

        // Fetch Tasks
        const { data: tasksData } = await supabase.from('hsk_admin_tasks').select('*').order('due_date', { ascending: true });
        if (tasksData) setTasks(tasksData);

        // Fetch LIVE Inventory Schedules & Progress
        // We include host_id here so we can group the progress by staff member
        const { data: activeSchedules } = await supabase.from('hsk_inventory_schedules')
            .select(`
                id, 
                inventory_type, 
                month_year,
                assignments:hsk_inventory_assignments(id, status, host_id, villa_number)
            `)
            .eq('status', 'Active');
        
        // Also fetch hosts so we can map host_id to a real name
        const { data: hosts } = await supabase.from('hsk_hosts').select('host_id, full_name');
        const hostMap: Record<string, string> = {};
        if (hosts) {
            hosts.forEach(h => hostMap[h.host_id] = h.full_name);
        }
        
        if (activeSchedules) {
            const mappedSchedules = activeSchedules.map(sched => {
                const total = sched.assignments.length;
                const done = sched.assignments.filter((a: any) => a.status === 'Submitted').length;
                const percentage = total === 0 ? 0 : Math.round((done / total) * 100);
                
                // Group assignments by host
                const hostProgress: Record<string, { name: string, total: number, done: number, pendingLocations: string[] }> = {};
                
                sched.assignments.forEach((a: any) => {
                    const hId = a.host_id || 'unassigned';
                    if (!hostProgress[hId]) {
                        hostProgress[hId] = { 
                            name: hostMap[hId] || hId, 
                            total: 0, 
                            done: 0,
                            pendingLocations: []
                        };
                    }
                    hostProgress[hId].total += 1;
                    if (a.status === 'Submitted') {
                        hostProgress[hId].done += 1;
                    } else {
                        hostProgress[hId].pendingLocations.push(a.villa_number);
                    }
                });

                // Convert object to sorted array (those with most pending items at the top)
                const detailedProgress = Object.values(hostProgress).sort((a, b) => {
                    return (b.total - b.done) - (a.total - a.done);
                });

                return { ...sched, total, done, percentage, detailedProgress };
            });
            setInventorySchedules(mappedSchedules);
        }

        setIsLoading(false);
    };

    const handleAddTask = async () => {
        if (!newTask.title.trim()) return toast.error('Task title is required');
        const { data, error } = await supabase.from('hsk_admin_tasks').insert([newTask]).select().single();
        
        if (!error && data) {
            setTasks([...tasks, data].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()));
            setIsTaskModalOpen(false);
            setNewTask({ title: '', description: '', frequency: 'One-Off', due_date: format(new Date(), 'yyyy-MM-dd') });
            toast.success('Task Added!');
        } else {
            toast.error('Failed to add task.');
        }
    };

    const handleCompleteTask = async (id: string, isCurrentlyComplete: boolean) => {
        const newStatus = isCurrentlyComplete ? 'Pending' : 'Completed';
        const { error } = await supabase.from('hsk_admin_tasks').update({ 
            status: newStatus, 
            completed_at: newStatus === 'Completed' ? new Date().toISOString() : null
        }).eq('id', id);

        if (!error) {
            setTasks(tasks.map(t => t.id === id ? { ...t, status: newStatus } : t));
            if (newStatus === 'Completed') toast.success('Task Completed!');
        }
    };

    const handleDeleteTask = async (id: string) => {
        if (!confirm('Are you sure you want to permanently delete this task?')) return;
        const { error } = await supabase.from('hsk_admin_tasks').delete().eq('id', id);
        if (!error) {
            setTasks(tasks.filter(t => t.id !== id));
            toast.success('Task Deleted');
        }
    };

    const handleNotifyTask = async (task: any) => {
        toast.success('Sending reminder to team...');
        try {
            await fetch('/api/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    title: `Action Required: ${task.title}`, 
                    body: task.description || 'Please check your dashboard tasks for details.' 
                })
            });
        } catch (e) {}
    };

    if (isLoading) return <div className="flex-1 flex items-center justify-center h-full"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>;

    if (!isAdmin) return (
        <div className="flex flex-col items-center justify-center h-[70vh] text-center p-8">
            <div className="w-24 h-24 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-6"><Shield size={40} /></div>
            <h2 className="text-3xl font-black text-slate-800 tracking-tight">Access Restricted</h2>
        </div>
    );

    const pendingTasks = tasks.filter(t => t.status === 'Pending');
    const completedTasks = tasks.filter(t => t.status === 'Completed');

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
                                    <div 
                                        key={sched.id} 
                                        onClick={() => setSelectedScheduleProgress(sched)}
                                        className="space-y-2 cursor-pointer p-4 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all group"
                                    >
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

                {/* RIGHT: TASK MANAGEMENT */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 flex flex-col min-h-[500px]">
                        
                        <div className="p-6 md:p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
                            <div>
                                <h3 className="font-black text-xl text-[#6D2158] flex items-center gap-2"><CheckSquare size={24}/> Action Center</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Manage Checklists & Reminders</p>
                            </div>
                            <button onClick={() => setIsTaskModalOpen(true)} className="px-6 py-3 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-md hover:bg-[#5a1b49] active:scale-95 transition-all flex items-center gap-2 justify-center">
                                <Plus size={16}/> New Task
                            </button>
                        </div>

                        <div className="p-4 md:p-8 flex-1 overflow-y-auto">
                            
                            {/* PENDING TASKS */}
                            <div className="mb-8">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Pending Tasks ({pendingTasks.length})</h4>
                                {pendingTasks.length === 0 ? (
                                    <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400">
                                        <CheckSquare size={40} className="mx-auto mb-3 opacity-20"/>
                                        <p className="font-bold text-sm">All caught up! No pending tasks.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {pendingTasks.map(task => {
                                            const isOverdue = parseISO(task.due_date) < new Date(new Date().setHours(0,0,0,0));
                                            const isToday = task.due_date === format(new Date(), 'yyyy-MM-dd');
                                            
                                            return (
                                                <div key={task.id} className={`p-4 md:p-5 rounded-2xl border transition-all flex items-start gap-4 group ${isOverdue ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200 hover:border-[#6D2158]'}`}>
                                                    
                                                    <button onClick={() => handleCompleteTask(task.id, false)} className="w-8 h-8 rounded-xl border-2 border-slate-300 flex items-center justify-center shrink-0 hover:border-emerald-500 hover:bg-emerald-50 transition-colors shadow-sm bg-white">
                                                        <CheckCircle2 size={18} className="text-emerald-500 opacity-0 hover:opacity-100 transition-opacity"/>
                                                    </button>
                                                    
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-black text-base text-slate-800 leading-tight mb-1">{task.title}</h4>
                                                        {task.description && <p className="text-sm font-medium text-slate-500 mb-3">{task.description}</p>}
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md flex items-center gap-1 border ${task.frequency !== 'One-Off' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                                                                <RefreshCw size={12}/> {task.frequency}
                                                            </span>
                                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md flex items-center gap-1 border ${isOverdue ? 'bg-rose-100 border-rose-200 text-rose-700' : isToday ? 'bg-amber-100 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                                                                <CalendarDays size={12}/> {isToday ? 'Today' : isOverdue ? 'Overdue' : format(parseISO(task.due_date), 'MMM d, yyyy')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex flex-col gap-2 shrink-0">
                                                        <button onClick={() => handleNotifyTask(task)} className="p-3 text-slate-400 bg-white border border-slate-200 rounded-xl hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 transition-colors shadow-sm" title="Send reminder push notification">
                                                            <Bell size={18}/>
                                                        </button>
                                                        <button onClick={() => handleDeleteTask(task.id)} className="p-3 text-slate-400 bg-white border border-slate-200 rounded-xl hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors shadow-sm" title="Delete Task">
                                                            <Trash2 size={18}/>
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* COMPLETED TASKS */}
                            {completedTasks.length > 0 && (
                                <div className="pt-6 border-t border-slate-100">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Completed ({completedTasks.length})</h4>
                                    <div className="space-y-3 opacity-60">
                                        {completedTasks.map(task => (
                                            <div key={task.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-4">
                                                <button onClick={() => handleCompleteTask(task.id, true)} className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 shadow-sm" title="Mark as incomplete">
                                                    <CheckCircle2 size={18}/>
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-sm text-slate-500 line-through">{task.title}</h4>
                                                </div>
                                                <button onClick={() => handleDeleteTask(task.id)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors">
                                                    <Trash2 size={16}/>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </div>

            {/* --- ADD TASK MODAL --- */}
            {isTaskModalOpen && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl flex flex-col animate-in zoom-in-95 overflow-hidden">
                        <div className="p-6 bg-[#6D2158] text-white flex justify-between items-center">
                            <div>
                                <h3 className="font-black text-xl flex items-center gap-2"><Plus size={20}/> New Task</h3>
                                <p className="text-[10px] uppercase tracking-widest text-white/70 mt-1">Admin Action Center</p>
                            </div>
                            <button onClick={() => setIsTaskModalOpen(false)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"><X size={18}/></button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 block ml-1">Task Title</label>
                                <input type="text" placeholder="e.g. Monthly Deep Cleaning Audit" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158] transition-colors" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} autoFocus/>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 block ml-1">Notes / Instructions (Optional)</label>
                                <textarea rows={3} placeholder="Add any details here..." className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-[#6D2158] transition-colors resize-none" value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 block ml-1">Frequency</label>
                                    <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158]" value={newTask.frequency} onChange={e => setNewTask({...newTask, frequency: e.target.value})}>
                                        <option value="One-Off">One-Off</option>
                                        <option value="Daily">Daily</option>
                                        <option value="Weekly">Weekly</option>
                                        <option value="Monthly">Monthly</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 block ml-1">Due Date</label>
                                    <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158]" value={newTask.due_date} onChange={e => setNewTask({...newTask, due_date: e.target.value})}/>
                                </div>
                            </div>
                        </div>
                        
                        <div className="p-6 bg-slate-50 border-t border-slate-100">
                            <button onClick={handleAddTask} disabled={!newTask.title.trim()} className="w-full py-4 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-sm shadow-lg hover:bg-[#5a1b49] disabled:opacity-50 transition-all active:scale-95">
                                Save Task
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

                                            {/* Progress Bar */}
                                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div className={`h-full ${isComplete ? 'bg-emerald-500' : 'bg-[#6D2158]'}`} style={{width: `${staffPercentage}%`}}></div>
                                            </div>

                                            {/* Display pending locations if they are not finished! */}
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