"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Filter,
  Plus,
  Minus,
  Save,
  X,
  Loader2,
  Download,
  Layers,
  ChevronLeft,
  ChevronRight,
  Shirt,
  Tag,
} from "lucide-react";
import { Toaster, toast } from "react-hot-toast";
import { supabase } from "@/lib/supabase";

interface HostUniform {
  id: string;
  uniform_number: string | null;
  host_name: string;
  ssl_no: string;
  department: string;
  designation: string;
  status?: string;
}

interface IssuanceRecord {
  id: string;
  uniform_id: string;
  year: number;
  month: number;
  item_type: string;
  quantity: number;
  issue_date?: string;
}

interface UniformItemDef {
  key: string;
  label: string;
  color: string;
}

const DEFAULT_ITEMS: UniformItemDef[] = [
  { key: "shirt", label: "Shirts", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "trouser", label: "Trousers", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "tshirt", label: "T-Shirts", color: "bg-purple-50 text-purple-700 border-purple-200" },
  { key: "shorts", label: "Shorts", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "belt", label: "Belts", color: "bg-orange-50 text-orange-700 border-orange-200" },
  { key: "raincoat", label: "Rain Coats", color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
];

const MONTHS = [
  { num: 1, label: "Jan" },
  { num: 2, label: "Feb" },
  { num: 3, label: "Mar" },
  { num: 4, label: "Apr" },
  { num: 5, label: "May" },
  { num: 6, label: "Jun" },
  { num: 7, label: "Jul" },
  { num: 8, label: "Aug" },
  { num: 9, label: "Sep" },
  { num: 10, label: "Oct" },
  { num: 11, label: "Nov" },
  { num: 12, label: "Dec" },
];

// Title Case formatter: First letter capital, rest lowercase
const formatTitleCase = (name: string): string => {
  if (!name) return "";
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export default function UniformTrackerPage() {
  const [hosts, setHosts] = useState<HostUniform[]>([]);
  const [issuances, setIssuances] = useState<IssuanceRecord[]>([]);
  const [customItems, setCustomItems] = useState<UniformItemDef[]>(DEFAULT_ITEMS);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedDept, setSelectedDept] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMobileHostId, setSelectedMobileHostId] = useState<string | null>(null);

  // Add New Product Modal State
  const [newProductModal, setNewProductModal] = useState(false);
  const [newProductName, setNewProductName] = useState("");

  // Edit Issuance Modal State
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    host: HostUniform | null;
    month: number;
    year: number;
  }>({
    isOpen: false,
    host: null,
    month: 1,
    year: selectedYear,
  });

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Fetch Hosts & Yearly Issuances
  const fetchData = useCallback(async () => {
    setIsLoading(true);

    const [hostsRes, issuanceRes] = await Promise.all([
      supabase
        .from("hsk_laundry_uniforms")
        .select("id, uniform_number, host_name, ssl_no, department, designation, status")
        .neq("status", "Resigned")
        .order("uniform_number", { ascending: true }),
      supabase
        .from("hsk_uniform_issuances")
        .select("*")
        .eq("year", selectedYear),
    ]);

    if (hostsRes.error) {
      toast.error("Failed to load hosts: " + hostsRes.error.message);
    } else {
      setHosts(hostsRes.data || []);
      if (hostsRes.data?.length && !selectedMobileHostId) {
        setSelectedMobileHostId(hostsRes.data[0].id);
      }
    }

    if (issuanceRes.error) {
      toast.error("Failed to load issuances: " + issuanceRes.error.message);
    } else {
      const records = issuanceRes.data || [];
      setIssuances(records);

      // Dynamically discover any items recorded in DB not in default list
      const discoveredKeys = new Set(records.map((r) => r.item_type));
      setCustomItems((prev) => {
        const existingKeys = new Set(prev.map((p) => p.key));
        const added = [...prev];
        discoveredKeys.forEach((k) => {
          if (!existingKeys.has(k)) {
            added.push({
              key: k,
              label: formatTitleCase(k),
              color: "bg-indigo-50 text-indigo-700 border-indigo-200",
            });
          }
        });
        return added;
      });
    }

    setIsLoading(false);
  }, [selectedYear, selectedMobileHostId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Unique departments for filter
  const departments = useMemo(() => {
    const depts = new Set(hosts.map((h) => h.department).filter(Boolean));
    return Array.from(depts).sort();
  }, [hosts]);

  // Add custom product to list
  const handleAddNewProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLabel = formatTitleCase(newProductName.trim());
    if (!cleanLabel) return;

    const key = cleanLabel.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (customItems.some((i) => i.key === key)) {
      toast.error("Product already exists!");
      return;
    }

    const newItem: UniformItemDef = {
      key,
      label: cleanLabel,
      color: "bg-rose-50 text-rose-700 border-rose-200",
    };

    setCustomItems((prev) => [...prev, newItem]);
    setNewProductName("");
    setNewProductModal(false);
    toast.success(`Added ${cleanLabel} to uniform items!`);
  };

  // Maps
  const { itemMap, monthItemsMap } = useMemo(() => {
    const itemMap = new Map<string, number>();
    const monthItemsMap = new Map<string, { key: string; label: string; qty: number; color: string }[]>();

    issuances.forEach((item) => {
      const itemKey = `${item.uniform_id}_${item.month}_${item.item_type}`;
      itemMap.set(itemKey, (itemMap.get(itemKey) || 0) + item.quantity);

      const monthKey = `${item.uniform_id}_${item.month}`;
      if (!monthItemsMap.has(monthKey)) {
        monthItemsMap.set(monthKey, []);
      }

      const itemDef = customItems.find((def) => def.key === item.item_type) || {
        key: item.item_type,
        label: formatTitleCase(item.item_type),
        color: "bg-slate-50 text-slate-700 border-slate-200",
      };

      const existingIndex = monthItemsMap.get(monthKey)!.findIndex((e) => e.key === item.item_type);
      if (existingIndex > -1) {
        monthItemsMap.get(monthKey)![existingIndex].qty += item.quantity;
      } else {
        monthItemsMap.get(monthKey)!.push({
          key: itemDef.key,
          label: itemDef.label,
          qty: item.quantity,
          color: itemDef.color,
        });
      }
    });

    return { itemMap, monthItemsMap };
  }, [issuances, customItems]);

  // Live Text Search + Department Filter
  const filteredHosts = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();

    return hosts.filter((h) => {
      const matchesSearch =
        !q ||
        h.host_name.toLowerCase().includes(q) ||
        h.ssl_no.toLowerCase().includes(q) ||
        h.department.toLowerCase().includes(q) ||
        h.designation?.toLowerCase().includes(q) ||
        h.uniform_number?.toLowerCase().includes(q);

      const matchesDept = selectedDept === "ALL" || h.department === selectedDept;

      return matchesSearch && matchesDept;
    });
  }, [hosts, searchTerm, selectedDept]);

  // Active host for Mobile spotlight
  const activeMobileHost = useMemo(() => {
    if (!filteredHosts.length) return null;
    return filteredHosts.find((h) => h.id === selectedMobileHostId) || filteredHosts[0];
  }, [filteredHosts, selectedMobileHostId]);

  // Open Edit Month Modal
  const openEditModal = (host: HostUniform, monthNum: number) => {
    const currentValues: Record<string, number> = {};
    customItems.forEach((item) => {
      const existing = itemMap.get(`${host.id}_${monthNum}_${item.key}`) || 0;
      currentValues[item.key] = existing;
    });

    setQuantities(currentValues);
    setEditModal({
      isOpen: true,
      host,
      month: monthNum,
      year: selectedYear,
    });
  };

  // Save Issuance
  const handleSaveMonth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.host) return;

    setIsSaving(true);
    try {
      const hostId = editModal.host.id;
      const m = editModal.month;
      const y = editModal.year;

      await supabase
        .from("hsk_uniform_issuances")
        .delete()
        .eq("uniform_id", hostId)
        .eq("year", y)
        .eq("month", m);

      const toInsert: any[] = [];
      Object.entries(quantities).forEach(([itemKey, qty]) => {
        if (qty > 0) {
          toInsert.push({
            uniform_id: hostId,
            year: y,
            month: m,
            item_type: itemKey,
            quantity: qty,
          });
        }
      });

      if (toInsert.length > 0) {
        const { error } = await supabase.from("hsk_uniform_issuances").insert(toInsert);
        if (error) throw error;
      }

      toast.success(`Saved ${MONTHS[m - 1].label} for ${formatTitleCase(editModal.host.host_name)}`);
      setEditModal({ isOpen: false, host: null, month: 1, year: selectedYear });
      fetchData();
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredHosts.length === 0) {
      toast.error("No host records to export.");
      return;
    }

    const headers = [
      "Uniform No",
      "Host Name",
      "SSL NO",
      "Department",
      "Position",
      ...MONTHS.map((m) => m.label),
    ];

    const rows = filteredHosts.map((host) => {
      const monthDetails = MONTHS.map((m) => {
        const items = monthItemsMap.get(`${host.id}_${m.num}`) || [];
        return items.length > 0
          ? `"${items.map((i) => `${i.qty} ${i.label}`).join(", ")}"`
          : '""';
      });

      return [
        `"${host.uniform_number || ""}"`,
        `"${formatTitleCase(host.host_name)}"`,
        `"${host.ssl_no}"`,
        `"${host.department}"`,
        `"${host.designation}"`,
        ...monthDetails,
      ];
    });

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `uniform_tracker_${selectedYear}.csv`;
    link.click();
  };

  return (
    <div className="p-2 sm:p-4 max-w-full mx-auto flex flex-col gap-2.5 pb-20 md:pb-4 text-slate-800">
      <Toaster position="top-right" />

      {/* COMPACT TOP BAR */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-[#6D2158]" />
          <h1 className="text-base sm:text-lg font-black text-[#6D2158] tracking-tight">
            Uniform Issuance Tracker
          </h1>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {filteredHosts.length} Hosts
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Add Product Button */}
          <button
            onClick={() => setNewProductModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-50 text-[#6D2158] border border-purple-200 hover:bg-purple-100 rounded-lg text-xs font-bold transition-all active:scale-95"
          >
            <Tag size={13} />
            <span>Add Product</span>
          </button>

          {/* Year Navigator */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-1.5 py-0.5 shadow-2xs">
            <button
              onClick={() => setSelectedYear((y) => y - 1)}
              className="p-1 hover:bg-slate-100 rounded text-slate-600 active:scale-95"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="font-mono font-black text-xs text-[#6D2158] px-2">
              {selectedYear}
            </span>
            <button
              onClick={() => setSelectedYear((y) => y + 1)}
              className="p-1 hover:bg-slate-100 rounded text-slate-600 active:scale-95"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-bold transition-all shrink-0"
            title="Export CSV"
          >
            <Download size={13} />
            <span className="hidden sm:inline text-[11px]">Export</span>
          </button>
        </div>
      </div>

      {/* SEARCH AND DEPARTMENT FILTER ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
          <input
            type="text"
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs sm:text-sm outline-none focus:border-[#6D2158] shadow-2xs placeholder:text-slate-400"
            placeholder="Type to search Host Name, SSL NO, or Designation..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              Clear
            </button>
          )}
        </div>

        {/* Department Filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-2.5 text-slate-400" size={14} />
          <select
            className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs sm:text-sm outline-none focus:border-[#6D2158] shadow-2xs appearance-none cursor-pointer"
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
          >
            <option value="ALL">All Departments ({hosts.length})</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ========================================================
          MOBILE VIEW: TOUCH-OPTIMIZED HOST STRIP + 12-MONTH GRID
          ======================================================== */}
      <div className="block lg:hidden space-y-2">
        {/* Horizontal Host Selector Pill Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          {filteredHosts.map((host) => {
            const isSelected = activeMobileHost?.id === host.id;
            return (
              <button
                key={host.id}
                onClick={() => setSelectedMobileHostId(host.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all border flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-[#6D2158] text-white border-[#6D2158] shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span className="font-mono text-[10px] opacity-80">{host.uniform_number || "—"}</span>
                <span>{formatTitleCase(host.host_name)}</span>
              </button>
            );
          })}
        </div>

        {/* Selected Host Spotlight Card */}
        {activeMobileHost ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs space-y-3">
            <div className="border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-purple-50 text-[#6D2158] border border-purple-100 font-mono font-black text-xs">
                  {activeMobileHost.uniform_number || "No Uniform"}
                </span>
                <h3 className="font-black text-sm text-slate-800">
                  {formatTitleCase(activeMobileHost.host_name)}
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                {activeMobileHost.ssl_no} • {activeMobileHost.department} • {activeMobileHost.designation}
              </p>
            </div>

            {/* 3x4 Grid for all 12 Months */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {MONTHS.map((m) => {
                const issuedItems = monthItemsMap.get(`${activeMobileHost.id}_${m.num}`) || [];
                const hasItems = issuedItems.length > 0;

                return (
                  <button
                    key={m.num}
                    onClick={() => openEditModal(activeMobileHost, m.num)}
                    className={`p-2 rounded-xl border text-left flex flex-col justify-between min-h-[64px] active:scale-95 transition-all ${
                      hasItems
                        ? "bg-purple-50/70 border-purple-200 shadow-2xs"
                        : "bg-slate-50/70 border-slate-100 text-slate-400 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-[10px] font-black uppercase text-slate-600">{m.label}</span>
                      {hasItems && <span className="w-1.5 h-1.5 rounded-full bg-[#6D2158]" />}
                    </div>

                    {hasItems ? (
                      <div className="flex flex-col gap-0.5">
                        {issuedItems.map((item) => (
                          <span
                            key={item.key}
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded border leading-tight ${item.color}`}
                          >
                            {item.qty} {item.label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300 font-mono">—</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-6 bg-white border border-slate-200 rounded-xl text-center text-xs text-slate-400 italic">
            No hosts found matching your search.
          </div>
        )}
      </div>

      {/* ========================================================
          DESKTOP VIEW: 1-SCREEN FULL MATRIX (NO ANNUAL SUMMARY)
          ======================================================== */}
      <div className="hidden lg:block bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="animate-spin text-[#6D2158]" size={24} />
          </div>
        ) : filteredHosts.length === 0 ? (
          <div className="p-8 text-center text-slate-400 italic font-bold text-xs">
            No hosts found matching your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="p-2 w-[70px] text-[#6D2158]">Uni #</th>
                  <th className="p-2 w-[160px] text-[#6D2158]">Host Name</th>
                  <th className="p-2 w-[75px]">SSL</th>
                  <th className="p-2 w-[110px]">Dept</th>
                  <th className="p-2 w-[110px]">Position</th>

                  {/* Exactly 12 Months Columns (Full-Width distribution) */}
                  {MONTHS.map((m) => (
                    <th key={m.num} className="p-1.5 text-center text-slate-700">
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredHosts.map((host) => {
                  return (
                    <tr key={host.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Uniform Number */}
                      <td className="p-2 font-black">
                        {host.uniform_number ? (
                          <span className="px-1.5 py-0.5 rounded bg-purple-50 text-[#6D2158] border border-purple-100 font-mono text-[10px]">
                            {host.uniform_number}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-[10px]">—</span>
                        )}
                      </td>

                      {/* Full Host Name */}
                      <td className="p-2 font-bold text-slate-800 truncate" title={host.host_name}>
                        {formatTitleCase(host.host_name)}
                      </td>

                      {/* SSL No */}
                      <td className="p-2 font-mono text-[10px] text-slate-500">{host.ssl_no}</td>

                      {/* Department */}
                      <td className="p-2 text-[10px] font-bold text-slate-600 truncate">{host.department}</td>

                      {/* Designation */}
                      <td className="p-2 text-[10px] font-bold text-slate-500 truncate">{host.designation || "—"}</td>

                      {/* 12 Month Cells with Full Item Names */}
                      {MONTHS.map((m) => {
                        const issuedItems = monthItemsMap.get(`${host.id}_${m.num}`) || [];
                        const hasItems = issuedItems.length > 0;

                        return (
                          <td key={m.num} className="p-0.5 text-center align-middle">
                            <button
                              onClick={() => openEditModal(host, m.num)}
                              className={`w-full min-h-[46px] p-1 rounded-lg transition-all active:scale-95 flex flex-col items-center justify-center gap-0.5 ${
                                hasItems
                                  ? "bg-purple-50/70 border border-purple-200 hover:bg-purple-100 shadow-2xs"
                                  : "hover:bg-slate-100 text-slate-300"
                              }`}
                              title={`${m.label}: Click to edit`}
                            >
                              {hasItems ? (
                                issuedItems.map((item) => (
                                  <span
                                    key={item.key}
                                    className={`text-[9px] font-black leading-tight px-1.5 py-0.2 rounded border ${item.color}`}
                                  >
                                    {item.qty} {item.label}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-300">—</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD NEW PRODUCT MODAL */}
      {newProductModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-xs rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 p-4 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h3 className="font-black text-slate-800 text-sm flex items-center gap-1.5">
                <Tag size={15} className="text-[#6D2158]" /> Add New Uniform Item
              </h3>
              <button
                onClick={() => setNewProductModal(false)}
                className="p-1 text-slate-400 hover:text-rose-500"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleAddNewProduct} className="space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Product / Item Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aprons, Caps, Ties..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#6D2158]"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNewProductModal(false)}
                  className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#6D2158] text-white rounded-xl font-bold text-xs shadow-md"
                >
                  Add Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK STEPPER MODAL */}
      {editModal.isOpen && editModal.host && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 flex flex-col">
            <div className="p-3.5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-black text-slate-800 text-sm">
                  {formatTitleCase(editModal.host.host_name)}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                  {MONTHS[editModal.month - 1].label} {editModal.year} • {editModal.host.uniform_number || editModal.host.ssl_no}
                </p>
              </div>
              <button
                onClick={() => setEditModal({ isOpen: false, host: null, month: 1, year: selectedYear })}
                className="p-1 bg-white rounded-full shadow-2xs text-slate-400 hover:text-rose-500"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleSaveMonth} className="p-3.5 space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Quantities Issued
                </span>
                <button
                  type="button"
                  onClick={() => setNewProductModal(true)}
                  className="text-[10px] font-black text-[#6D2158] hover:underline flex items-center gap-1"
                >
                  <Plus size={11} /> New Product
                </button>
              </div>

              <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
                {customItems.map((item) => {
                  const currentQty = quantities[item.key] || 0;
                  return (
                    <div
                      key={item.key}
                      className="p-2 px-2.5 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between"
                    >
                      <span className="font-bold text-xs text-slate-700">{item.label}</span>

                      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                        <button
                          type="button"
                          onClick={() =>
                            setQuantities({
                              ...quantities,
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
                            setQuantities({
                              ...quantities,
                              [item.key]: Math.max(0, parseInt(e.target.value, 10) || 0),
                            })
                          }
                          className="w-8 text-center font-mono font-black text-xs text-[#6D2158] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setQuantities({
                              ...quantities,
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

              <div className="pt-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditModal({ isOpen: false, host: null, month: 1, year: selectedYear })}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-[1.5] py-2.5 bg-[#6D2158] hover:bg-[#5a1b49] text-white rounded-xl font-bold text-xs shadow-md flex items-center justify-center gap-1 active:scale-95"
                >
                  {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}