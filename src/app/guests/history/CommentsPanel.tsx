"use client";
// Edit the stay's comments for housekeeping: re-word, remove (with undo) or add a comment.
// The Front Office memo itself is not changed; the edits are kept per stay and used by Guest History and My Tasks.
import React, { useState } from 'react';
import { X, Loader2, Save, Trash2, Pencil, Plus, RotateCcw, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { readSession } from '@/lib/requestsShared';
import { commentLines, commentId, emptyStayComments, saveStayComments, type StayComments } from '@/lib/stayComments';

type Props = {
  stay: { key: string; villa: string; arr: string; name: string };
  texts: string[];                 // the raw memo texts of the stay
  existing: StayComments | null;
  onClose: () => void;
  onSaved: (ed: StayComments) => void;
};

export default function CommentsPanel({ stay, texts, existing, onClose, onSaved }: Props) {
  const [ed, setEd] = useState<StayComments>(() => existing ? JSON.parse(JSON.stringify(existing)) : emptyStayComments(stay));
  const [editing, setEditing] = useState<string | null>(null);   // comment id, or 'add:<n>'
  const [draft, setDraft] = useState('');
  const [newText, setNewText] = useState('');
  const [saving, setSaving] = useState(false);
  const lines = commentLines(texts);

  const startEdit = (id: string, text: string) => { setEditing(id); setDraft(text); };
  const commitEdit = (id: string, original: string) => {
    const t = draft.trim();
    setEd(e => {
      const edited = { ...e.edited };
      if (!t || t === original) delete edited[id]; else edited[id] = t;
      return { ...e, edited };
    });
    setEditing(null);
  };
  const toggleRemove = (id: string) => setEd(e => ({ ...e, removed: e.removed.includes(id) ? e.removed.filter(x => x !== id) : [...e.removed, id] }));
  const addComment = () => {
    const t = newText.trim();
    if (!t) return;
    setEd(e => ({ ...e, added: [...e.added, t] }));
    setNewText('');
  };

  const save = async () => {
    setSaving(true);
    try {
      const me = readSession();
      const saved = await saveStayComments({ ...ed, stay_key: stay.key, villa: stay.villa, arr: stay.arr, saved_by: me.full_name || '', saved_at: new Date().toISOString() });
      toast.success('Comments saved');
      onSaved(saved);
    } catch (e: any) { toast.error('Not saved: ' + (e?.message || e)); }
    setSaving(false);
  };

  const iconBtn = 'w-8 h-8 rounded-lg flex items-center justify-center shrink-0';
  const editBox = (onDone: () => void) => (
    <div className="flex-1 flex gap-1.5">
      <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)} rows={2}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onDone(); } if (e.key === 'Escape') setEditing(null); }}
        className="flex-1 px-2.5 py-1.5 rounded-lg border border-[#6D2158] bg-white text-sm font-semibold text-slate-800 outline-none" />
      <button onClick={onDone} className={`${iconBtn} bg-[#6D2158] text-white`} aria-label="Done"><Check size={15} /></button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex-none px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-[#6D2158]">Edit comments</h2>
            <p className="text-xs font-bold text-slate-400 truncate">V{stay.villa} · {stay.name}{ed.saved_at ? ` · last edit by ${ed.saved_by || '—'}` : ''}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            Changes here are for housekeeping only (Guest History and the VA task list). The Front Office memo stays as it is.
          </p>

          <ul className="space-y-1.5">
            {lines.map(line => {
              const id = commentId(line);
              const removed = ed.removed.includes(id);
              const text = ed.edited[id] ?? line;
              const changed = id in ed.edited;
              return (
                <li key={id} className={`rounded-xl border px-3 py-2 flex items-start gap-2 ${removed ? 'border-slate-100 bg-slate-50' : changed ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200'}`}>
                  {editing === id ? editBox(() => commitEdit(id, line)) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${removed ? 'line-through text-slate-400' : 'text-slate-800'}`}>{text}</p>
                        {changed && !removed && <p className="text-[11px] font-semibold text-slate-400 line-through mt-0.5">{line}</p>}
                      </div>
                      {removed ? (
                        <button onClick={() => toggleRemove(id)} className={`${iconBtn} bg-slate-100 text-slate-500`} title="Put back" aria-label="Put back"><RotateCcw size={14} /></button>
                      ) : (
                        <>
                          <button onClick={() => startEdit(id, text)} className={`${iconBtn} bg-slate-100 text-slate-500 hover:text-[#6D2158]`} title="Edit" aria-label="Edit"><Pencil size={14} /></button>
                          <button onClick={() => toggleRemove(id)} className={`${iconBtn} bg-rose-50 text-rose-600`} title="Remove" aria-label="Remove"><Trash2 size={14} /></button>
                        </>
                      )}
                    </>
                  )}
                </li>
              );
            })}
            {ed.added.map((text, i) => {
              const id = `add:${i}`;
              return (
                <li key={id} className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2 flex items-start gap-2">
                  {editing === id ? editBox(() => {
                    const t = draft.trim();
                    setEd(e => ({ ...e, added: t ? e.added.map((x, j) => j === i ? t : x) : e.added.filter((_, j) => j !== i) }));
                    setEditing(null);
                  }) : (
                    <>
                      <p className="flex-1 text-sm font-semibold text-slate-800">{text}<span className="ml-1.5 align-middle text-[9px] font-black uppercase px-1 py-0.5 rounded bg-white border border-emerald-200 text-emerald-700">added</span></p>
                      <button onClick={() => startEdit(id, text)} className={`${iconBtn} bg-white text-slate-500`} title="Edit" aria-label="Edit"><Pencil size={14} /></button>
                      <button onClick={() => setEd(e => ({ ...e, added: e.added.filter((_, j) => j !== i) }))} className={`${iconBtn} bg-rose-50 text-rose-600`} title="Delete" aria-label="Delete"><Trash2 size={14} /></button>
                    </>
                  )}
                </li>
              );
            })}
            {!lines.length && !ed.added.length && <li className="text-sm font-semibold text-slate-400 py-4 text-center">No comments on this stay.</li>}
          </ul>

          <div className="flex gap-2">
            <input value={newText} onChange={e => setNewText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComment(); }}
              placeholder="Add a comment, e.g. Req extra firm pillows · Celebrating birthday on 23 Nov"
              className="flex-1 h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 outline-none focus:border-[#6D2158]" />
            <button onClick={addComment} disabled={!newText.trim()} className="h-10 px-3 rounded-xl bg-[#6D2158]/10 text-[#6D2158] text-xs font-black flex items-center gap-1.5 disabled:opacity-40"><Plus size={15} /> Add</button>
          </div>
        </div>

        <div className="flex-none p-4 border-t border-slate-100 flex gap-2">
          <button onClick={onClose} className="h-11 px-4 rounded-xl border border-slate-200 text-xs font-black text-slate-600">Cancel</button>
          <button onClick={save} disabled={saving || editing !== null} className="flex-1 h-11 rounded-xl bg-[#6D2158] text-white text-xs font-black flex items-center justify-center gap-2 disabled:opacity-40">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save comments
          </button>
        </div>
      </div>
    </div>
  );
}
