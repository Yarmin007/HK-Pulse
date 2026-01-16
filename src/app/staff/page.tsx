import { 
  ClipboardList, 
  AlertTriangle, 
  Droplets, 
  Users, 
  ArrowUpRight, 
  CheckCircle 
} from "lucide-react";

export default function Dashboard() {
  // These would eventually come from your database
  const stats = [
    { label: "Open Requests", value: "08", icon: ClipboardList, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Critical Stock", value: "03", icon: AlertTriangle, color: "text-rose-600", bg: "bg-rose-50" },
    { label: "Staff On Duty", value: "12", icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Completed Today", value: "45", icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
  ];

  return (
    <div className="space-y-8 font-antiqua">
      {/* Welcome Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold text-primary italic">HK PULSE</h1>
          <p className="text-slate-500 mt-1 uppercase tracking-widest text-xs font-bold">Coordinator Command Center</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-slate-800">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <p className="text-sm text-primary font-bold">Shift: Morning (08:00 - 16:00)</p>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
            <div className={`absolute top-0 right-0 p-2 ${stat.bg} rounded-bl-xl text-slate-400 group-hover:text-primary transition-colors`}>
              <ArrowUpRight size={16} />
            </div>
            <div className="flex flex-col gap-4">
              <div className={`w-12 h-12 rounded-full ${stat.bg} ${stat.color} flex items-center justify-center`}>
                <stat.icon size={24} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">{stat.label}</p>
                <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Urgent Requests Table (Left 2/3) */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-bold text-slate-800 uppercase text-sm tracking-wider">Urgent Pending Requests</h3>
            <span className="text-[10px] text-rose-500 font-bold animate-pulse">LIVE UPDATES</span>
          </div>
          <div className="p-0">
            <table className="w-full text-left">
              <thead className="bg-white text-[10px] uppercase text-slate-400">
                <tr>
                  <th className="p-4">Room</th>
                  <th className="p-4">Item</th>
                  <th className="p-4">Time Elapsed</th>
                  <th className="p-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                <tr className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-bold">Room 302</td>
                  <td className="p-4 text-sm text-slate-600 italic">Extra Towels & Water</td>
                  <td className="p-4 text-xs text-rose-500 font-bold">12 Mins</td>
                  <td className="p-4 text-right">
                    <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-[10px] font-bold">PENDING</span>
                  </td>
                </tr>
                <tr className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-bold">Room 105</td>
                  <td className="p-4 text-sm text-slate-600 italic">Minibar Refill</td>
                  <td className="p-4 text-xs text-slate-400 font-bold">45 Mins</td>
                  <td className="p-4 text-right">
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-[10px] font-bold">ASSIGNED</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Inventory Alert (Right 1/3) */}
        <div className="bg-primary text-white p-6 rounded-xl shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold mb-2">Inventory Notice</h3>
            <p className="text-white/70 text-sm font-antiqua italic mb-6">The following items are below the safety threshold:</p>
            
            <ul className="space-y-4">
              <li className="flex justify-between items-center border-b border-white/10 pb-2">
                <span className="text-sm">Water Bottles 500ml</span>
                <span className="bg-white/20 px-2 py-1 rounded text-xs font-bold">45 left</span>
              </li>
              <li className="flex justify-between items-center border-b border-white/10 pb-2">
                <span className="text-sm">R1 Bathroom Cleaner</span>
                <span className="bg-white/20 px-2 py-1 rounded text-xs font-bold">2 Ltr</span>
              </li>
            </ul>
          </div>
          
          <button className="mt-8 bg-white text-primary w-full py-3 rounded font-bold text-sm uppercase tracking-widest hover:bg-slate-100 transition-colors">
            Open Store Hub
          </button>
        </div>
      </div>
    </div>
  );
}