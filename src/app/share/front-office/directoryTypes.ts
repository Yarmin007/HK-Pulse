import type { ElementType } from "react";
import { Wine, Flame, Leaf, Moon, Shirt, Tv, ListChecks, ClipboardList, Baby, FileText } from "lucide-react";

// Document types of the In-Villa Directory. The type is guessed from the name and can be changed.
// `group` joins types under one filter — the three minibar menus show together as "Minibar Menus".
export type DocType = {
  key: string;
  label: string;
  group: string;
  groupLabel: string;
  icon: ElementType;
  gradient: string; // cover background when there is no picture yet
  chip: string; // label colour on the card
  words: RegExp; // name keywords that pick this type
};

export const DOC_TYPES: DocType[] = [
  { key: "minibar", label: "Minibar Menu", group: "minibar", groupLabel: "Minibar Menus", icon: Wine, gradient: "from-rose-500 to-red-700", chip: "bg-rose-600", words: /mini\s*bar|minibar/i },
  { key: "sinner", label: "Sinner Menu", group: "minibar", groupLabel: "Minibar Menus", icon: Flame, gradient: "from-orange-500 to-rose-700", chip: "bg-orange-600", words: /sinner/i },
  { key: "saint", label: "Saint Menu", group: "minibar", groupLabel: "Minibar Menus", icon: Leaf, gradient: "from-emerald-500 to-teal-700", chip: "bg-emerald-600", words: /saint/i },
  { key: "pillow", label: "Pillow Menu", group: "pillow", groupLabel: "Pillow Menu", icon: Moon, gradient: "from-indigo-500 to-violet-700", chip: "bg-indigo-600", words: /pillow/i },
  { key: "laundry", label: "Laundry Price List", group: "laundry", groupLabel: "Laundry Price List", icon: Shirt, gradient: "from-sky-500 to-blue-700", chip: "bg-sky-600", words: /laundry|pressing|dry\s*clean/i },
  { key: "tv", label: "TV Channel List", group: "tv", groupLabel: "TV Channel List", icon: Tv, gradient: "from-slate-600 to-slate-900", chip: "bg-slate-700", words: /\btv\b|channel|television/i },
  { key: "guide", label: "In-Villa Guide", group: "guide", groupLabel: "In-Villa Guide", icon: ListChecks, gradient: "from-[#6D2158] to-[#3b0f2f]", chip: "bg-[#6D2158]", words: /guide|bullet|directory|welcome/i },
  { key: "request", label: "Item Request Form", group: "request", groupLabel: "Item Request Forms", icon: ClipboardList, gradient: "from-amber-500 to-orange-600", chip: "bg-amber-600", words: /request|order\s*form|item\s*form/i },
  { key: "kids", label: "Kids Item Request Form", group: "request", groupLabel: "Item Request Forms", icon: Baby, gradient: "from-pink-400 to-fuchsia-600", chip: "bg-pink-500", words: /kid|child|baby/i },
  { key: "other", label: "Other", group: "other", groupLabel: "Other", icon: FileText, gradient: "from-slate-400 to-slate-600", chip: "bg-slate-500", words: /$^/ },
];

const OTHER = DOC_TYPES[DOC_TYPES.length - 1];
export const typeOf = (key?: string | null) => DOC_TYPES.find(t => t.key === key) || OTHER;

// Most specific first: Sinner/Saint before plain Minibar, Kids before the general Item Request Form.
const GUESS_ORDER = ["sinner", "saint", "minibar", "pillow", "laundry", "tv", "kids", "request", "guide"].map(k => typeOf(k));
export const guessType = (title: string) => (GUESS_ORDER.find(t => t.words.test(title)) || OTHER).key;

// Saved type if it is still one of ours, else guessed from the name (older uploads used other types).
export const resolveType = (category: string | null | undefined, title: string) =>
  DOC_TYPES.some(t => t.key === category) ? typeOf(category) : typeOf(guessType(title));

// Filter groups, in list order.
export const DOC_GROUPS = DOC_TYPES.reduce<{ key: string; label: string; icon: ElementType; chip: string }[]>((acc, t) => {
  if (!acc.some(g => g.key === t.group)) acc.push({ key: t.group, label: t.groupLabel, icon: t.icon, chip: t.chip });
  return acc;
}, []);

// First page of a PDF as a JPEG cover (also returns the page count).
export async function renderCover(data: ArrayBuffer): Promise<{ blob: Blob | null; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const pdf = await pdfjs.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 640 / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { blob: null, pages: pdf.numPages };
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas } as unknown as Parameters<typeof page.render>[0]).promise;
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/jpeg", 0.82));
  return { blob, pages: pdf.numPages };
}
