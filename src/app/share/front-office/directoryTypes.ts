import type { ElementType } from "react";
import { Wine, Moon, UtensilsCrossed, Martini, Flower2, Waves, Baby, Map, Shirt, Bath, ShieldCheck, FileText } from "lucide-react";

// Document types of the In-Villa Directory. The type is guessed from the name and can be changed.
export type DocType = {
  key: string;
  label: string;
  icon: ElementType;
  gradient: string; // cover background when there is no picture yet
  chip: string; // label colour on the card
  words: RegExp; // name keywords that pick this type
};

export const DOC_TYPES: DocType[] = [
  { key: "minibar", label: "Minibar Menu", icon: Wine, gradient: "from-rose-500 to-red-700", chip: "bg-rose-600", words: /mini\s*bar|minibar/i },
  { key: "pillow", label: "Pillow Menu", icon: Moon, gradient: "from-indigo-500 to-violet-700", chip: "bg-indigo-600", words: /pillow|sleep|turn\s*down/i },
  { key: "dining", label: "In-Villa Dining", icon: UtensilsCrossed, gradient: "from-amber-500 to-orange-700", chip: "bg-amber-600", words: /dining|room\s*service|breakfast|food|restaurant|menu/i },
  { key: "drinks", label: "Wine & Drinks", icon: Martini, gradient: "from-fuchsia-700 to-rose-900", chip: "bg-fuchsia-700", words: /wine|cocktail|drink|bar\b|beverage|champagne/i },
  { key: "spa", label: "Spa & Wellness", icon: Flower2, gradient: "from-teal-500 to-emerald-700", chip: "bg-teal-600", words: /spa|wellness|massage|yoga|treatment/i },
  { key: "activities", label: "Activities", icon: Waves, gradient: "from-sky-500 to-blue-700", chip: "bg-sky-600", words: /activit|excursion|dive|diving|snorkel|sunset|tour|water\s*sport|experience/i },
  { key: "kids", label: "Kids", icon: Baby, gradient: "from-yellow-400 to-orange-500", chip: "bg-yellow-500", words: /kid|child|baby|family/i },
  { key: "guide", label: "Resort Guide", icon: Map, gradient: "from-emerald-600 to-teal-800", chip: "bg-emerald-700", words: /guide|directory|map|welcome|information|info|compendium/i },
  { key: "laundry", label: "Laundry", icon: Shirt, gradient: "from-slate-500 to-slate-700", chip: "bg-slate-600", words: /laundry|pressing|dry\s*clean/i },
  { key: "amenities", label: "Bath & Amenities", icon: Bath, gradient: "from-cyan-500 to-sky-700", chip: "bg-cyan-600", words: /amenit|bath|toiletr|shampoo|aroma/i },
  { key: "safety", label: "Safety & Sustainability", icon: ShieldCheck, gradient: "from-lime-600 to-green-800", chip: "bg-green-700", words: /safety|emergency|fire|sustainab|eco|green/i },
  { key: "other", label: "Other", icon: FileText, gradient: "from-[#6D2158] to-[#3b0f2f]", chip: "bg-[#6D2158]", words: /$^/ },
];

export const typeOf = (key?: string | null) => DOC_TYPES.find(t => t.key === key) || DOC_TYPES[DOC_TYPES.length - 1];

// Specific words first; the broad ones ("menu", "guide") last — so "Spa Menu" is Spa, not Dining.
const BROAD = ["dining", "guide", "other"];
const GUESS_ORDER = [...DOC_TYPES.filter(t => !BROAD.includes(t.key)), ...DOC_TYPES.filter(t => BROAD.includes(t.key) && t.key !== "other")];
export const guessType = (title: string) => (GUESS_ORDER.find(t => t.words.test(title)) || DOC_TYPES[DOC_TYPES.length - 1]).key;

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
