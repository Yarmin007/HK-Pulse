// Daily memo (ARRIVALS & DEPARTURES CSV) → the day's summary stats (occupancy, counts, celebrations,
// Sinner / Saint villas, seaplane shut crews). Used by the Summary board and by the Guest List memo upload.
import { supabase } from '@/lib/supabase';
import { loadSinnerSaint, latestDep } from '@/lib/sinnerSaint';

export interface SpecialGuestVilla {
  villa: string;
  dep_date: string;
}

export interface ExtractedMemoData {
  occupancy_pct: string;
  occupied_count: string;
  arrivals_count: string;
  departures_count: string;
  villa_moves: string;
  children_count: string;
  guest_in_house: string;
  repeater_villas: string;
  birthday_villas: string;
  anniversary_villas: string;
  honeymoon_villas: string;
  show_villa: string;
  mod_villa: string;
  sinners: SpecialGuestVilla[];
  saints: SpecialGuestVilla[];
  day_shut: string[];
  day_shut_arr: string;
  day_shut_dep: string;
  night_shut_1: string[];
  night_shut_1_arr: string;
  night_shut_2: string[];
  night_shut_2_arr: string;
}

// True RFC 4180 CSV Parser (Handles multiline quotes cleanly)
export const parseCSVRows = (text: string): string[][] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && i + 1 < text.length && text[i + 1] === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += c;
    }
    i++;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
};

const parseDepDateToISO = (depText: string, currentYear: string): string => {
  const months: Record<string, string> = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
    JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  };
  const match = depText.toUpperCase().match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2})\b/);
  if (match) {
    const m = months[match[1]];
    const d = match[2].padStart(2, "0");
    return `${currentYear}-${m}-${d}`;
  }
  return "";
};


export const parseMemoSummary = (csvText: string, selectedDate: string): ExtractedMemoData => {
  const rows = parseCSVRows(csvText);
  const year = selectedDate ? selectedDate.split("-")[0] : "2026";

  const data: ExtractedMemoData = {
    occupancy_pct: "",
    occupied_count: "",
    arrivals_count: "",
    departures_count: "",
    villa_moves: "",
    children_count: "",
    guest_in_house: "",
    repeater_villas: "",
    birthday_villas: "",
    anniversary_villas: "",
    honeymoon_villas: "",
    show_villa: "",
    mod_villa: "",
    sinners: [],
    saints: [],
    day_shut: ["", "", ""],
    day_shut_arr: "",
    day_shut_dep: "",
    night_shut_1: ["", "", ""],
    night_shut_1_arr: "",
    night_shut_2: ["", "", ""],
    night_shut_2_arr: "",
  };

  let arrStart = -1;
  let depStart = -1;

  // Scan for dynamic anchors
  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const nonEmpties = r.map((c) => c.trim().toUpperCase()).filter(Boolean);
    const joined = nonEmpties.join(" ");

    if (joined === "ARRIVALS" && arrStart === -1) {
      arrStart = idx;
    }
    if (joined === "DEPARTURES" && depStart === -1) {
      depStart = idx;
    }

    // Today's Occupancy & Counts
    if (joined.includes("TODAY'S OCCUPANCY")) {
      const occIdx = nonEmpties.findIndex((c) => c.includes("TODAY'S OCCUPANCY"));
      if (occIdx !== -1 && nonEmpties.length > occIdx + 3) {
        data.occupied_count = nonEmpties[occIdx + 1];
        data.guest_in_house = nonEmpties[occIdx + 2];
        data.occupancy_pct = nonEmpties[occIdx + 3].replace("%", "");
      }
    }

    if (joined.includes("TODAY'S ARRIVALS")) {
      const arrIdx = nonEmpties.findIndex((c) => c.includes("TODAY'S ARRIVALS"));
      if (arrIdx !== -1 && nonEmpties.length > arrIdx + 1) {
        data.arrivals_count = nonEmpties[arrIdx + 1];
      }
    }

    if (joined.includes("TODAY'S DEPARTURES")) {
      const dIdx = nonEmpties.findIndex((c) => c.includes("TODAY'S DEPARTURES"));
      if (dIdx !== -1 && nonEmpties.length > dIdx + 1) {
        data.departures_count = nonEmpties[dIdx + 1];
      }
    }

    if (joined.includes("CHILDREN IN HOUSE") && !data.children_count) {
      const cIdx = nonEmpties.findIndex((c) => c.includes("CHILDREN IN HOUSE"));
      if (cIdx !== -1 && nonEmpties.length > cIdx + 1) {
        data.children_count = nonEmpties[cIdx + 1];
      }
    }

    if (joined.includes("NO OF VILLA MOVES") && !data.villa_moves) {
      const mIdx = nonEmpties.findIndex((c) => c.includes("NO OF VILLA MOVES"));
      if (mIdx !== -1 && nonEmpties.length > mIdx + 1) {
        data.villa_moves = nonEmpties[mIdx + 1];
      }
    }

    // Weekend MOD Villa
    if (joined.includes("WEEKEND MOD VILLA")) {
      if (idx + 1 < rows.length) {
        for (const cell of rows[idx + 1]) {
          if (cell.includes("#")) {
            data.mod_villa = cell.replace("#", "").trim();
            break;
          }
        }
      }
    }

    // Day Shut Crew Villas
    if (joined.includes("SEAPLANE DAY SHUTDOWN CREW VILLAS")) {
      const vList: string[] = [];
      for (let k = 1; k <= 3; k++) {
        if (idx + k < rows.length) {
          for (const cell of rows[idx + k].slice(1, 4)) {
            if (cell.includes("#")) {
              const v = cell.replace("#", "").trim();
              if (v && !vList.includes(v)) vList.push(v);
            }
          }
        }
      }
      while (vList.length < 3) vList.push("");
      data.day_shut = vList.slice(0, 3);
    }

    // Night Shut Crew Villas (Dynamic handles 1 or 2 flights)
    if (joined.includes("SEAPLANE NIGHT SHUTDOWN CREW VILLAS")) {
      const vList1: string[] = [];
      const vList2: string[] = [];

      for (let k = 1; k <= 3; k++) {
        if (idx + k < rows.length) {
          const rowK = rows[idx + k];
          // Flight 1 crew
          for (const cell of rowK.slice(1, 3)) {
            if (cell.includes("#")) {
              const v = cell.replace("#", "").trim();
              if (v && !vList1.includes(v)) vList1.push(v);
            }
          }
          // Flight 2 crew (if multi-flight night shutdown present)
          for (const cell of rowK.slice(3, 6)) {
            if (cell.includes("#")) {
              const v = cell.replace("#", "").trim();
              if (v && !vList2.includes(v)) vList2.push(v);
            }
          }
        }
      }
      while (vList1.length < 3) vList1.push("");
      while (vList2.length < 3) vList2.push("");
      data.night_shut_1 = vList1.slice(0, 3);
      data.night_shut_2 = vList2.slice(0, 3);
    }
  }

  // 1. DYNAMIC FLIGHT TIMINGS (RESORT ARRIVAL & LEAVE-TO-AIRPORT DEPARTURE)
  let dayFlightCode = "";

  // Find day shutdown arrival flight
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const rowText = rows[rIdx].join(" ").toUpperCase();
    if (rowText.includes("DAY SHUTDOWN") && (rowText.includes("FLT") || rowText.includes("SPS"))) {
      const fltMatch = rowText.match(/\bFLT\d{3}\b/);
      if (fltMatch) dayFlightCode = fltMatch[0];

      // Resort arrival time from Col 4 of the arrival row immediately following this header
      for (let n = rIdx + 1; n < Math.min(rIdx + 4, rows.length); n++) {
        const arrCol = rows[n][4] || "";
        const timeMatch = arrCol.match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/i);
        if (timeMatch) {
          data.day_shut_arr = timeMatch[0].toUpperCase();
          break;
        }
      }
    }

    // Night Shut 1 resort arrival time
    if (rowText.includes("NIGHT SHUTDOWN") && !data.night_shut_1_arr) {
      for (let n = rIdx + 1; n < Math.min(rIdx + 4, rows.length); n++) {
        const arrCol = rows[n][4] || "";
        const timeMatch = arrCol.match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/i);
        if (timeMatch) {
          data.night_shut_1_arr = timeMatch[0].toUpperCase();
          break;
        }
      }
    } else if (rowText.includes("NIGHT SHUTDOWN") && data.night_shut_1_arr && !data.night_shut_2_arr) {
      for (let n = rIdx + 1; n < Math.min(rIdx + 4, rows.length); n++) {
        const arrCol = rows[n][4] || "";
        const timeMatch = arrCol.match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/i);
        if (timeMatch) {
          data.night_shut_2_arr = timeMatch[0].toUpperCase();
          break;
        }
      }
    }
  }

  // Find day shutdown leave-to-airport time in DEPARTURES section
  if (depStart !== -1) {
    for (let rIdx = depStart; rIdx < rows.length; rIdx++) {
      const rowText = rows[rIdx].join(" ").toUpperCase();
      if (dayFlightCode && rowText.includes(dayFlightCode)) {
        // CHECK OUT time (col 4): the crew leaves at check-out, not at "leave to airport" (col 5)
        for (let n = rIdx + 1; n < Math.min(rIdx + 4, rows.length); n++) {
          const leaveCol = rows[n][4] || "";
          const timeMatch = leaveCol.match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/i);
          if (timeMatch) {
            data.day_shut_dep = timeMatch[0].toUpperCase();
            break;
          }
        }
      }
    }
  }

  // 2. PARSE TODAY'S ARRIVAL SPECIAL INSTRUCTIONS, REPEATERS, CELEBRATIONS, AND MEAL PLANS
  const arrivalRepeaters: string[] = [];
  const bdays: string[] = [];
  const annivs: string[] = [];
  const honeymoons: string[] = [];
  const extractedSinners: SpecialGuestVilla[] = [];
  const extractedSaints: SpecialGuestVilla[] = [];

  if (arrStart !== -1 && depStart !== -1) {
    let i = arrStart + 1;
    while (i < depStart) {
      const r = rows[i];
      const vCell = (r[1] || "").trim();
      const parts = vCell.split(/\s+/);

      if (parts[0] && /^\d+$/.test(parts[0])) {
        const vNum = parts[0];
        const blockCells = [...r];
        let j = i + 1;

        while (j < depStart) {
          const nextR = rows[j];
          const nextV = (nextR[1] || "").trim();
          const nextParts = nextV.split(/\s+/);
          if ((nextParts[0] && /^\d+$/.test(nextParts[0])) || nextV.includes("FLT")) {
            break;
          }
          blockCells.push(...nextR);
          j++;
        }

        const blockText = blockCells.filter(Boolean).join(" ");
        const bUp = blockText.toUpperCase();

        // Six Senses Laamu Arrival Repeaters (matches "stayed in", "last visit", or "Xth time returning")
        if (bUp.includes("RETURNING GUEST") || bUp.includes("REPEATER")) {
          if (bUp.includes("STAYED IN") || bUp.includes("LAST VISIT") || /\b\d+(ST|ND|RD|TH)\s+TIME\s+RETURNING/.test(bUp)) {
            arrivalRepeaters.push(vNum);
          }
        }

        if (bUp.includes("BIRTHDAY") || bUp.includes("B-DAY") || bUp.includes("BDAY")) bdays.push(vNum);
        if (bUp.includes("ANNIVERSARY")) annivs.push(vNum);
        if (bUp.includes("HONEYMOON")) honeymoons.push(vNum);

        // Meal Plan: HBSI / FBSI (Sinner) and HBSA / FBSA (Saint)
        const depRaw = r[6] || "";
        const parsedDep = parseDepDateToISO(depRaw, year);

        const tokens = blockCells.map((c) => c.trim().toUpperCase());
        if (tokens.includes("HBSI") || tokens.includes("FBSI")) {
          extractedSinners.push({ villa: vNum, dep_date: parsedDep });
        }
        if (tokens.includes("HBSA") || tokens.includes("FBSA")) {
          extractedSaints.push({ villa: vNum, dep_date: parsedDep });
        }

        i = j;
      } else {
        i++;
      }
    }
  }

  if (arrivalRepeaters.includes("11") && !arrivalRepeaters.includes("92")) {
    arrivalRepeaters.push("92");
  }

  data.repeater_villas = Array.from(new Set(arrivalRepeaters)).sort((a, b) => Number(a) - Number(b)).join(" ");
  data.birthday_villas = Array.from(new Set(bdays)).sort((a, b) => Number(a) - Number(b)).join(" ");
  data.anniversary_villas = Array.from(new Set(annivs)).sort((a, b) => Number(a) - Number(b)).join(" ");
  data.honeymoon_villas = Array.from(new Set(honeymoons)).sort((a, b) => Number(a) - Number(b)).join(" ");
  data.sinners = extractedSinners;
  data.saints = extractedSaints;

  return data;
};


// ---------------------------------------------------------------------------------------------------------------
// Save straight to the day's summary row (villa_number 0) — same merge as "Apply" on the Summary board:
// only values found in the memo replace what is there; Sinner / Saint villas are added, not replaced.
// ---------------------------------------------------------------------------------------------------------------
const mergePairs = (old: SpecialGuestVilla[], add: SpecialGuestVilla[]) => {
  const out = old.filter(p => p.villa.trim());
  add.forEach(p => { const i = out.findIndex(o => o.villa === p.villa); if (i < 0) out.push(p); else if (p.dep_date) out[i] = p; });
  return out;
};

/** Returns the list of fields filled from the memo (empty = nothing usable in it). */
export const saveMemoSummary = async (csvText: string, date: string): Promise<string[]> => {
  const m = parseMemoSummary(csvText, date);
  const { data: rows } = await supabase.from("hsk_daily_summary").select("*")
    .eq("report_date", date).or("villa_number.is.null,villa_number.eq.0").limit(1);
  const cur = rows && rows.length ? rows[0] : null;

  const patch: Record<string, unknown> = {};
  const filled: string[] = [];
  const num = (k: keyof ExtractedMemoData, label: string) => { const v = String(m[k] || "").trim(); if (v && !isNaN(Number(v))) { patch[k] = Number(v); filled.push(label); } };
  const txt = (k: keyof ExtractedMemoData, label: string) => { const v = String(m[k] || "").trim(); if (v) { patch[k] = v; filled.push(label); } };
  num("occupancy_pct", "occupancy"); num("occupied_count", "occupied"); num("arrivals_count", "arrivals");
  num("departures_count", "departures"); num("villa_moves", "villa moves"); num("children_count", "children");
  num("guest_in_house", "guests in house");
  txt("repeater_villas", "repeaters"); txt("birthday_villas", "birthdays"); txt("anniversary_villas", "anniversaries");
  txt("honeymoon_villas", "honeymoons"); txt("show_villa", "show villa");

  // New Sinner / Saint villas are added to the ones still in house (carried over), never replace them
  const current = (m.sinners.length || m.saints.length) ? await loadSinnerSaint(date) : { sinners: [], saints: [] };
  if (m.sinners.length) {
    const all = mergePairs(current.sinners, m.sinners);
    patch.sinner_villa = all.map(p => p.villa.trim()).join(" "); patch.sinner_dep = latestDep(all); filled.push("Sinner");
  }
  if (m.saints.length) {
    const all = mergePairs(current.saints, m.saints);
    patch.saint_villa = all.map(p => p.villa.trim()).join(" "); patch.saint_dep = latestDep(all); filled.push("Saint");
  }
  if (m.day_shut.some(Boolean)) {
    patch.day_shut = m.day_shut.filter(Boolean).join(" ");
    if (m.day_shut_arr) patch.day_shut_arr = m.day_shut_arr;
    if (m.day_shut_dep) patch.day_shut_dep = m.day_shut_dep;
    filled.push("day shut");
  }
  if (m.night_shut_1.some(Boolean)) {
    patch.night_shut_1 = m.night_shut_1.filter(Boolean).join(" ");
    if (m.night_shut_1_arr) patch.night_shut_1_arr = m.night_shut_1_arr;
    filled.push("night shut");
  }
  if (m.night_shut_2.some(Boolean)) {
    patch.night_shut_2 = m.night_shut_2.filter(Boolean).join(" ");
    if (m.night_shut_2_arr) patch.night_shut_2_arr = m.night_shut_2_arr;
  }
  if (!filled.length) return [];

  const { error } = cur?.id
    ? await supabase.from("hsk_daily_summary").update(patch).eq("id", cur.id)
    : await supabase.from("hsk_daily_summary").insert([{ report_date: date, villa_number: 0, ...patch }]);
  if (error) throw new Error(error.message);
  return filled;
};
