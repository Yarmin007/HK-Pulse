"use client";
// In-Villa Directory: the documents placed in every villa (resort guide, menus, activities…) as PDFs.
// Front Office opens them from the shared link; admins add / rename / reorder / remove them here.
import React, { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { hasFullControl } from "@/lib/fullControl";
import { ArrowDown, ArrowUp, BookOpen, Download, ExternalLink, FileText, Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";

const BUCKET = "villa-directory";
const MAX_MB = 25;

type Doc = { id: string; title: string; description: string | null; file_path: string; file_url: string; file_size: number | null; sort_order: number; updated_at: string };

const sizeLabel = (b?: number | null) => (!b ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const setupHint = (msg: string) => /relation|does not exist|schema cache|bucket not found|not found/i.test(msg);

export default function VillaDirectory() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(false);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState<{ id?: string; title: string; description: string; file: File | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("hsk_villa_documents").select("*").order("sort_order").order("title");
    setMissing(!!error && setupHint(error.message));
    setDocs((data || []) as Doc[]);
    setLoading(false);
  }, []);

  useEffect(() => { setAdmin(hasFullControl()); load(); }, [load]);

  const save = async () => {
    if (!form) return;
    const title = form.title.trim();
    if (!title) return toast.error("Give the document a name");
    if (!form.id && !form.file) return toast.error("Choose a PDF");
    if (form.file && form.file.type !== "application/pdf" && !/\.pdf$/i.test(form.file.name)) return toast.error("Only PDF files");
    if (form.file && form.file.size > MAX_MB * 1048576) return toast.error(`PDF is over ${MAX_MB} MB`);
    setSaving(true);
    try {
      let fileFields: Partial<Doc> = {};
      const old = form.id ? docs.find(d => d.id === form.id) : undefined;
      if (form.file) {
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "document";
        const path = `${Date.now()}-${slug}.pdf`;
        const up = await supabase.storage.from(BUCKET).upload(path, form.file, { contentType: "application/pdf", upsert: false });
        if (up.error) throw up.error;
        const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        fileFields = { file_path: path, file_url: url, file_size: form.file.size };
      }
      const row = { title, description: form.description.trim() || null, updated_at: new Date().toISOString(), ...fileFields };
      const res = form.id
        ? await supabase.from("hsk_villa_documents").update(row).eq("id", form.id)
        : await supabase.from("hsk_villa_documents").insert({ ...row, sort_order: (docs.at(-1)?.sort_order ?? 0) + 1 });
      if (res.error) throw res.error;
      // Replaced PDF: remove the old file.
      if (old && form.file && old.file_path) await supabase.storage.from(BUCKET).remove([old.file_path]);
      toast.success(form.id ? "Updated" : "Added to the directory");
      setForm(null);
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message || e);
      toast.error(setupHint(msg) ? "Run the In-Villa Directory SQL in Supabase first" : `Not saved: ${msg}`);
    }
    setSaving(false);
  };

  const remove = async (d: Doc) => {
    if (!window.confirm(`Remove “${d.title}” from the directory?`)) return;
    const { error } = await supabase.from("hsk_villa_documents").delete().eq("id", d.id);
    if (error) return toast.error("Not removed");
    if (d.file_path) await supabase.storage.from(BUCKET).remove([d.file_path]);
    setDocs(prev => prev.filter(x => x.id !== d.id));
  };

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= docs.length) return;
    const next = [...docs];
    [next[i], next[j]] = [next[j], next[i]];
    const ordered = next.map((d, k) => ({ ...d, sort_order: k + 1 }));
    setDocs(ordered);
    await Promise.all([ordered[i], ordered[j]].map(d => supabase.from("hsk_villa_documents").update({ sort_order: d.sort_order }).eq("id", d.id)));
  };

  if (loading) return <div className="py-24 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#6D2158]/10 text-[#6D2158] flex items-center justify-center shrink-0"><BookOpen size={20} /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-800">What guests find in the villa</p>
          <p className="text-xs font-semibold text-slate-500">The same documents placed in every villa — open one to answer a guest&rsquo;s question.</p>
        </div>
        {admin && (
          <button onClick={() => setForm({ title: "", description: "", file: null })} className="shrink-0 px-3 py-2 rounded-xl bg-[#6D2158] text-white text-xs font-black flex items-center gap-1.5"><Plus size={14} /> Add PDF</button>
        )}
      </div>

      {missing && admin && (
        <p className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-3 text-xs font-bold text-amber-800">The directory isn&rsquo;t set up in Supabase yet — run the In-Villa Directory SQL, then refresh.</p>
      )}

      {docs.length === 0 ? (
        <div className="py-16 text-center">
          <FileText size={36} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-bold text-slate-500">No documents yet.</p>
          {admin && <p className="text-xs text-slate-400 mt-1">Tap “Add PDF” to upload the first one.</p>}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {docs.map((d, i) => (
            <div key={d.id} className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 flex flex-col">
              <div className="flex items-start gap-3">
                <div className="w-12 h-14 rounded-lg bg-rose-50 text-rose-600 ring-1 ring-rose-100 flex flex-col items-center justify-center shrink-0">
                  <FileText size={20} /><span className="text-[8px] font-black mt-0.5">PDF</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-black text-slate-800 leading-tight">{d.title}</p>
                  {d.description && <p className="text-xs font-semibold text-slate-500 mt-0.5 line-clamp-2">{d.description}</p>}
                  <p className="text-[10px] font-bold text-slate-400 mt-1">{sizeLabel(d.file_size)}{d.file_size ? " · " : ""}updated {new Date(d.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="py-2.5 rounded-xl bg-[#6D2158] text-white text-xs font-black flex items-center justify-center gap-1.5 active:scale-95"><ExternalLink size={14} /> Open</a>
                <a href={`${d.file_url}?download=${encodeURIComponent(`${d.title}.pdf`)}`} className="py-2.5 rounded-xl bg-white ring-1 ring-[#6D2158]/30 text-[#6D2158] text-xs font-black flex items-center justify-center gap-1.5 active:scale-95"><Download size={14} /> Download</a>
              </div>
              {admin && (
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="Move up"><ArrowUp size={14} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === docs.length - 1} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="Move down"><ArrowDown size={14} /></button>
                  <span className="flex-1" />
                  <button onClick={() => setForm({ id: d.id, title: d.title, description: d.description || "", file: null })} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-1"><Pencil size={12} /> Edit</button>
                  <button onClick={() => remove(d)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-1"><Trash2 size={12} /> Remove</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => !saving && setForm(null)}>
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-800">{form.id ? "Edit document" : "Add to In-Villa Directory"}</h3>
              <button onClick={() => setForm(null)} className="p-2 rounded-full bg-slate-100 text-slate-500" aria-label="Close"><X size={16} /></button>
            </div>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Name</span>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Resort Guide, In-Villa Dining Menu" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-base sm:text-sm font-bold outline-none focus:border-[#6D2158]" />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Short note (optional)</span>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What's inside" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-base sm:text-sm font-semibold outline-none focus:border-[#6D2158]" />
            </label>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => {
              const f = e.target.files?.[0] || null;
              setForm(prev => prev ? { ...prev, file: f, title: prev.title || (f ? f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ") : "") } : prev);
            }} />
            <button onClick={() => fileRef.current?.click()} className="w-full py-4 rounded-2xl border-2 border-dashed border-slate-200 text-sm font-bold text-slate-500 flex items-center justify-center gap-2 hover:border-[#6D2158]/40">
              <Upload size={16} /> {form.file ? `${form.file.name} · ${sizeLabel(form.file.size)}` : form.id ? "Replace the PDF (optional)" : "Choose PDF"}
            </button>
            <button onClick={save} disabled={saving} className="w-full py-3.5 rounded-2xl bg-[#6D2158] text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-60">
              {saving && <Loader2 size={16} className="animate-spin" />} {form.id ? "Save" : "Upload"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
