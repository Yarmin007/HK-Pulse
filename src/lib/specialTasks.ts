// Tidies Public Area "Special Task" text: splits a one-line list into separate
// tasks, fixes common spelling mistakes and applies Title Case.

const SLOT_COUNT = 4;

// Words that stay lowercase inside a task (unless first).
const SMALL_WORDS = new Set(["and", "or", "of", "the", "in", "at", "to", "with", "for", "on", "a", "an", "by", "from"]);

// Kept fully upper-case.
const ACRONYMS = new Set(["boh", "foh", "ow", "ac", "gm", "hk", "pa", "fb", "f&b", "hod", "led", "tv", "it", "hr", "va", "ird"]);

// Housekeeping / resort vocabulary used for spelling correction.
const VOCAB = new Set(`
deep clean cleaning cleaned polish polishing polished scrub scrubbing shampoo shampooing wipe wiping
dust dusting mop mopping vacuum vacuuming wash washing sanitize sanitizing disinfect disinfecting
sweep sweeping descale descaling degrease degreasing oiling varnish varnishing removal remove
lobby reception restaurant restaurants bar bars spa gym pool pools jetty beach toilet toilets washroom
washrooms restroom restrooms corridor corridors pathway pathways staircase stairs steps windows window
glass glasses door doors carpet carpets floor floors marble tile tiles furniture chair chairs table tables
sofa sofas cushion cushions curtain curtains light lights lighting chandelier chandeliers ceiling ceilings
fan fans vent vents wall walls mirror mirrors garbage bin bins trash buggy buggies boat boats terminal
arrival departure pavilion kids club library boutique shop office offices staff canteen kitchen laundry
store storeroom area areas back front house entrance outdoor indoor deck decking wooden wood teak rust
stain stains high cobweb cobwebs grill grills signage handrail handrails railing railings umbrella
umbrellas sunbed sunbeds lounger loungers towel towels all both upper lower main side public room rooms
changing shower showers sink sinks basin basins tap taps fixture fixtures plant plants pot pots flower
flowers decoration decorations lamp lamps frame frames picture pictures artwork balcony terrace ramp gate
fence glassware cutlery bathroom bathrooms entrance hallway hallways lift lifts elevator elevators
skirting skirtings baseboard baseboards drain drains gutter gutters roof roofs path paths garden gardens
outside inside villa villas guest guests team welcome lounge lounges counter counters desk desks
cabinet cabinets shelf shelves locker lockers rack racks trolley trolleys equipment machine machines
dispenser dispensers soap tissue amenities amenity check checking inspection detail detailing full
general touch up spot frontage facade exterior interior windowsill windowsills sill sills frame
`.trim().split(/\s+/));

const levenshtein = (a: string, b: string): number => {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      // Swapped letters count as one mistake ("cleaing" / "claen")
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[a.length][b.length];
};

// Returns the closest known word, or the word unchanged when nothing is close
// enough (so names and places we don't know are left alone).
const correctWord = (word: string): string => {
  const lower = word.toLowerCase();
  if (lower.length < 4 || VOCAB.has(lower) || ACRONYMS.has(lower) || /\d/.test(lower)) return lower;
  const maxDist = lower.length >= 8 ? 2 : 1;
  let best = lower;
  let bestDist = maxDist + 1;
  for (const v of VOCAB) {
    if (Math.abs(v.length - lower.length) > maxDist) continue;
    const d = levenshtein(lower, v);
    if (d < bestDist) { best = v; bestDist = d; }
  }
  return bestDist <= maxDist ? best : lower;
};

/** Spell-correct and Title Case one task. */
export const tidySpecialTask = (task: string): string => {
  const words = task
    .replace(/^\s*(?:[-*•]+|\d+\s*[.)\-:])\s*/, "") // leading bullet / "1." / "2)"
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  return words
    .map((raw, i) => {
      // Keep surrounding punctuation like "(Lobby)" intact
      const m = raw.match(/^([^A-Za-z0-9&]*)([A-Za-z0-9&'’-]+)([^A-Za-z0-9&]*)$/);
      if (!m) return raw;
      const [, pre, core, post] = m;
      const fixed = correctWord(core);
      let out: string;
      if (ACRONYMS.has(fixed)) out = fixed.toUpperCase();
      else if (i > 0 && SMALL_WORDS.has(fixed)) out = fixed;
      else out = fixed.charAt(0).toUpperCase() + fixed.slice(1);
      return pre + out + post;
    })
    .join(" ");
};

/** Split text such as "gym deep clean, lobby glass / spa windows" into separate tasks. */
export const splitSpecialTasks = (text: string): string[] =>
  text
    // "1. x 2. y" or "1) x 2) y" on one line
    .replace(/\s+(?=\d+\s*[.)]\s+\S)/g, "\n")
    .split(/\n|,|;|\||•/)
    .map((t) => t.trim())
    .filter((t) => t.replace(/[\s\-=_~.*#:/|\\]/g, "").length >= 2);

/**
 * Turns raw lines into exactly 4 tidy slots. If there are more than 4 tasks,
 * the extras are joined onto the last slot so nothing is lost.
 */
export const distributeSpecialTasks = (lines: string[]): string[] => {
  const tasks = lines.flatMap(splitSpecialTasks).map(tidySpecialTask).filter(Boolean);
  const slots = tasks.slice(0, SLOT_COUNT - 1);
  const rest = tasks.slice(SLOT_COUNT - 1);
  if (rest.length) slots.push(rest.join(", "));
  while (slots.length < SLOT_COUNT) slots.push("");
  return slots;
};

export const SPECIAL_TASK_SHIFT = "Special Task";

/** A Public Area special-task row (by its shift; older rows by their "Special:" prefix). */
export const isSpecialTaskRow = (a: { area?: string; shift?: string | null; task_details?: string | null }): boolean =>
  a.area === "public" &&
  ((a.shift || "").trim().toLowerCase() === SPECIAL_TASK_SHIFT.toLowerCase() || /^\s*special:/i.test(a.task_details || ""));

/** The task text without any old "Special:" prefix. */
export const specialTaskText = (taskDetails?: string | null): string => (taskDetails || "").replace(/^\s*special:\s*/i, "").trim();
