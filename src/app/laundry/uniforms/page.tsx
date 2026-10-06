"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Shirt,
  Search,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Loader2,
  Filter,
  Download,
  Upload,
  FileSpreadsheet,
  UserPlus,
  Palmtree,
  UserMinus,
  Calendar,
  RotateCcw,
  History,
  Minus,
  Tag,
} from "lucide-react";
import { Toaster, toast } from "react-hot-toast";
import { supabase } from "@/lib/supabase";

interface UniformRecord {
  id: string;
  uniform_number: string | null;
  host_name: string;
  ssl_no: string;
  department: string;
  designation: string;
  status?: "Active" | "On Leave" | "Resigned";
  leave_start_date?: string | null;
  leave_return_date?: string | null;
  notes?: string;
}

interface IssuanceHistoryItem {
  id: string;
  uniform_id: string;
  year: number;
  month: number;
  item_type: string;
  quantity: number;
  issue_date: string;
  notes?: string;
  created_at: string;
}

const DEFAULT_UNIFORM_ITEMS = [
  { key: "shirt", label: "Shirts", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "trouser", label: "Trousers", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "tshirt", label: "T-Shirts", color: "bg-purple-50 text-purple-700 border-purple-200" },
  { key: "shorts", label: "Shorts", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "belt", label: "Belts", color: "bg-orange-50 text-orange-700 border-orange-200" },
  { key: "raincoat", label: "Rain Coats", color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
];

const formatTitleCase = (name: string): string => {
  if (!name) return "";
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      if (word.includes(".")) {
        return word
          .split(".")
          .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ""))
          .join(".");
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
};

const normalizeUniformNumber = (val: string): string => {
  if (!val) return "";
  const cleaned = val.trim().toUpperCase();

  const match = cleaned.match(/^([A-Z]+)\s*[-_ ]*\s*(\d+)$/);
  if (match) {
    const prefix = match[1];
    const num = parseInt(match[2], 10);
    if (prefix.startsWith("D")) {
      return `${prefix}-${num}`;
    }
    const formattedNum = num < 10 ? `0${num}` : `${num}`;
    return `${prefix}-${formattedNum}`;
  }
  return cleaned.replace(/\s+/g, "");
};

const parseUniformNumber = (val: string | null): { prefix: string; num: number } => {
  if (!val) return { prefix: "OTHER", num: 999999 };
  const match = val.match(/^([A-Z]+)-(\d+)$/);
  if (match) {
    return { prefix: match[1], num: parseInt(match[2], 10) };
  }
  return { prefix: "OTHER", num: 0 };
};

const calculateLeaveDaysRemaining = (returnDateStr?: string | null) => {
  if (!returnDateStr) return { days: 0, text: "No return date", isOverdue: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const returnDate = new Date(returnDateStr);
  returnDate.setHours(0, 0, 0, 0);

  const diffTime = returnDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { days: Math.abs(diffDays), text: `${Math.abs(diffDays)}d Overdue`, isOverdue: true };
  } else if (diffDays === 0) {
    return { days: 0, text: "Returns Today", isOverdue: false };
  } else {
    return { days: diffDays, text: `${diffDays} days left`, isOverdue: false };
  }
};

export default function UniformDirectoryPage() {
  const [records, setRecords] = useState<UniformRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDept, setSelectedDept] = useState("ALL");
  const [viewFilter, setViewFilter] = useState<"ALL" | "LEAVE_ONLY">("ALL");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Leave Modal State
  const [leaveModal, setLeaveModal] = useState<{
    isOpen: boolean;
    record: UniformRecord | null;
    startDate: string;
    returnDate: string;
  }>({
    isOpen: false,
    record: null,
    startDate: "",
    returnDate: "",
  });
  const [isSavingLeave, setIsSavingLeave] = useState(false);

  // Resign Confirmation Modal
  const [resignModal, setResignModal] = useState<{
    isOpen: boolean;
    record: UniformRecord | null;
  }>({
    isOpen: false,
    record: null,
  });
  const [isProcessingResign, setIsProcessingResign] = useState(false);

  // Issue Uniform Direct Modal State
  const [issueModal, setIssueModal] = useState<{
    isOpen: boolean;
    record: UniformRecord | null;
    issueDate: string;
    notes: string;
  }>({
    isOpen: false,
    record: null,
    issueDate: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [issueQuantities, setIssueQuantities] = useState<Record<string, number>>({});
  const [customItems, setCustomItems] = useState(DEFAULT_UNIFORM_ITEMS);
  const [isSavingIssuance, setIsSavingIssuance] = useState(false);

  // Issuance History Modal State
  const [historyModal, setHistoryModal] = useState<{
    isOpen: boolean;
    record: UniformRecord | null;
    history: IssuanceHistoryItem[];
    isLoading: boolean;
  }>({
    isOpen: false,
    record: null,
    history: [],
    isLoading: false,
  });

  // Manual Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<UniformRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    uniform_number: "",
    host_name: "",
    ssl_no: "",
    department: "",
    designation: "",
    notes: "",
  });

  const fetchUniforms = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("hsk_laundry_uniforms")
      .select("*")
      .neq("status", "Resigned");

    if (error) {
      toast.error("Failed to load uniform roster: " + error.message);
    } else {
      const list = (data || []).map((r: UniformRecord) => ({
        ...r,
        host_name: formatTitleCase(r.host_name),
        uniform_number: r.uniform_number ? normalizeUniformNumber(r.uniform_number) : null,
        status: r.status || "Active",
      }));

      setRecords(list);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchUniforms();
  }, [fetchUniforms]);

  const departments = useMemo(() => {
    const depts = new Set(records.map((r) => r.department).filter(Boolean));
    return Array.from(depts).sort();
  }, [records]);

  const leaveRecords = useMemo(() => {
    return records.filter((r) => r.status === "On Leave");
  }, [records]);

  // Unified list generation
  const displayItems = useMemo(() => {
    const prefixGroups = new Map<string, { recordsByNum: Map<number, UniformRecord>; departments: Set<string> }>();
    const specialRecords: UniformRecord[] = [];

    records.forEach((r) => {
      const { prefix, num } = parseUniformNumber(r.uniform_number);
      if (prefix !== "OTHER" && !prefix.startsWith("D") && num > 0 && num < 999999) {
        if (!prefixGroups.has(prefix)) {
          prefixGroups.set(prefix, { recordsByNum: new Map(), departments: new Set() });
        }
        const group = prefixGroups.get(prefix)!;
        group.recordsByNum.set(num, r);
        if (r.department) {
          group.departments.add(r.department);
        }
      } else {
        specialRecords.push(r);
      }
    });

    const fullUnifiedList: {
      key: string;
      isVacant: boolean;
      uniform_number: string;
      host_name: string;
      ssl_no: string;
      department: string;
      designation: string;
      status?: "Active" | "On Leave" | "Resigned";
      leave_start_date?: string | null;
      leave_return_date?: string | null;
      record?: UniformRecord;
    }[] = [];

    prefixGroups.forEach(({ recordsByNum, departments }, prefix) => {
      const numbers = Array.from(recordsByNum.keys());
      const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
      const primaryDept = Array.from(departments).join(" / ") || "—";

      for (let i = 1; i <= maxNum; i++) {
        const numStr = i < 10 ? `0${i}` : `${i}`;
        const uniformCode = `${prefix}-${numStr}`;

        if (recordsByNum.has(i)) {
          const rec = recordsByNum.get(i)!;
          fullUnifiedList.push({
            key: rec.id,
            isVacant: false,
            uniform_number: uniformCode,
            host_name: rec.host_name,
            ssl_no: rec.ssl_no,
            department: rec.department,
            designation: rec.designation,
            status: rec.status,
            leave_start_date: rec.leave_start_date,
            leave_return_date: rec.leave_return_date,
            record: rec,
          });
        } else {
          fullUnifiedList.push({
            key: `vacant-${uniformCode}`,
            isVacant: true,
            uniform_number: uniformCode,
            host_name: "Vacant",
            ssl_no: "—",
            department: primaryDept,
            designation: "Available for Assignment",
          });
        }
      }
    });

    specialRecords.forEach((rec) => {
      fullUnifiedList.push({
        key: rec.id,
        isVacant: false,
        uniform_number: rec.uniform_number || "Unassigned",
        host_name: rec.host_name,
        ssl_no: rec.ssl_no,
        department: rec.department,
        designation: rec.designation,
        status: rec.status,
        leave_start_date: rec.leave_start_date,
        leave_return_date: rec.leave_return_date,
        record: rec,
      });
    });

    return fullUnifiedList.sort((a, b) => {
      const pA = parseUniformNumber(a.uniform_number);
      const pB = parseUniformNumber(b.uniform_number);
      if (pA.prefix !== pB.prefix) return pA.prefix.localeCompare(pB.prefix);
      return pA.num - pB.num;
    });
  }, [records]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return displayItems.filter((item) => {
      const matchesSearch =
        !q ||
        item.uniform_number?.toLowerCase().includes(q) ||
        item.host_name?.toLowerCase().includes(q) ||
        item.ssl_no?.toLowerCase().includes(q) ||
        item.designation?.toLowerCase().includes(q);

      const matchesDept = selectedDept === "ALL" || item.department.toLowerCase().includes(selectedDept.toLowerCase());
      const matchesLeave = viewFilter === "ALL" || (!item.isVacant && item.status === "On Leave");

      return matchesSearch && matchesDept && matchesLeave;
    });
  }, [displayItems, searchTerm, selectedDept, viewFilter]);

  // Open Direct Issuance Modal
  const openDirectIssueModal = (rec: UniformRecord) => {
    const initQty: Record<string, number> = {};
    customItems.forEach((item) => {
      initQty[item.key] = 0;
    });
    setIssueQuantities(initQty);
    setIssueModal({
      isOpen: true,
      record: rec,
      issueDate: new Date().toISOString().split("T")[0],
      notes: "",
    });
  };

  // Save Direct Issuance (Synchronizes with Tracker Table)
  const handleSaveDirectIssuance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueModal.record) return;

    const issuedDateObj = new Date(issueModal.issueDate);
    const year = issuedDateObj.getFullYear();
    const month = issuedDateObj.getMonth() + 1;

    const toInsert: any[] = [];
    Object.entries(issueQuantities).forEach(([itemType, qty]) => {
      if (qty > 0) {
        toInsert.push({
          uniform_id: issueModal.record!.id,
          year,
          month,
          item_type: itemType,
          quantity: qty,
          issue_date: issueModal.issueDate,
          notes: issueModal.notes || null,
        });
      }
    });

    if (toInsert.length === 0) {
      toast.error("Please specify quantity for at least one item.");
      return;
    }

    setIsSavingIssuance(true);
    try {
      const { error } = await supabase.from("hsk_uniform_issuances").insert(toInsert);
      if (error) throw error;

      toast.success(`Uniform issued to ${issueModal.record.host_name}!`);
      setIssueModal({
        isOpen: false,
        record: null,
        issueDate: new Date().toISOString().split("T")[0],
        notes: "",
      });
    } catch (err: any) {
      toast.error("Failed to record issuance: " + err.message);
    } finally {
      setIsSavingIssuance(false);
    }
  };

  // Open Issuance History Modal
  const openHistoryModal = async (rec: UniformRecord) => {
    setHistoryModal({
      isOpen: true,
      record: rec,
      history: [],
      isLoading: true,
    });

    const { data, error } = await supabase
      .from("hsk_uniform_issuances")
      .select("*")
      .eq("uniform_id", rec.id)
      .order("issue_date", { ascending: false });

    if (error) {
      toast.error("Failed to load history: " + error.message);
      setHistoryModal((prev) => ({ ...prev, isLoading: false }));
    } else {
      setHistoryModal((prev) => ({
        ...prev,
        history: data || [],
        isLoading: false,
      }));
    }
  };

  // Delete an issuance record from history
  const handleDeleteHistoryItem = async (itemId: string) => {
    if (!confirm("Are you sure you want to delete this issuance entry?")) return;

    const { error } = await supabase.from("hsk_uniform_issuances").delete().eq("id", itemId);
    if (error) {
      toast.error("Failed to remove: " + error.message);
    } else {
      toast.success("Issuance record removed.");
      setHistoryModal((prev) => ({
        ...prev,
        history: prev.history.filter((h) => h.id !== itemId),
      }));
    }
  };

  // Resignation
  const handleConfirmResign = async () => {
    if (!resignModal.record) return;
    setIsProcessingResign(true);

    try {
      const { error } = await supabase
        .from("hsk_laundry_uniforms")
        .update({
          uniform_number: null,
          status: "Resigned",
        })
        .eq("id", resignModal.record.id);

      if (error) throw error;

      toast.success(`${resignModal.record.host_name} marked as Resigned. Uniform slot is now vacant!`);
      setResignModal({ isOpen: false, record: null });
      fetchUniforms();
    } catch (err: any) {
      toast.error("Failed to process resignation: " + err.message);
    } finally {
      setIsProcessingResign(false);
    }
  };

  // Leave handling
  const openLeaveModal = (rec: UniformRecord) => {
    setLeaveModal({
      isOpen: true,
      record: rec,
      startDate: rec.leave_start_date || new Date().toISOString().split("T")[0],
      returnDate: rec.leave_return_date || "",
    });
  };

  const handleSaveLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveModal.record || !leaveModal.returnDate) {
      toast.error("Please specify a Return Date.");
      return;
    }

    setIsSavingLeave(true);
    try {
      const { error } = await supabase
        .from("hsk_laundry_uniforms")
        .update({
          status: "On Leave",
          leave_start_date: leaveModal.startDate || null,
          leave_return_date: leaveModal.returnDate,
        })
        .eq("id", leaveModal.record.id);

      if (error) throw error;

      toast.success(`${leaveModal.record.host_name} is now marked On Annual Leave!`);
      setLeaveModal({ isOpen: false, record: null, startDate: "", returnDate: "" });
      fetchUniforms();
    } catch (err: any) {
      toast.error("Failed to update leave: " + err.message);
    } finally {
      setIsSavingLeave(false);
    }
  };

  const handleMarkReturned = async (rec: UniformRecord) => {
    try {
      const { error } = await supabase
        .from("hsk_laundry_uniforms")
        .update({
          status: "Active",
          leave_start_date: null,
          leave_return_date: null,
        })
        .eq("id", rec.id);

      if (error) throw error;

      toast.success(`${rec.host_name} marked returned & active.`);
      fetchUniforms();
    } catch (err: any) {
      toast.error("Failed to return host: " + err.message);
    }
  };

  const openAddModalWithVacant = (vacantNo: string, dept: string) => {
    setEditingRecord(null);
    setFormData({
      uniform_number: vacantNo,
      host_name: "",
      ssl_no: "",
      department: dept,
      designation: "",
      notes: "",
    });
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingRecord(null);
    setFormData({
      uniform_number: "",
      host_name: "",
      ssl_no: "",
      department: selectedDept !== "ALL" ? selectedDept : "",
      designation: "",
      notes: "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: UniformRecord) => {
    setEditingRecord(item);
    setFormData({
      uniform_number: item.uniform_number || "",
      host_name: item.host_name,
      ssl_no: item.ssl_no,
      department: item.department,
      designation: item.designation,
      notes: item.notes || "",
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUniform = formData.uniform_number.trim()
      ? normalizeUniformNumber(formData.uniform_number)
      : null;

    if (!formData.host_name.trim()) {
      toast.error("Host Name is required.");
      return;
    }

    const titleCasedName = formatTitleCase(formData.host_name);
    const titleCasedDesig = formatTitleCase(formData.designation);

    setIsSaving(true);

    if (editingRecord) {
      const { error } = await supabase
        .from("hsk_laundry_uniforms")
        .update({
          uniform_number: cleanUniform,
          host_name: titleCasedName,
          ssl_no: formData.ssl_no.trim() || "Pending",
          department: formData.department.trim(),
          designation: titleCasedDesig,
          notes: formData.notes.trim(),
        })
        .eq("id", editingRecord.id);

      if (error) {
        toast.error(error.message || "Failed to update record.");
      } else {
        toast.success("Uniform details updated.");
        setIsModalOpen(false);
        fetchUniforms();
      }
    } else {
      const { error } = await supabase.from("hsk_laundry_uniforms").insert([
        {
          uniform_number: cleanUniform,
          host_name: titleCasedName,
          ssl_no: formData.ssl_no.trim() || "Pending",
          department: formData.department.trim(),
          designation: titleCasedDesig,
          status: "Active",
          notes: formData.notes.trim(),
        },
      ]);

      if (error) {
        toast.error(error.message || "Failed to insert record.");
      } else {
        toast.success("Host uniform added.");
        setIsModalOpen(false);
        fetchUniforms();
      }
    }

    setIsSaving(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to completely delete record for ${name}?`)) return;

    const { error } = await supabase.from("hsk_laundry_uniforms").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete record.");
    } else {
      toast.success("Record deleted.");
      setRecords((prev) => prev.filter((r) => r.id !== id));
    }
  };

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-7xl mx-auto flex flex-col gap-4 sm:gap-6 pb-24 md:pb-8">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-[#6D2158] flex items-center gap-2">
            <Shirt className="h-6 w-6 sm:h-8 sm:w-8 text-[#6D2158]" /> Host Uniform Directory
          </h1>
          <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">
            Laundry Hub • Uniform Allocation & Live Tracker Integration
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={openAddModal}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#6D2158] hover:bg-[#5a1b49] text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all active:scale-95 ml-auto"
          >
            <Plus size={15} />
            <span>Add Host</span>
          </button>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setViewFilter("ALL")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all shrink-0 ${
            viewFilter === "ALL"
              ? "bg-[#6D2158] text-white shadow-sm"
              : "bg-white border border-slate-200 text-slate-500 hover:text-[#6D2158]"
          }`}
        >
          <Shirt size={14} /> Full Registry ({displayItems.length})
        </button>

        <button
          onClick={() => setViewFilter("LEAVE_ONLY")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all shrink-0 ${
            viewFilter === "LEAVE_ONLY"
              ? "bg-amber-600 text-white shadow-sm"
              : "bg-white border border-slate-200 text-slate-500 hover:text-amber-600"
          }`}
        >
          <Palmtree size={14} /> On Annual Leave ({leaveRecords.length})
        </button>
      </div>

      {/* Search and Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs sm:text-sm outline-none focus:border-[#6D2158] transition-colors shadow-2xs"
            placeholder="Search by Uniform #, Host Name, SSL #, or Title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="relative">
          <Filter className="absolute left-3.5 top-3 text-slate-400" size={15} />
          <select
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs sm:text-sm outline-none focus:border-[#6D2158] transition-colors shadow-2xs appearance-none cursor-pointer"
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* DIRECTORY VIEW */}
      <div className="bg-white rounded-2xl shadow-2xs border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="animate-spin text-[#6D2158]" size={28} />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center text-slate-400 italic font-bold text-xs sm:text-sm">
            No records found matching your filters.
          </div>
        ) : (
          <>
            {/* MOBILE CARD VIEW */}
            <div className="block md:hidden divide-y divide-slate-100">
              {filteredItems.map((item) => {
                const leaveInfo = !item.isVacant && item.status === "On Leave" ? calculateLeaveDaysRemaining(item.leave_return_date) : null;

                return (
                  <div
                    key={item.key}
                    className={`p-3.5 flex flex-col gap-2.5 transition-colors ${
                      item.isVacant ? "bg-amber-50/20" : item.status === "On Leave" ? "bg-orange-50/20" : "hover:bg-slate-50/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono font-black text-xs px-2.5 py-1 rounded-lg border ${
                            item.isVacant
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-purple-50 text-[#6D2158] border-purple-100"
                          }`}
                        >
                          {item.uniform_number}
                        </span>

                        {item.isVacant ? (
                          <span className="text-[10px] uppercase font-black tracking-wider text-amber-700 bg-amber-100/60 px-2 py-0.5 rounded">
                            Vacant
                          </span>
                        ) : item.status === "On Leave" ? (
                          <span
                            className={`text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded flex items-center gap-1 ${
                              leaveInfo?.isOverdue
                                ? "bg-rose-100 text-rose-700"
                                : "bg-orange-100 text-orange-800"
                            }`}
                          >
                            <Palmtree size={10} /> {leaveInfo?.text}
                          </span>
                        ) : null}
                      </div>

                      {/* Action Trays on Mobile */}
                      <div>
                        {item.isVacant ? (
                          <button
                            onClick={() => openAddModalWithVacant(item.uniform_number, item.department)}
                            className="flex items-center gap-1 px-3 py-1 bg-[#6D2158] text-white rounded-lg text-xs font-black uppercase tracking-wider shadow-2xs active:scale-95"
                          >
                            <UserPlus size={12} /> Assign
                          </button>
                        ) : (
                          <div className="flex items-center gap-1">
                            {/* ISSUE UNIFORM DIRECTLY */}
                            <button
                              onClick={() => item.record && openDirectIssueModal(item.record)}
                              className="p-1.5 text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg active:scale-95"
                              title="Issue Uniform"
                            >
                              <Shirt size={14} />
                            </button>

                            {/* HISTORY */}
                            <button
                              onClick={() => item.record && openHistoryModal(item.record)}
                              className="p-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg active:scale-95"
                              title="Issuance History"
                            >
                              <History size={14} />
                            </button>

                            {/* LEAVE / RETURN */}
                            {item.status === "On Leave" ? (
                              <button
                                onClick={() => item.record && handleMarkReturned(item.record)}
                                className="p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg"
                                title="Mark Returned"
                              >
                                <RotateCcw size={14} />
                              </button>
                            ) : (
                              <button
                                onClick={() => item.record && openLeaveModal(item.record)}
                                className="p-1.5 text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg"
                                title="Annual Leave"
                              >
                                <Palmtree size={14} />
                              </button>
                            )}

                            {/* RESIGN */}
                            <button
                              onClick={() => item.record && setResignModal({ isOpen: true, record: item.record })}
                              className="p-1.5 text-slate-400 hover:text-rose-600 bg-slate-50 rounded-lg"
                              title="Resign"
                            >
                              <UserMinus size={14} />
                            </button>

                            {/* EDIT */}
                            <button
                              onClick={() => item.record && openEditModal(item.record)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 bg-slate-50 rounded-lg"
                              title="Edit"
                            >
                              <Edit2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start justify-between text-xs">
                      <div>
                        <h4 className={`font-black ${item.isVacant ? "text-slate-400 italic" : "text-slate-800"}`}>
                          {item.host_name}
                        </h4>
                        <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                          {item.designation || "—"}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="font-mono text-[11px] font-bold text-slate-500 block">
                          {item.ssl_no}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mt-0.5">
                          {item.department || "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP TABLE VIEW */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-3.5 text-xs font-black text-[#6D2158] uppercase tracking-wider">
                      Uniform #
                    </th>
                    <th className="p-3.5 text-xs font-black text-[#6D2158] uppercase tracking-wider">
                      Host Name
                    </th>
                    <th className="p-3.5 text-xs font-black text-[#6D2158] uppercase tracking-wider">
                      SSL NO
                    </th>
                    <th className="p-3.5 text-xs font-black text-[#6D2158] uppercase tracking-wider">
                      Department
                    </th>
                    <th className="p-3.5 text-xs font-black text-[#6D2158] uppercase tracking-wider">
                      Designation
                    </th>
                    <th className="p-3.5 text-xs font-black text-[#6D2158] uppercase tracking-wider text-center">
                      Status
                    </th>
                    <th className="p-3.5 text-xs font-black text-[#6D2158] uppercase tracking-wider text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((item) => {
                    const leaveInfo = !item.isVacant && item.status === "On Leave" ? calculateLeaveDaysRemaining(item.leave_return_date) : null;

                    return (
                      <tr
                        key={item.key}
                        className={`transition-colors ${
                          item.isVacant
                            ? "bg-amber-50/20 hover:bg-amber-50/30"
                            : item.status === "On Leave"
                            ? "bg-orange-50/20 hover:bg-orange-50/30"
                            : "hover:bg-slate-50/60"
                        }`}
                      >
                        <td className="p-3.5 font-black text-sm">
                          <span
                            className={`px-2.5 py-1 rounded-lg font-mono text-xs border ${
                              item.isVacant
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : "bg-purple-50 text-[#6D2158] border-purple-100"
                            }`}
                          >
                            {item.uniform_number}
                          </span>
                        </td>
                        <td className="p-3.5 font-bold text-sm">
                          {item.isVacant ? (
                            <span className="text-amber-700 font-bold italic text-xs">
                              Vacant (Available)
                            </span>
                          ) : (
                            <span className="text-slate-800 font-bold">{item.host_name}</span>
                          )}
                        </td>
                        <td className="p-3.5 font-mono font-bold text-xs text-slate-500">
                          {item.ssl_no}
                        </td>
                        <td className="p-3.5 font-bold text-xs text-slate-600">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-600">
                            {item.department || "—"}
                          </span>
                        </td>
                        <td className="p-3.5 font-bold text-xs text-slate-500">
                          {item.designation || "—"}
                        </td>
                        <td className="p-3.5 text-center">
                          {!item.isVacant && item.status === "On Leave" ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                                leaveInfo?.isOverdue
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-orange-100 text-orange-800"
                              }`}
                            >
                              <Palmtree size={12} /> {leaveInfo?.text}
                            </span>
                          ) : !item.isVacant ? (
                            <span className="text-[11px] font-bold text-emerald-600">Active</span>
                          ) : (
                            <span className="text-[11px] font-bold text-amber-600 italic">—</span>
                          )}
                        </td>
                        <td className="p-3.5 text-right">
                          {item.isVacant ? (
                            <button
                              onClick={() => openAddModalWithVacant(item.uniform_number, item.department)}
                              className="px-3 py-1.5 bg-[#6D2158] hover:bg-[#5a1b49] text-white rounded-lg text-xs font-black uppercase tracking-wider shadow-2xs transition-all active:scale-95"
                            >
                              Assign Host
                            </button>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              {/* ISSUE UNIFORM */}
                              <button
                                onClick={() => item.record && openDirectIssueModal(item.record)}
                                className="flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-[#6D2158] border border-purple-200 hover:bg-purple-100 rounded-lg text-xs font-black transition-all active:scale-95"
                                title="Issue Uniform to Host"
                              >
                                <Shirt size={13} />
                                <span>Issue</span>
                              </button>

                              {/* HISTORY */}
                              <button
                                onClick={() => item.record && openHistoryModal(item.record)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="View Uniform History"
                              >
                                <History size={15} />
                              </button>

                              {/* LEAVE / RETURN */}
                              {item.status === "On Leave" ? (
                                <button
                                  onClick={() => item.record && handleMarkReturned(item.record)}
                                  className="flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
                                  title="Mark Returned"
                                >
                                  <RotateCcw size={12} /> Return
                                </button>
                              ) : (
                                <button
                                  onClick={() => item.record && openLeaveModal(item.record)}
                                  className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                                  title="Annual Leave"
                                >
                                  <Palmtree size={15} />
                                </button>
                              )}

                              {/* RESIGN */}
                              <button
                                onClick={() => item.record && setResignModal({ isOpen: true, record: item.record })}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Resign Host"
                              >
                                <UserMinus size={15} />
                              </button>

                              {/* EDIT */}
                              <button
                                onClick={() => item.record && openEditModal(item.record)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Edit Host Details"
                              >
                                <Edit2 size={15} />
                              </button>

                              {/* DELETE */}
                              <button
                                onClick={() => item.record && handleDelete(item.record.id, item.host_name)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Delete Record"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* DIRECT ISSUE UNIFORM MODAL */}
      {issueModal.isOpen && issueModal.record && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="p-3.5 border-b border-slate-100 bg-purple-50 flex justify-between items-center">
              <div>
                <h3 className="font-black text-[#6D2158] text-sm flex items-center gap-1.5">
                  <Shirt size={16} /> Issue Uniform
                </h3>
                <p className="text-[11px] font-bold text-purple-900/70 mt-0.5">
                  {issueModal.record.host_name} • {issueModal.record.uniform_number || issueModal.record.ssl_no}
                </p>
              </div>
              <button
                onClick={() => setIssueModal({ isOpen: false, record: null, issueDate: "", notes: "" })}
                className="p-1 bg-white rounded-full text-slate-400 hover:text-rose-500"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleSaveDirectIssuance} className="p-3.5 space-y-3 overflow-y-auto">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Issue Date *
                </label>
                <input
                  type="date"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-bold text-slate-700 outline-none focus:border-[#6D2158]"
                  value={issueModal.issueDate}
                  onChange={(e) => setIssueModal({ ...issueModal, issueDate: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Items to Issue
                </label>
                <div className="space-y-1.5 max-h-[42vh] overflow-y-auto pr-1">
                  {customItems.map((item) => {
                    const currentQty = issueQuantities[item.key] || 0;
                    return (
                      <div
                        key={item.key}
                        className="p-2 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between"
                      >
                        <span className="font-bold text-xs text-slate-700">{item.label}</span>

                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                          <button
                            type="button"
                            onClick={() =>
                              setIssueQuantities({
                                ...issueQuantities,
                                [item.key]: Math.max(0, currentQty - 1),
                              })
                            }
                            className="p-1 text-slate-500 hover:bg-slate-100 rounded active:scale-95"
                          >
                            <Minus size={12} />
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={currentQty}
                            onChange={(e) =>
                              setIssueQuantities({
                                ...issueQuantities,
                                [item.key]: Math.max(0, parseInt(e.target.value, 10) || 0),
                              })
                            }
                            className="w-8 text-center font-mono font-black text-xs text-[#6D2158] outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setIssueQuantities({
                                ...issueQuantities,
                                [item.key]: currentQty + 1,
                              })
                            }
                            className="p-1 text-slate-500 hover:bg-slate-100 rounded active:scale-95"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Initial issue, Replacement..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-bold text-slate-700 outline-none focus:border-[#6D2158]"
                  value={issueModal.notes}
                  onChange={(e) => setIssueModal({ ...issueModal, notes: e.target.value })}
                />
              </div>

              <div className="pt-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setIssueModal({ isOpen: false, record: null, issueDate: "", notes: "" })}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingIssuance}
                  className="flex-[1.5] py-2.5 bg-[#6D2158] hover:bg-[#5a1b49] text-white rounded-xl font-bold text-xs shadow-md flex items-center justify-center gap-1 active:scale-95"
                >
                  {isSavingIssuance ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Confirm Issue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ISSUANCE HISTORY MODAL */}
      {historyModal.isOpen && historyModal.record && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[85vh]">
            <div className="p-3.5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-black text-slate-800 text-sm flex items-center gap-1.5">
                  <History size={16} className="text-[#6D2158]" /> Issuance History
                </h3>
                <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                  {historyModal.record.host_name} ({historyModal.record.uniform_number || historyModal.record.ssl_no})
                </p>
              </div>
              <button
                onClick={() => setHistoryModal({ isOpen: false, record: null, history: [], isLoading: false })}
                className="p-1 bg-white rounded-full text-slate-400 hover:text-rose-500"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-3.5 overflow-y-auto space-y-2">
              {historyModal.isLoading ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="animate-spin text-[#6D2158]" size={24} />
                </div>
              ) : historyModal.history.length === 0 ? (
                <div className="py-10 text-center text-slate-400 italic font-bold text-xs">
                  No uniform issuance records found for this host.
                </div>
              ) : (
                historyModal.history.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-black text-slate-800 flex items-center gap-2">
                        <span>{item.quantity} × {formatTitleCase(item.item_type)}</span>
                        <span className="text-[10px] text-slate-400 font-mono font-normal">
                          {item.issue_date}
                        </span>
                      </div>
                      {item.notes && (
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">{item.notes}</p>
                      )}
                    </div>

                    <button
                      onClick={() => handleDeleteHistoryItem(item.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                      title="Delete Entry"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-slate-100 bg-slate-50">
              <button
                type="button"
                onClick={() => setHistoryModal({ isOpen: false, record: null, history: [], isLoading: false })}
                className="w-full py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANNUAL LEAVE MODAL */}
      {leaveModal.isOpen && leaveModal.record && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 bg-orange-50 flex justify-between items-center">
              <div>
                <h3 className="font-black text-orange-950 text-base flex items-center gap-2">
                  <Palmtree size={18} className="text-orange-600" /> Annual Leave
                </h3>
                <p className="text-[11px] font-bold text-orange-800/70 mt-0.5">
                  {leaveModal.record.host_name} ({leaveModal.record.uniform_number})
                </p>
              </div>
              <button
                onClick={() => setLeaveModal({ isOpen: false, record: null, startDate: "", returnDate: "" })}
                className="p-1.5 bg-white rounded-full text-slate-400 hover:text-rose-500"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveLeave} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  Leave Start Date
                </label>
                <input
                  type="date"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-700 outline-none focus:border-orange-500"
                  value={leaveModal.startDate}
                  onChange={(e) => setLeaveModal({ ...leaveModal, startDate: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  Expected Return Date *
                </label>
                <input
                  type="date"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-700 outline-none focus:border-orange-500"
                  value={leaveModal.returnDate}
                  onChange={(e) => setLeaveModal({ ...leaveModal, returnDate: e.target.value })}
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setLeaveModal({ isOpen: false, record: null, startDate: "", returnDate: "" })}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black uppercase tracking-wider text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingLeave}
                  className="flex-[2] py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-black uppercase tracking-wider text-xs shadow-md flex items-center justify-center gap-1.5"
                >
                  {isSavingLeave ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  Set On Leave
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESIGN CONFIRMATION MODAL */}
      {resignModal.isOpen && resignModal.record && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden p-6 text-center animate-in zoom-in-95">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <UserMinus size={24} />
            </div>
            <h3 className="font-black text-slate-800 text-lg">Resign Host?</h3>
            <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
              Are you sure you want to mark <strong>{resignModal.record.host_name}</strong> as resigned?
            </p>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 my-4 text-xs font-bold text-amber-800 text-left">
              Uniform Number <strong>{resignModal.record.uniform_number}</strong> will immediately become <strong>Vacant</strong> and ready to assign to another host.
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setResignModal({ isOpen: false, record: null })}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black uppercase tracking-wider text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessingResign}
                onClick={handleConfirmResign}
                className="flex-[1.5] py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black uppercase tracking-wider text-xs shadow-md flex items-center justify-center gap-1.5"
              >
                {isProcessingResign ? <Loader2 size={15} className="animate-spin" /> : <UserMinus size={15} />}
                Confirm Resign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL ADD / EDIT HOST MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-black text-slate-800 text-base sm:text-lg">
                  {editingRecord ? "Edit Uniform Record" : "Add Host Uniform"}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  Laundry Hub Roster
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 bg-white rounded-full shadow-2xs text-slate-400 hover:text-rose-500"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-4 sm:p-6 space-y-3.5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  Department
                </label>
                <input
                  type="text"
                  list="dept-list"
                  placeholder="e.g. F&B SERVICE"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs sm:text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158] focus:bg-white transition-all"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                />
                <datalist id="dept-list">
                  {departments.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  Uniform Number (Leave blank if pending)
                </label>
                <input
                  type="text"
                  placeholder="e.g. FB-02 or DFB-1"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs sm:text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158] focus:bg-white transition-all font-mono"
                  value={formData.uniform_number}
                  onChange={(e) => setFormData({ ...formData, uniform_number: e.target.value })}
                  onBlur={(e) =>
                    setFormData({
                      ...formData,
                      uniform_number: e.target.value.trim() ? normalizeUniformNumber(e.target.value) : "",
                    })
                  }
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  Host Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ali Ahmed"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs sm:text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158] focus:bg-white transition-all"
                  value={formData.host_name}
                  onChange={(e) => setFormData({ ...formData, host_name: e.target.value })}
                  onBlur={(e) =>
                    setFormData({
                      ...formData,
                      host_name: formatTitleCase(e.target.value),
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    SSL NO
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SSL 1234"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs sm:text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158] focus:bg-white transition-all font-mono"
                    value={formData.ssl_no}
                    onChange={(e) => setFormData({ ...formData, ssl_no: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    Designation
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Waiter"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs sm:text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158] focus:bg-white transition-all"
                    value={formData.designation}
                    onChange={(e) =>
                      setFormData({ ...formData, designation: e.target.value })
                    }
                    onBlur={(e) =>
                      setFormData({
                        ...formData,
                        designation: formatTitleCase(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-3 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-md hover:bg-[#5a1b49] active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  {editingRecord ? "Save Changes" : "Save Uniform Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}