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
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

interface UniformRecord {
  id: string;
  uniform_number: string;
  host_name: string;
  ssl_no: string;
  department: string;
  designation: string;
  notes?: string;
}

// Helper: Normalize series format (e.g. "fb - 01", "FB 1", "FB-1" -> "FB-01")
const normalizeUniformNumber = (val: string): string => {
  if (!val) return "";
  const cleaned = val.trim().toUpperCase();
  // Match prefix and numbers: e.g. "FB - 01" or "HK 12"
  const match = cleaned.match(/^([A-Z]+)\s*[-_ ]*\s*(\d+)$/);
  if (match) {
    const prefix = match[1];
    const num = parseInt(match[2], 10);
    // Standardize to 2-digit minimum (01, 02, ... 10, 11)
    const formattedNum = num < 10 ? `0${num}` : `${num}`;
    return `${prefix}-${formattedNum}`;
  }
  return cleaned.replace(/\s+/g, "");
};

// Helper: Split prefix and numeric value for sorting and vacancy calculation
const parseUniformNumber = (val: string): { prefix: string; num: number } => {
  const match = val.match(/^([A-Z]+)-(\d+)$/);
  if (match) {
    return { prefix: match[1], num: parseInt(match[2], 10) };
  }
  return { prefix: "OTHER", num: 0 };
};

export default function UniformDirectoryPage() {
  const [records, setRecords] = useState<UniformRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDept, setSelectedDept] = useState("ALL");
  const [activeTab, setActiveTab] = useState<"ASSIGNED" | "VACANT">("ASSIGNED");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<UniformRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
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
      .select("*");

    if (error) {
      toast.error("Failed to load uniform roster: " + error.message);
    } else {
      // Normalize and sort in memory
      const list = (data || []).map((r: UniformRecord) => ({
        ...r,
        uniform_number: normalizeUniformNumber(r.uniform_number),
      }));

      list.sort((a: UniformRecord, b: UniformRecord) => {
        const pA = parseUniformNumber(a.uniform_number);
        const pB = parseUniformNumber(b.uniform_number);
        if (pA.prefix !== pB.prefix) return pA.prefix.localeCompare(pB.prefix);
        return pA.num - pB.num;
      });

      setRecords(list);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchUniforms();
  }, [fetchUniforms]);

  // Unique departments for filter
  const departments = useMemo(() => {
    const depts = new Set(records.map((r) => r.department).filter(Boolean));
    return Array.from(depts).sort();
  }, [records]);

  // --- COMPUTE VACANT / MISSING UNIFORM NUMBERS PER SERIES ---
  const vacantUniforms = useMemo(() => {
    // Group existing numbers by prefix and track the department
    const prefixMap = new Map<string, { nums: Set<number>; dept: string }>();

    records.forEach((r) => {
      const { prefix, num } = parseUniformNumber(r.uniform_number);
      if (prefix !== "OTHER" && num > 0) {
        if (!prefixMap.has(prefix)) {
          prefixMap.set(prefix, { nums: new Set(), dept: r.department || "" });
        }
        prefixMap.get(prefix)!.nums.add(num);
      }
    });

    const vacantList: { uniform_number: string; prefix: string; department: string }[] = [];

    prefixMap.forEach(({ nums, dept }, prefix) => {
      const maxNum = Math.max(...Array.from(nums));
      for (let i = 1; i < maxNum; i++) {
        if (!nums.has(i)) {
          const numStr = i < 10 ? `0${i}` : `${i}`;
          vacantList.push({
            uniform_number: `${prefix}-${numStr}`,
            prefix,
            department: dept,
          });
        }
      }
    });

    return vacantList.sort((a, b) => {
      const pA = parseUniformNumber(a.uniform_number);
      const pB = parseUniformNumber(b.uniform_number);
      if (pA.prefix !== pB.prefix) return pA.prefix.localeCompare(pB.prefix);
      return pA.num - pB.num;
    });
  }, [records]);

  // Filtered Assigned Records
  const filteredRecords = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return records.filter((item) => {
      const matchesSearch =
        !q ||
        item.uniform_number?.toLowerCase().includes(q) ||
        item.host_name?.toLowerCase().includes(q) ||
        item.ssl_no?.toLowerCase().includes(q) ||
        item.designation?.toLowerCase().includes(q);

      const matchesDept = selectedDept === "ALL" || item.department === selectedDept;

      return matchesSearch && matchesDept;
    });
  }, [records, searchTerm, selectedDept]);

  // Filtered Vacant List
  const filteredVacant = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return vacantUniforms.filter((item) => {
      const matchesSearch =
        !q ||
        item.uniform_number?.toLowerCase().includes(q) ||
        item.department?.toLowerCase().includes(q);

      const matchesDept = selectedDept === "ALL" || item.department === selectedDept;
      return matchesSearch && matchesDept;
    });
  }, [vacantUniforms, searchTerm, selectedDept]);

  // --- CSV PARSING & IMPORT ---
  const parseCSVLine = (text: string) => {
    const re_value =
      /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\S\s][^'\\]*)*)'|"([^"\\]*(?:\\[\S\s][^"\\]*)*)"|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g;
    const result: string[] = [];
    text.replace(re_value, (m0, m1, m2, m3) => {
      if (m1 !== undefined) result.push(m1.replace(/\\'/g, "'"));
      else if (m2 !== undefined) result.push(m2.replace(/\\"/g, '"'));
      else if (m3 !== undefined) result.push(m3);
      return "";
    });
    return result.length > 0 ? result : text.split(",").map((s) => s.trim());
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        if (!text) throw new Error("File is empty");

        const lines = text
          .split(/\r\n|\n/)
          .map((l) => l.trim())
          .filter(Boolean);

        if (lines.length < 2) {
          toast.error("CSV file must have headers and at least one host row.");
          setIsUploading(false);
          return;
        }

        const headers = parseCSVLine(lines[0]).map((h) =>
          h.toLowerCase().replace(/[^a-z0-9]/g, "")
        );

        const uniformIdx = headers.findIndex(
          (h) => h.includes("uniform") || h.includes("uniformno") || h === "no"
        );
        const nameIdx = headers.findIndex(
          (h) => h.includes("hostname") || h.includes("name") || h.includes("host")
        );
        const sslIdx = headers.findIndex(
          (h) => h.includes("ssl") || h.includes("sslno") || h.includes("staffid")
        );
        const deptIdx = headers.findIndex(
          (h) => h.includes("dep") || h.includes("department")
        );
        const desigIdx = headers.findIndex(
          (h) => h.includes("designation") || h.includes("position") || h.includes("title")
        );

        if (uniformIdx === -1 || sslIdx === -1) {
          toast.error("CSV must contain columns: 'Uniform No' and 'SSL NO'.");
          setIsUploading(false);
          return;
        }

        const toUpsert: any[] = [];

        for (let i = 1; i < lines.length; i++) {
          const row = parseCSVLine(lines[i]);
          const rawUniform = row[uniformIdx]?.trim();
          const sslNo = row[sslIdx]?.trim();
          const hostName = nameIdx !== -1 && row[nameIdx] ? row[nameIdx].trim() : "Host";
          const dept = deptIdx !== -1 && row[deptIdx] ? row[deptIdx].trim() : "";
          const desig = desigIdx !== -1 && row[desigIdx] ? row[desigIdx].trim() : "";

          if (rawUniform && sslNo) {
            toUpsert.push({
              uniform_number: normalizeUniformNumber(rawUniform),
              host_name: hostName,
              ssl_no: sslNo,
              department: dept,
              designation: desig,
            });
          }
        }

        if (toUpsert.length === 0) {
          toast.error("No valid records found in CSV.");
          setIsUploading(false);
          return;
        }

        const { error } = await supabase
          .from("hsk_laundry_uniforms")
          .upsert(toUpsert, { onConflict: "uniform_number" });

        if (error) {
          toast.error(error.message || "Failed to import CSV.");
        } else {
          toast.success(`Imported ${toUpsert.length} uniform records!`);
          fetchUniforms();
        }
      } catch (err: any) {
        toast.error("Failed to parse CSV: " + (err.message || "Unknown error"));
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const csvContent =
      "Uniform No,Host Name,SSL NO,Department,Designation\nFB-01,Ali Ahmed,SSL 1234,Food & Beverage,Waiter\nFB-03,Ibrahim Rasheed,SSL 1450,Food & Beverage,Captain\nHK-01,Hassan Manik,SSL 1620,Housekeeping,Villa Attendant\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "uniform_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportCSV = () => {
    if (records.length === 0) {
      toast.error("No records to export.");
      return;
    }

    const headers = ["Uniform No", "Host Name", "SSL NO", "Department", "Designation"];
    const rows = records.map((r) => [
      `"${r.uniform_number || ""}"`,
      `"${r.host_name || ""}"`,
      `"${r.ssl_no || ""}"`,
      `"${r.department || ""}"`,
      `"${r.designation || ""}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `uniform_directory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
      department: "",
      designation: "",
      notes: "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: UniformRecord) => {
    setEditingRecord(item);
    setFormData({
      uniform_number: item.uniform_number,
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
    const cleanUniform = normalizeUniformNumber(formData.uniform_number);

    if (!cleanUniform || !formData.host_name.trim() || !formData.ssl_no.trim()) {
      toast.error("Uniform #, Host Name, and SSL # are required.");
      return;
    }

    setIsSaving(true);

    if (editingRecord) {
      const { error } = await supabase
        .from("hsk_laundry_uniforms")
        .update({
          uniform_number: cleanUniform,
          host_name: formData.host_name.trim(),
          ssl_no: formData.ssl_no.trim(),
          department: formData.department.trim(),
          designation: formData.designation.trim(),
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
          host_name: formData.host_name.trim(),
          ssl_no: formData.ssl_no.trim(),
          department: formData.department.trim(),
          designation: formData.designation.trim(),
          notes: formData.notes.trim(),
        },
      ]);

      if (error) {
        toast.error(error.message || "Uniform Number already exists.");
      } else {
        toast.success("Host uniform added.");
        setIsModalOpen(false);
        fetchUniforms();
      }
    }

    setIsSaving(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove uniform record for ${name}?`)) return;

    const { error } = await supabase.from("hsk_laundry_uniforms").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete record.");
    } else {
      toast.success("Record deleted.");
      setRecords((prev) => prev.filter((r) => r.id !== id));
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto flex flex-col gap-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-[#6D2158] flex items-center gap-2">
            <Shirt className="h-8 w-8 text-[#6D2158]" /> Host Uniform Directory
          </h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
            Laundry Hub • Uniform Allocation & Tracking
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-purple-50 text-[#6D2158] border border-purple-200 hover:bg-purple-100 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
            title="Upload CSV"
          >
            {isUploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            Import CSV
          </button>

          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
            title="Download CSV format template"
          >
            <FileSpreadsheet size={15} /> Template
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
            title="Export Directory"
          >
            <Download size={15} /> Export
          </button>

          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#6D2158] hover:bg-[#5a1b49] text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all active:scale-95"
          >
            <Plus size={16} /> Add Host
          </button>
        </div>
      </div>

      {/* TABS: ASSIGNED vs VACANT */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setActiveTab("ASSIGNED")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
            activeTab === "ASSIGNED"
              ? "bg-[#6D2158] text-white shadow-md"
              : "bg-white border border-slate-200 text-slate-500 hover:text-[#6D2158]"
          }`}
        >
          <CheckCircle2 size={15} /> Assigned Uniforms ({records.length})
        </button>

        <button
          onClick={() => setActiveTab("VACANT")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
            activeTab === "VACANT"
              ? "bg-amber-600 text-white shadow-md"
              : "bg-white border border-slate-200 text-slate-500 hover:text-amber-600"
          }`}
        >
          <AlertCircle size={15} /> Vacant / Available ({vacantUniforms.length})
        </button>
      </div>

      {/* Search and Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
          <input
            type="text"
            className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158] transition-colors shadow-sm"
            placeholder={
              activeTab === "ASSIGNED"
                ? "Search Uniform #, Host Name, SSL #, or Designation..."
                : "Search Vacant Uniform # or Department..."
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="relative">
          <Filter className="absolute left-3.5 top-3.5 text-slate-400" size={16} />
          <select
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158] transition-colors shadow-sm appearance-none cursor-pointer"
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

      {/* TAB 1: ASSIGNED UNIFORMS TABLE */}
      {activeTab === "ASSIGNED" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center items-center py-24">
              <Loader2 className="animate-spin text-[#6D2158]" size={32} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-4 text-xs font-black text-[#6D2158] uppercase tracking-wider">
                      Uniform #
                    </th>
                    <th className="p-4 text-xs font-black text-[#6D2158] uppercase tracking-wider">
                      Host Name
                    </th>
                    <th className="p-4 text-xs font-black text-[#6D2158] uppercase tracking-wider">
                      SSL NO
                    </th>
                    <th className="p-4 text-xs font-black text-[#6D2158] uppercase tracking-wider">
                      Department
                    </th>
                    <th className="p-4 text-xs font-black text-[#6D2158] uppercase tracking-wider">
                      Designation
                    </th>
                    <th className="p-4 text-xs font-black text-[#6D2158] uppercase tracking-wider text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 italic font-bold">
                        No assigned uniform records found.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="p-4 font-black text-sm text-[#6D2158]">
                          <span className="px-2.5 py-1 bg-purple-50 text-[#6D2158] border border-purple-100 rounded-lg font-mono">
                            {item.uniform_number}
                          </span>
                        </td>
                        <td className="p-4 font-bold text-sm text-slate-800">{item.host_name}</td>
                        <td className="p-4 font-mono font-bold text-xs text-slate-500">
                          {item.ssl_no}
                        </td>
                        <td className="p-4 font-bold text-xs text-slate-600">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-600">
                            {item.department || "—"}
                          </span>
                        </td>
                        <td className="p-4 font-bold text-xs text-slate-500">
                          {item.designation || "—"}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditModal(item)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id, item.host_name)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: VACANT UNIFORMS (AUTO-DETECTED GAPS) */}
      {activeTab === "VACANT" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 bg-amber-50/50 border-b border-amber-100 text-amber-800 text-xs font-bold flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-600 shrink-0" />
            <span>
              These uniform numbers are gaps inside your active number series and currently unassigned. Click <strong>Assign</strong> to allocate one to a new host.
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-4 text-xs font-black text-slate-600 uppercase tracking-wider">
                    Available Uniform #
                  </th>
                  <th className="p-4 text-xs font-black text-slate-600 uppercase tracking-wider">
                    Series Prefix
                  </th>
                  <th className="p-4 text-xs font-black text-slate-600 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="p-4 text-xs font-black text-slate-600 uppercase tracking-wider text-right">
                    Quick Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVacant.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400 italic font-bold">
                      No vacant uniform numbers found. All series numbers are continuous!
                    </td>
                  </tr>
                ) : (
                  filteredVacant.map((item) => (
                    <tr key={item.uniform_number} className="hover:bg-amber-50/20 transition-colors">
                      <td className="p-4 font-black text-sm text-amber-700">
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg font-mono">
                          {item.uniform_number}
                        </span>
                      </td>
                      <td className="p-4 font-mono font-bold text-xs text-slate-500">
                        {item.prefix}
                      </td>
                      <td className="p-4 font-bold text-xs text-slate-600">
                        {item.department || "—"}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => openAddModalWithVacant(item.uniform_number, item.department)}
                          className="px-3.5 py-1.5 bg-[#6D2158] hover:bg-[#5a1b49] text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all"
                        >
                          Assign To Host
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Uniform Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-black text-slate-800 text-lg">
                  {editingRecord ? "Edit Uniform Record" : "Add Host Uniform"}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  Laundry Hub Roster
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 bg-white rounded-full shadow-sm text-slate-400 hover:text-rose-500 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  Department
                </label>
                <input
                  type="text"
                  list="dept-list"
                  placeholder="e.g. Food & Beverage"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158] focus:bg-white transition-all"
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
                  Uniform Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. FB-11 (or type FB 11, FB-01)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158] focus:bg-white transition-all font-mono"
                  value={formData.uniform_number}
                  onChange={(e) => setFormData({ ...formData, uniform_number: e.target.value })}
                  onBlur={(e) =>
                    setFormData({
                      ...formData,
                      uniform_number: normalizeUniformNumber(e.target.value),
                    })
                  }
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Auto-formats into standardized <code>PREFIX-NUMBER</code> format on save.
                </span>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  Host Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ali Ahmed"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158] focus:bg-white transition-all"
                  value={formData.host_name}
                  onChange={(e) => setFormData({ ...formData, host_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    SSL NO *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SSL 1234"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158] focus:bg-white transition-all font-mono"
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158] focus:bg-white transition-all"
                    value={formData.designation}
                    onChange={(e) =>
                      setFormData({ ...formData, designation: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-3.5 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-[#5a1b49] active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
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