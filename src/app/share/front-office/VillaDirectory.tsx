"use client";
// In-Villa Directory: the documents placed in every villa (minibar menu, pillow menu, dining, spa…) as PDFs.
// Each one gets a cover made from its first page and a colour/icon from its type.
// Front Office opens them from the shared link; admins add / edit / reorder / remove them here.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { hasFullControl } from "@/lib/fullControl";
import { ArrowLeft, ArrowRight, BookOpen, Download, FileText, ImagePlus, Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { DOC_TYPES, guessType, renderCover, typeOf } from "./directoryTypes";

const BUCKET = "villa-directory";
const MAX_MB = 25;

type Doc = {
  id: string; title: string; description: string | null; file_path: string; file_url: string; file_size: number | null;
  sort_order: number; updated_at: string; category?: string | null; cover_url?: string | null; cover_path?: string | null; page_count?: number | null;
};
type Form = { id?: string; title: string; description: string; category: string; categoryTouched: boolean; file: File | null };

const sizeLabel = (b?: number | null) => (!b ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const setupHint = (msg: string) => /relation|does not exist|schema cache|bucket not found|not found|mime/i.test(msg);
const missingColumn = (msg: string) => /column|schema cache/i.test(msg);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: string })?.message || e));

export default function VillaDirectory() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(false);
  const [missing, setMissing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [covering, setCovering] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("hsk_villa_documents").select("*").order("sort_order").order("title");
    setMissing(!!error && setupHint(error.message));
    setDocs((data || []) as Doc[]);
    setLoading(false);
  }, []);

  useEffect(() => { setAdmin(hasFullControl()); load(); }, [load]);

  const typesInUse = useMemo(() => DOC_TYPES.filter(t => docs.some(d => typeOf(d.category || guessType(d.title)).key === t.key)), [docs]);
  const shown = filter === "all" ? docs : docs.filter(d => typeOf(d.category || guessType(d.title)).key === filter);

  // Saves a row; if the cover/type columns are not in Supabase yet, saves without them.
  const writeRow = async (id: string | undefined, row: Record<string, unknown>) => {
    const run = (r: Record<string, unknown>) => (id ? supabase.from("hsk_villa_documents").update(r).eq("id", id) : supabase.from("hsk_villa_documents").insert(r));
    let res = await run(row);
    if (res.error && missingColumn(res.error.message)) {
      const { category: _c, cover_url: _u, cover_path: _p, page_count: _n, ...rest } = row;
      void _c; void _u; void _p; void _n;
      res = await run(rest);
    }
    return res;
  };

  const uploadCover = async (data: ArrayBuffer, slugBase: string) => {
    try {
      const { blob, pages } = await renderCover(data);
      if (!blob) return { pages };
      const path = `covers/${Date.now()}-${slugBase}.jpg`;
      const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) return { pages };
      return { pages, cover_path: path, cover_url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
    } catch {
      return { pages: null };
    }
  };

  const save = async () => {
    if (!form) return;
    const title = form.title.trim();
    if (!title) return toast.error("Give the document a name");
    if (!form.id && !form.file) return toast.error("Choose a PDF");
    if (form.file && form.file.type !== "application/pdf" && !/\.pdf$/i.test(form.file.name)) return toast.error("Only PDF files");
    if (form.file && form.file.size > MAX_MB * 1048576) return toast.error(`PDF is over ${MAX_MB} MB`);
    setSaving(true);
    try {
      const old = form.id ? docs.find(d => d.id === form.id) : undefined;
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "document";
      let fileFields: Record<string, unknown> = {};
      if (form.file) {
        const path = `${Date.now()}-${slug}.pdf`;
        const up = await supabase.storage.from(BUCKET).upload(path, form.file, { contentType: "application/pdf", upsert: false });
        if (up.error) throw up.error;
        const cover = await uploadCover(await form.file.arrayBuffer(), slug);
        fileFields = {
          file_path: path, file_url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, file_size: form.file.size,
          cover_url: cover.cover_url || null, cover_path: cover.cover_path || null, page_count: cover.pages || null,
        };
      }
      const row = { title, description: form.description.trim() || null, category: form.category, updated_at: new Date().toISOString(), ...fileFields };
      const res = await writeRow(form.id, form.id ? row : { ...row, sort_order: (docs.at(-1)?.sort_order ?? 0) + 1 });
      if (res.error) throw res.error;
      // Replaced PDF: remove the old file and cover.
      if (old && form.file) await supabase.storage.from(BUCKET).remove([old.file_path, old.cover_path].filter(Boolean) as string[]);
      toast.success(form.id ? "Updated" : "Added to the directory");
      setForm(null);
      load();
    } catch (e) {
      const msg = errMsg(e);
      toast.error(setupHint(msg) ? "Run the In-Villa Directory SQL in Supabase first" : `Not saved: ${msg}`);
    }
    setSaving(false);
  };

  // Covers for documents uploaded before covers existed.
  const makeCovers = async () => {
    const todo = docs.filter(d => !d.cover_url);
    if (!todo.length) return;
    setCovering(true);
    let made = 0;
    for (const d of todo) {
      try {
        const buf = await (await fetch(d.file_url)).arrayBuffer();
        const cover = await uploadCover(buf, d.id.slice(0, 8));
        if (cover.cover_url) {
          const res = await writeRow(d.id, { cover_url: cover.cover_url, cover_path: cover.cover_path, page_count: cover.pages });
          if (!res.error) made++;
        }
      } catch { /* skip this one */ }
    }
    setCovering(false);
    toast[made ? "success" : "error"](made ? `${made} cover${made > 1 ? "s" : ""} made` : "Covers not made — run the SQL update first");
    load();
  };

  const remove = async (d: Doc) => {
    if (!window.confirm(`Remove “${d.title}” from the directory?`)) return;
    const { error } = await supabase.from("hsk_villa_documents").delete().eq("id", d.id);
    if (error) return toast.error("Not removed");
    await supabase.storage.from(BUCKET).remove([d.file_path, d.cover_path].filter(Boolean) as string[]);
    setDocs(prev => prev.filter(x => x.id !== d.id));
  };

  const move = async (id: string, dir: -1 | 1) => {
    const i = docs.findIndex(d => d.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= docs.length) return;
    const next = [...docs];
    [next[i], next[j]] = [next[j], next[i]];
    const ordered = next.map((d, k) => ({ ...d, sort_order: k + 1 }));
    setDocs(ordered);
    await Promise.all([ordered[i], ordered[j]].map(d => supabase.from("hsk_villa_documents").update({ sort_order: d.sort_order }).eq("id", d.id)));
  };

  const openForm = (d?: Doc) => setForm(d
    ? { id: d.id, title: d.title, description: d.description || "", category: d.category || guessType(d.title), categoryTouched: true, file: null }
    : { title: "", description: "", category: "other", categoryTouched: false, file: null });
  const setTitle = (title: string) => setForm(f => (f ? { ...f, title, category: f.categoryTouched ? f.category : guessType(title) } : f));

  if (loading) return <div className="py-24 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>;

  const noCovers = docs.filter(d => !d.cover_url).length;

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-gradient-to-br from-[#6D2158] to-[#3b0f2f] text-white p-5 flex items-start gap-3 shadow-lg shadow-[#6D2158]/20">
        <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0"><BookOpen size={22} /></div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-black">In-Villa Directory</p>
          <p className="text-xs font-semibold text-white/75">Everything the guest finds in the villa — open a menu to answer their question.</p>
        </div>
        {admin && (
          <button onClick={() => openForm()} className="shrink-0 px-3 py-2 rounded-xl bg-white text-[#6D2158] text-xs font-black flex items-center gap-1.5"><Plus size={14} /> Add PDF</button>
        )}
      </div>

      {missing && admin && (
        <p className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-3 text-xs font-bold text-amber-800">The directory isn&rsquo;t set up in Supabase yet — run the In-Villa Directory SQL, then refresh.</p>
      )}
      {admin && noCovers > 0 && !missing && (
        <button onClick={makeCovers} disabled={covering} className="w-full rounded-2xl bg-white ring-1 ring-slate-200 p-3 text-xs font-bold text-slate-600 flex items-center justify-center gap-2 disabled:opacity-60">
          {covering ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} Make covers for {noCovers} document{noCovers > 1 ? "s" : ""}
        </button>
      )}

      {typesInUse.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          <button onClick={() => setFilter("all")} className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-black ${filter === "all" ? "bg-slate-800 text-white" : "bg-white ring-1 ring-slate-200 text-slate-600"}`}>All</button>
          {typesInUse.map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)} className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 ${filter === t.key ? `${t.chip} text-white` : "bg-white ring-1 ring-slate-200 text-slate-600"}`}>
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>
      )}

      {docs.length === 0 ? (
        <div className="py-16 text-center">
          <FileText size={36} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-bold text-slate-500">No documents yet.</p>
          {admin && <p className="text-xs text-slate-400 mt-1">Tap “Add PDF” to upload the first one.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {shown.map(d => {
            const t = typeOf(d.category || guessType(d.title));
            const Icon = t.icon;
            const idx = docs.findIndex(x => x.id === d.id);
            return (
              <div key={d.id} className="group flex flex-col">
                <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="relative block aspect-[3/4] rounded-2xl overflow-hidden shadow-md ring-1 ring-black/5 active:scale-[0.98] transition">
                  {d.cover_url ? (
                    <img src={d.cover_url} alt={d.title} loading="lazy" className="absolute inset-0 w-full h-full object-cover object-top bg-white" />
                  ) : (
                    <div className={`absolute inset-0 bg-gradient-to-br ${t.gradient} flex flex-col items-center justify-center text-white p-3`}>
                      <Icon size={44} strokeWidth={1.5} className="opacity-90" />
                      <p className="mt-3 text-center text-sm font-black leading-tight line-clamp-3">{d.title}</p>
                    </div>
                  )}
                  {/* Type band */}
                  <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider text-white shadow ${t.chip}`}>
                    <Icon size={11} /> {t.label}
                  </div>
                  {/* Title strip */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent pt-8 pb-2.5 px-3 text-white">
                    <p className="text-sm font-black leading-tight line-clamp-2">{d.title}</p>
                    <p className="text-[10px] font-semibold text-white/70">{[d.page_count ? `${d.page_count} page${d.page_count > 1 ? "s" : ""}` : "", sizeLabel(d.file_size)].filter(Boolean).join(" · ")}</p>
                  </div>
                </a>
                {d.description && <p className="mt-1.5 px-1 text-[11px] font-semibold text-slate-500 line-clamp-2">{d.description}</p>}
                <div className="mt-1.5 flex items-center gap-1 px-0.5">
                  <a href={`${d.file_url}?download=${encodeURIComponent(`${d.title}.pdf`)}`} className="p-1.5 rounded-lg text-slate-400 hover:text-[#6D2158] hover:bg-slate-100" title="Download" aria-label="Download"><Download size={14} /></a>
                  <span className="flex-1 text-[9px] font-bold text-slate-300 truncate">updated {new Date(d.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  {admin && (
                    <>
                      <button onClick={() => move(d.id, -1)} disabled={idx === 0} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="Move earlier"><ArrowLeft size={13} /></button>
                      <button onClick={() => move(d.id, 1)} disabled={idx === docs.length - 1} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="Move later"><ArrowRight size={13} /></button>
                      <button onClick={() => openForm(d)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Edit"><Pencil size={13} /></button>
                      <button onClick={() => remove(d)} className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-50" aria-label="Remove"><Trash2 size={13} /></button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => !saving && setForm(null)}>
          <div className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-800">{form.id ? "Edit document" : "Add to In-Villa Directory"}</h3>
              <button onClick={() => setForm(null)} className="p-2 rounded-full bg-slate-100 text-slate-500" aria-label="Close"><X size={16} /></button>
            </div>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => {
              const f = e.target.files?.[0] || null;
              if (f && !form.title) setTitle(f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim());
              setForm(prev => (prev ? { ...prev, file: f } : prev));
            }} />
            <button onClick={() => fileRef.current?.click()} className="w-full py-4 rounded-2xl border-2 border-dashed border-slate-200 text-sm font-bold text-slate-500 flex items-center justify-center gap-2 hover:border-[#6D2158]/40">
              <Upload size={16} /> {form.file ? `${form.file.name} · ${sizeLabel(form.file.size)}` : form.id ? "Replace the PDF (optional)" : "Choose PDF"}
            </button>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Name</span>
              <input value={form.title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Pillow Menu, Minibar Menu" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-base sm:text-sm font-bold outline-none focus:border-[#6D2158]" />
            </label>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Type</span>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {DOC_TYPES.map(t => (
                  <button key={t.key} type="button" onClick={() => setForm({ ...form, category: t.key, categoryTouched: true })}
                    className={`px-2.5 py-2 rounded-xl text-[11px] font-black flex items-center gap-1.5 text-left ${form.category === t.key ? `${t.chip} text-white` : "bg-slate-50 text-slate-600 ring-1 ring-slate-200"}`}>
                    <t.icon size={13} className="shrink-0" /> <span className="truncate">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Short note (optional)</span>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. 8 pillows to choose from" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-base sm:text-sm font-semibold outline-none focus:border-[#6D2158]" />
            </label>
            <button onClick={save} disabled={saving} className="w-full py-3.5 rounded-2xl bg-[#6D2158] text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-60">
              {saving && <Loader2 size={16} className="animate-spin" />} {saving ? "Uploading — making the cover…" : form.id ? "Save" : "Upload"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
