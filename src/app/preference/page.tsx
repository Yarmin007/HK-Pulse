import { Star, Search, User, MessageSquare } from "lucide-react";

const guestPrefs = [
  { id: 1, room: "502", name: "Ahmed Yamin", status: "VIP", preference: "Extra pillows, prefers 500ml water (no gas)" },
  { id: 2, room: "104", name: "John Doe", status: "Regular", preference: "Allergic to feathers, use foam pillows" },
  { id: 3, room: "801", name: "Ali Mansoor", status: "VIP", preference: "Late service after 2:00 PM only" },
];

export default function GuestPreferences() {
  return (
    <div className="space-y-6 font-antiqua">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-primary italic">HK PULSE</h1>
          <h2 className="text-xl text-slate-600 font-bold">Guest Preference Hub</h2>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="relative mb-6">
          <Search className="absolute left-3 top-3 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Search by Room Number or Guest Name..." 
            className="w-full pl-10 pr-4 py-2 rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {guestPrefs.map((guest) => (
            <div key={guest.id} className="border border-slate-100 rounded-lg p-4 hover:shadow-md transition-shadow bg-slate-50/30">
              <div className="flex justify-between items-start mb-3">
                <span className="bg-primary text-white text-xs font-bold px-2 py-1 rounded">Room {guest.room}</span>
                {guest.status === 'VIP' && <Star size={16} className="text-amber-500 fill-amber-500" />}
              </div>
              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                <User size={14} className="text-slate-400" /> {guest.name}
              </h4>
              <div className="mt-3 p-3 bg-white border border-slate-100 rounded italic text-sm text-slate-600 flex gap-2">
                <MessageSquare size={16} className="text-primary flex-shrink-0" />
                "{guest.preference}"
              </div>
              <button className="mt-4 w-full text-xs font-bold text-primary uppercase tracking-widest border border-primary/20 py-2 rounded hover:bg-primary hover:text-white transition-colors">
                Edit Preferences
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}