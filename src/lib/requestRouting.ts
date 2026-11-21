// Who a new request is for, worked out from what was typed (the user can still change it):
//   runner       something to take to the villa (items, "bring 2 towels") → runners are notified
//   va           information for the villa attendant ("clean at 10:30", "no turndown", "DND till 2pm")
//                → handed straight to the VA, runners never see it
//   engineering  something broken ("AC not cooling", "toilet blocked") → Maintenance request,
//                to be reported to Engineering; runners never see it, the VA is told
export type Routing = 'runner' | 'va' | 'engineering';

export const MAINTENANCE_TYPE = 'Maintenance';
export const ENGINEERING = 'Engineering';

const MAINT = /\b(a\/?c\b|aircon|air ?con(dition(er|ing))?|not cooling|too (hot|cold)|leak(s|ing)?|broken|not working|doesn'?t work|don'?t work|stopped working|fault(y)?|repair|fix\b|blocked|clogged|drain|flush|toilet|no (hot )?water|hot water|water pressure|low pressure|shower head|tap|faucet|sink|bulb|light(s)? (not|off|flicker)|flicker|no power|power (cut|off|out)|socket|switch|electric|tv\b|television|remote|wi-?fi|internet|telephone|door|lock(ed)?\b|safe\b|key ?card|ceiling fan|fan (not|noise)|pump|jacuzzi|bathtub|noise|noisy|smell(s|y)?|mou?ld|pest|ants?\b|insects?|cockroach|termite|rat\b|gecko|hinge|handle|curtain (track|rail)|blind|tile|crack(ed)?|paint|loose|squeak|creak|alarm beep|smoke detector)\b/i;
const DELIVER = /\b(bring|send|deliver|extra|more|another|replace|refill|top ?up|\d+\s*x\b|\d+\s+(pcs?|pieces?|bottles?)|towels?|pillows?|robes?|bathrobes?|slippers?|blankets?|duvet|sheets?|kit|amenit(y|ies)|ice\b|water bottles?|bottled water|cot\b|crib|high ?chair|iron(ing)?|hair ?dryer|kettle|adapter|umbrella|mat\b|toothbrush|razor|shampoo|lotion|sunscreen|after ?sun|tissue|toilet (paper|roll))\b/i;
const INFO = /\b(clean(ing)?|service|make ?up|\bmur\b|turn ?down|\btd\b|dnd|do not disturb|privacy|no service|skip|later|after|before|wake ?up|guest (is )?(out|away|back)|until|till|time)\b|\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s?(am|pm)\b/i;

/** What a typed note is about. Picked items always go with the runners. */
export const suggestRouting = (note: string, itemCount = 0): Routing => {
  const t = String(note || '');
  if (itemCount > 0) return 'runner';
  if (!t.trim()) return 'runner';
  if (MAINT.test(t) && !/\b(bring|send|extra)\b/i.test(t)) return 'engineering';
  if (DELIVER.test(t)) return 'runner';
  if (INFO.test(t)) return 'va';
  return 'runner';
};

export const ROUTING_LABEL: Record<Routing, { title: string; hint: string }> = {
  runner: { title: 'Runner delivers', hint: 'Runners on duty are notified' },
  va: { title: 'Inform VA only', hint: 'Goes to the villa attendant; runners are not notified' },
  engineering: { title: 'Maintenance → Engineering', hint: 'Report it to Engineering; the VA is told, runners are not' },
};

export const isMaintenance = (r: { request_type?: string | null }) => r.request_type === MAINTENANCE_TYPE;
