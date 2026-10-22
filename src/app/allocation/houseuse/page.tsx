"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Building2, Plus, Calendar, Clock, User, 
  Trash2, Edit3, CheckCircle2, AlertCircle, X, Search, RefreshCw 
} from "lucide-react";
import toast from "react-hot-toast";

interface HouseUseRecord {
  id?: string;
  villa_number: string;
  villa_type: "HOUSE_USE" | "SHOW_VILLA";
  host_name: string;
  department: string;
  purpose: string;
  start_date: string;
  end_date: string;
  check_in_time: string;
  check_out_time: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  notes: string;
}

export default function HouseUseManagementPage() {
  const [records, setRecords] = useState<HouseUseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "HOUSE_USE" | "SHOW_VILLA">("ALL");

  const [formData, setFormData] = useState<HouseUseRecord>({
    villa_number: "",
    villa_type: "HOUSE_USE",
    host_name: "",
    department: "Executive",
    purpose: "Host In-Villa Experience",
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
    check_in_time: "11:00 AM",
    check_out_time: "4:00 PM",
    status: "ACTIVE",
    notes: "",
  });

  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("hsk_house_use_villas")
        .select("*")
        .order("start_date", { ascending: false });

      if (error) throw error;
      setRecords(data || []);
    } catch (err: any) {
      toast.error("Failed to load house use villas: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({
      villa_number: "",
      villa_type: "HOUSE_USE",
      host_name: "",
      department: "Executive",
      purpose: "Host In-Villa Experience",
      start_date: new Date().toISOString().split("T")[0],
      end_date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
      check_in_time: "11:00 AM",
      check_out_time: "4:00 PM",
      status: "ACTIVE",
      notes: "",
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (rec: HouseUseRecord) => {
    setEditingId(rec.id || null);
    setFormData({ ...rec });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.villa_number || !formData.host_name) {
      return toast.error("Please enter Villa number and Host name.");
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from("hsk_house_use_villas")
          .update(formData)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Updated successfully!");
      } else {
        const { error } = await supabase
          .from("hsk_house_use_villas")
          .insert([formData]);
        if (error) throw error;
        toast.success("House Use / Show Villa registered!");
      }
      setIsModalOpen(false);
      fetchRecords();
    } catch (err: any) {
      toast.error("Save error: " + err.message);
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id || !confirm("Delete this house-use record?")) return;
    try {
      const { error } = await supabase
        .from("hsk_house_use_villas")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Record deleted");
      fetchRecords();
    } catch (err: any) {
      toast.error("Delete failed: " + err.message);
    }
  };

  const filteredRecords = records.filter((r) => {
    if (filterType !== "ALL" && r.villa_type !== filterType) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.villa_number.toLowerCase().includes(q) ||
      r.host_name.toLowerCase().includes(q) ||
      r.department.toLowerCase().includes(q) ||
      r.purpose.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-800 pb-32">
      {/* Header */}
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#6D2158]/10 text-[#6D2158] rounded-xl">
            <Building2 size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">House Use & Show Villas</h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
              Track Management Stays, Sales Inspections & In-Villa Experiences
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={fetchRecords}
            disabled={loading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all"
            title="Refresh List"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleOpenAdd}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-[#6D2158] hover:bg-[#521643] text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer"
          >
            <Plus size={16} /> Add House Use / Show Villa
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="max-w-6xl mx-auto flex flex-wrap justify-between items-center gap-3 mb-6">
        <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm w-full sm:w-72">
          <Search size={16} className="text-slate-400 mr-2 shrink-0" />
          <input
            type="text"
            placeholder="Search villa, host, or department..."
            className="bg-transparent text-xs font-bold outline-none w-full"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          {(["ALL", "HOUSE_USE", "SHOW_VILLA"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterType === type
                  ? "bg-[#6D2158] text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {type === "ALL" ? "All" : type === "HOUSE_USE" ? "House Use" : "Show Villas"}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Records */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRecords.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-400 font-bold text-sm bg-white rounded-2xl border border-slate-200">
            No active house use or show villas found. Click "Add House Use" to register one.
          </div>
        ) : (
          filteredRecords.map((r) => {
            const isHouseUse = r.villa_type === "HOUSE_USE";
            const todayStr = new Date().toISOString().split("T")[0];
            const isCurrentlyActive = r.start_date <= todayStr && r.end_date >= todayStr;

            return (
              <div
                key={r.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-slate-800">
                        V{r.villa_number}
                      </span>
                      <span
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                          isHouseUse
                            ? "bg-purple-100 text-purple-800 border border-purple-200"
                            : "bg-pink-100 text-pink-800 border border-pink-200"
                        }`}
                      >
                        {isHouseUse ? "House Use (H/U)" : "Show Villa"}
                      </span>
                    </div>

                    <span
                      className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                        isCurrentlyActive
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {isCurrentlyActive ? "Active Today" : "Scheduled"}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2 font-bold text-slate-700">
                      <User size={14} className="text-[#6D2158]" />
                      <span>{r.host_name}</span>
                      <span className="text-[10px] text-slate-400 font-medium">({r.department})</span>
                    </div>

                    <p className="text-[11px] font-medium text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <strong>Purpose:</strong> {r.purpose || "Operational Check"}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-600 pt-1">
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="text-slate-400 block uppercase">Check In</span>
                        <span>{r.start_date} @ {r.check_in_time}</span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="text-slate-400 block uppercase">Check Out</span>
                        <span>{r.end_date} @ {r.check_out_time}</span>
                      </div>
                    </div>

                    {r.notes && (
                      <p className="text-[10px] text-slate-400 italic mt-2">
                        Note: {r.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 mt-3 border-t border-slate-100">
                  <button
                    onClick={() => handleOpenEdit(r)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50"
                    title="Edit"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-50"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
              <h2 className="text-base font-black text-slate-800">
                {editingId ? "Edit Booking" : "Register House Use / Show Villa"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Villa Number
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 21"
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold outline-none focus:border-[#6D2158]"
                    value={formData.villa_number}
                    onChange={(e) => setFormData({ ...formData, villa_number: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Booking Category
                  </label>
                  <select
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold outline-none focus:border-[#6D2158]"
                    value={formData.villa_type}
                    onChange={(e: any) => setFormData({ ...formData, villa_type: e.target.value })}
                  >
                    <option value="HOUSE_USE">House Use (H/U)</option>
                    <option value="SHOW_VILLA">Show Villa</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Host / Occupant Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Mohamed Aboobakuru / GM Guest"
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold outline-none focus:border-[#6D2158]"
                  value={formData.host_name}
                  onChange={(e) => setFormData({ ...formData, host_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Housekeeping"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold outline-none focus:border-[#6D2158]"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Purpose
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. In-Villa Experience"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold outline-none focus:border-[#6D2158]"
                    value={formData.purpose}
                    onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold outline-none"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold outline-none"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Check-In Time
                  </label>
                  <input
                    type="text"
                    placeholder="11:00 AM"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold outline-none"
                    value={formData.check_in_time}
                    onChange={(e) => setFormData({ ...formData, check_in_time: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Check-Out Time
                  </label>
                  <input
                    type="text"
                    placeholder="4:00 PM"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold outline-none"
                    value={formData.check_out_time}
                    onChange={(e) => setFormData({ ...formData, check_out_time: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Special Notes / Instructions
                </label>
                <textarea
                  placeholder="Extra water, no housekeeping after 2 PM..."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-medium outline-none resize-none"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#6D2158] hover:bg-[#521643] text-white rounded-xl font-black uppercase tracking-wider shadow-md"
                >
                  Save Villa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}