/**
 * In-game chat rules shared by app and server: quick messages, limits,
 * profanity filtering and report reasons. The server is authoritative (it
 * filters every message before relaying); the app uses the same functions
 * to preview and to explain why something was masked.
 */

export const CHAT_MAX_LENGTH = 140;
/** Messages a player may send per window before being throttled. */
export const CHAT_RATE = { max: 5, windowMs: 10_000 } as const;

export const QUICK_MESSAGES = [
  { id: 'hello', text: 'Hello!' },
  { id: 'good_luck', text: 'Good luck!' },
  { id: 'have_fun', text: 'Have fun!' },
  { id: 'nice_move', text: 'Nice move!' },
  { id: 'oops', text: 'Oops' },
  { id: 'thanks', text: 'Thanks!' },
  { id: 'good_game', text: 'Good game!' },
  { id: 'well_played', text: 'Well played' },
  { id: 'rematch', text: 'Rematch?' },
] as const;

export type QuickMessageId = (typeof QUICK_MESSAGES)[number]['id'];

export function quickMessageText(id: string): string | null {
  return QUICK_MESSAGES.find((q) => q.id === id)?.text ?? null;
}

export interface ChatLine {
  id: string;
  gameId: string;
  /** Sender's player id; "system" for server notices. */
  playerId: string;
  name: string;
  text: string;
  quick?: QuickMessageId;
  /** True when the profanity filter masked part of the message. */
  filtered?: boolean;
  at: number;
}

export const REPORT_REASONS = [
  { id: 'abusive_chat', label: 'Abusive or offensive chat' },
  { id: 'cheating', label: 'Cheating or engine use' },
  { id: 'spam', label: 'Spam or advertising' },
  { id: 'offensive_name', label: 'Offensive username' },
  { id: 'unsporting', label: 'Unsporting behaviour (stalling, leaving)' },
  { id: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['id'];
export const REPORT_NOTE_MAX = 500;

export function isReportReason(r: unknown): r is ReportReason {
  return typeof r === 'string' && REPORT_REASONS.some((x) => x.id === r);
}

// ---- profanity filter ----

/**
 * Word stems that are masked. Kept short on purpose: this is a first line of
 * defence; reports and moderators handle the rest. Matching is done on a
 * normalised copy (lowercase, leetspeak folded, repeated letters squeezed),
 * and only at word starts, so words like "class" or "Scunthorpe" pass.
 */
const BLOCKED_STEMS = [
  'fuck', 'fuk', 'fck', 'shit', 'bitch', 'bastard', 'cunt', 'dick', 'cock', 'pussy',
  'asshole', 'arsehole', 'wanker', 'twat', 'slut', 'whore', 'retard', 'motherfuck',
  'nigger', 'nigga', 'faggot', 'fag', 'kys', 'killyourself',
];
/** Stems that only match as a whole word (too many innocent words start with them). */
const WHOLE_WORDS = new Set(['ass', 'dick', 'cock', 'fag', 'kys', 'tit', 'tits', 'cum', 'hoe']);

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };

function normaliseWord(w: string): string {
  let out = '';
  for (const ch of w.toLowerCase()) {
    const c = LEET[ch] ?? ch;
    if (/[a-z]/.test(c)) out += c; // drop separators like f.u.c.k
  }
  // Squeeze repeats for matching ("fuuuck" -> "fuck"); stems are squeezed the same way.
  return out.replace(/(.)\1+/g, '$1');
}

function squeezeStem(s: string) {
  return s.replace(/(.)\1+/g, '$1');
}
const STEMS = BLOCKED_STEMS.map(squeezeStem);
const WHOLE = new Set([...WHOLE_WORDS].map(squeezeStem));

function isBlocked(word: string): boolean {
  const n = normaliseWord(word);
  if (n.length < 2) return false;
  if (WHOLE.has(n)) return true;
  return STEMS.some((s) => !WHOLE.has(s) && n.startsWith(s));
}

export interface FilterResult {
  text: string;
  filtered: boolean;
}

/** Masks blocked words with asterisks, keeping the first letter. */
export function filterProfanity(input: string): FilterResult {
  let filtered = false;
  // Tokens are runs of non-space characters; punctuation inside counts so
  // "f.u.c.k" is one token.
  const text = input.replace(/\S+/g, (tok) => {
    const m = /^([("'[]*)(.*?)([)"'\].,!?:;]*)$/.exec(tok);
    const [lead, core, trail] = m ? [m[1]!, m[2]!, m[3]!] : ['', tok, ''];
    if (!core || !isBlocked(core)) return tok;
    filtered = true;
    return lead + core[0] + '*'.repeat(Math.max(2, core.length - 1)) + trail;
  });
  return { text, filtered };
}

/** Removes control characters, collapses whitespace and enforces the length limit. */
export function sanitizeChat(input: string): string {
  return input
    .replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MAX_LENGTH);
}

/** Full server-side pipeline: sanitize then filter. Returns null for empty input. */
export function prepareChat(input: unknown): FilterResult | null {
  if (typeof input !== 'string') return null;
  const clean = sanitizeChat(input);
  if (!clean) return null;
  return filterProfanity(clean);
}
