// Cake Request Form 2025: the exact Word form (public/forms, exported by Word) with the details written
// into its boxes, or with fillable fields for a blank download. Box positions were measured from that PDF
// (US Letter, points from the bottom-left corner); each box is used a little inset so its border stays visible.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export const CAKE_FORM_URL = '/forms/Cake%20Request%20Form%202025.pdf';

export const CAKE_SIZES = ['250g ($ 20)', '500g ($ 40)', '1 Kg ($ 50)'] as const;
export const CAKE_CHARGE = ['Host', 'Host Benefit', 'Host Department'] as const;
export const CAKE_FLAVORS = ['Fruit', 'Chocolate'] as const;

export type CakeForm = {
  fullName: string; designation: string; department: string; hostId: string;
  occasion: string; pickupDate: string; requestedDate: string; pickupTime: string;
  wording: string; flavor: string; phone: string;
  size: string; charge: string;
};

export const emptyCakeForm = (): CakeForm => ({
  fullName: '', designation: '', department: '', hostId: '', occasion: '', pickupDate: '', requestedDate: '', pickupTime: '',
  wording: '', flavor: '', phone: '', size: '', charge: '',
});

type Box = { x: number; y: number; w: number; h: number };
const TEXT_BOXES: Record<Exclude<keyof CakeForm, 'size' | 'charge' | 'phone'>, Box> = {
  fullName: { x: 104, y: 668, w: 240, h: 24 },
  designation: { x: 465, y: 668, w: 109, h: 24 },
  department: { x: 104, y: 630, w: 240, h: 26 },
  hostId: { x: 465, y: 630, w: 109, h: 26 },
  occasion: { x: 104, y: 593, w: 240, h: 25 },
  pickupDate: { x: 465, y: 593, w: 109, h: 25 },
  requestedDate: { x: 104, y: 556, w: 240, h: 25 },
  pickupTime: { x: 465, y: 556, w: 109, h: 25 },
  wording: { x: 104, y: 519, w: 283, h: 25 },
  flavor: { x: 465, y: 519, w: 109, h: 25 },
};
// Phone number is a dashed line after its label
const PHONE: Box = { x: 160, y: 481, w: 210, h: 14 };
const SIZE_BOXES: Box[] = [{ x: 135, y: 421, w: 105, h: 18 }, { x: 356, y: 421, w: 37, h: 18 }, { x: 496, y: 421, w: 41, h: 18 }];
const CHARGE_BOXES: Box[] = [{ x: 135, y: 353, w: 105, h: 18 }, { x: 356, y: 353, w: 37, h: 18 }, { x: 496, y: 353, w: 41, h: 18 }];

const inset = (b: Box, d = 1.5): Box => ({ x: b.x + d, y: b.y + d, w: b.w - 2 * d, h: b.h - 2 * d });

// The Word file has "1" in Host ID and "Fruit" in Flavor typed in; blank them so every form starts empty
const blankPrefilled = (page: PDFPage) => {
  [TEXT_BOXES.hostId, TEXT_BOXES.flavor].forEach(b => { const i = inset(b, 1.2); page.drawRectangle({ ...{ x: i.x, y: i.y, width: i.w, height: i.h }, color: rgb(1, 1, 1) }); });
};

/** Largest font size (≤ max) that fits the text on one line in the box width. */
const fitSize = (font: PDFFont, text: string, width: number, max = 11, min = 6.5) => {
  let s = max;
  while (s > min && font.widthOfTextAtSize(text, s) > width) s -= 0.5;
  return s;
};

const drawText = (page: PDFPage, font: PDFFont, text: string, b: Box) => {
  const t = text.trim();
  if (!t) return;
  const i = inset(b, 3);
  const size = fitSize(font, t, i.w);
  page.drawText(t, { x: i.x, y: b.y + (b.h - size * 0.7) / 2, size, font, color: rgb(0.05, 0.05, 0.2), maxWidth: i.w });
};

const drawTick = (page: PDFPage, b: Box) => {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const c = rgb(0.05, 0.05, 0.2);
  page.drawLine({ start: { x: cx - 5, y: cy }, end: { x: cx - 1.5, y: cy - 4 }, thickness: 1.6, color: c });
  page.drawLine({ start: { x: cx - 1.5, y: cy - 4 }, end: { x: cx + 6, y: cy + 5 }, thickness: 1.6, color: c });
};

const loadTemplate = async () => {
  const res = await fetch(CAKE_FORM_URL);
  if (!res.ok) throw new Error('Could not load the cake form');
  return PDFDocument.load(await res.arrayBuffer());
};

/** The form with these details written in (for printing / saving). */
export const buildFilledCakePdf = async (f: CakeForm): Promise<Uint8Array> => {
  const doc = await loadTemplate();
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  blankPrefilled(page);
  (Object.keys(TEXT_BOXES) as (keyof typeof TEXT_BOXES)[]).forEach(k => drawText(page, font, f[k], TEXT_BOXES[k]));
  if (f.phone.trim()) {
    page.drawRectangle({ x: PHONE.x, y: PHONE.y, width: PHONE.w, height: PHONE.h, color: rgb(1, 1, 1) }); // over the dashes
    page.drawText(f.phone.trim(), { x: PHONE.x + 2, y: PHONE.y + 3, size: fitSize(font, f.phone.trim(), PHONE.w - 4, 12), font, color: rgb(0.05, 0.05, 0.2) });
    page.drawLine({ start: { x: PHONE.x, y: PHONE.y }, end: { x: PHONE.x + PHONE.w, y: PHONE.y }, thickness: 0.6, color: rgb(0, 0, 0) });
  }
  const si = CAKE_SIZES.indexOf(f.size as typeof CAKE_SIZES[number]);
  if (si >= 0) drawTick(page, SIZE_BOXES[si]);
  const ci = CAKE_CHARGE.indexOf(f.charge as typeof CAKE_CHARGE[number]);
  if (ci >= 0) drawTick(page, CHARGE_BOXES[ci]);
  doc.setTitle('Cake Request Form');
  return doc.save();
};

/** The blank form with fillable fields (type into it in any PDF reader, then print). */
export const buildFillableCakePdf = async (): Promise<Uint8Array> => {
  const doc = await loadTemplate();
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  blankPrefilled(page);
  const form = doc.getForm();
  const LABEL: Record<keyof typeof TEXT_BOXES, string> = {
    fullName: 'Full Name', designation: 'Designation', department: 'Department', hostId: 'Host ID No', occasion: 'Occasion / Purpose',
    pickupDate: 'Pick up Date', requestedDate: 'Requested Date', pickupTime: 'Pick up Time', wording: 'Wording for the Cake', flavor: 'Flavor',
  };
  (Object.keys(TEXT_BOXES) as (keyof typeof TEXT_BOXES)[]).forEach(k => {
    const i = inset(TEXT_BOXES[k], 2);
    if (k === 'flavor') {
      const dd = form.createDropdown(LABEL[k]);
      dd.addOptions([...CAKE_FLAVORS]);
      dd.addToPage(page, { x: i.x, y: i.y, width: i.w, height: i.h, borderWidth: 0, font });
      return;
    }
    const tf = form.createTextField(LABEL[k]);
    tf.addToPage(page, { x: i.x, y: i.y, width: i.w, height: i.h, borderWidth: 0, font });
    tf.setFontSize(0); // auto size
  });
  const phone = form.createTextField('Phone Number');
  phone.addToPage(page, { x: PHONE.x, y: PHONE.y + 1, width: PHONE.w, height: PHONE.h, borderWidth: 0, font });
  phone.setFontSize(0);
  CAKE_SIZES.forEach((s, n) => { const i = inset(SIZE_BOXES[n], 3); form.createCheckBox(`Size ${s}`).addToPage(page, { x: i.x + (i.w - i.h) / 2, y: i.y, width: i.h, height: i.h, borderWidth: 0 }); });
  CAKE_CHARGE.forEach((c, n) => { const i = inset(CHARGE_BOXES[n], 3); form.createCheckBox(`Charged to ${c}`).addToPage(page, { x: i.x + (i.w - i.h) / 2, y: i.y, width: i.h, height: i.h, borderWidth: 0 }); });
  form.updateFieldAppearances(font);
  doc.setTitle('Cake Request Form');
  return doc.save();
};

/** Print a PDF from the browser: a hidden frame on desktop; phones open it (print from the viewer). */
export const printPdf = (bytes: Uint8Array) => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const mobile = typeof navigator !== 'undefined' && /iphone|ipad|android/i.test(navigator.userAgent);
  if (mobile) { window.open(url, '_blank'); return; }
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  frame.src = url;
  frame.onload = () => {
    try { frame.contentWindow?.focus(); frame.contentWindow?.print(); }
    catch { window.open(url, '_blank'); }
    setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60_000);
  };
  document.body.appendChild(frame);
};

export const downloadPdf = (bytes: Uint8Array, name: string) => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
