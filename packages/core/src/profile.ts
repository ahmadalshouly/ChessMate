import { isFootballClubId } from './footballClubs';
import { isPlayerTag, type PlayerTag, type RoleTag } from './roleTags';
import type { ChessTitle } from './titles';
import type { TimeCategory } from './timeControl';
import type { GameEndReason, GameResult } from './types';

/**
 * Profiles and user settings, shared by the server (validation, storage) and
 * the app (screens, applying preferences). Everything here is plain data.
 */

// ---------- avatars ----------

/** Avatars are original monochrome presets, or a photo the player uploaded. */
export const AVATARS = ['initials', 'king', 'queen', 'rook', 'bishop', 'knight', 'pawn'] as const;
export type AvatarId = (typeof AVATARS)[number];
export const AVATAR_TONES = ['ink', 'paper', 'graphite', 'silver'] as const;
export type AvatarTone = (typeof AVATAR_TONES)[number];
export interface Avatar {
  id: AvatarId;
  tone: AvatarTone;
  /**
   * Uploaded profile picture, as a path on the game server (`/api/avatars/...`). Shown instead
   * of the preset when set. Only the upload endpoint sets it; profile edits can't.
   */
  photo?: string | null;
}
export const DEFAULT_AVATAR: Avatar = { id: 'initials', tone: 'ink' };

/** Largest profile picture the server accepts, in bytes (the app sends a 512 px JPEG, well under this). */
export const AVATAR_PHOTO_MAX_BYTES = 1_500_000;
/** Side of the square picture the app uploads. */
export const AVATAR_PHOTO_SIZE = 512;
/** Image types accepted for profile pictures. */
export const AVATAR_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AvatarPhotoType = (typeof AVATAR_PHOTO_TYPES)[number];

/** Image type from the file's first bytes, or null when it is not a JPEG, PNG or WebP. */
export function sniffAvatarPhotoType(bytes: Uint8Array): AvatarPhotoType | null {
  const b = (i: number) => bytes[i];
  if (bytes.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(b(0)!, b(1)!, b(2)!, b(3)!) === 'RIFF' && String.fromCharCode(b(8)!, b(9)!, b(10)!, b(11)!) === 'WEBP') return 'image/webp';
  return null;
}

// ---------- settings ----------

/** Board colour themes. The app holds the colours (apps/app/src/ui/theme/boardThemes.ts). */
export const BOARD_THEMES = [
  'graphite',
  'marble',
  'slate',
  'contrast',
  'frost',
  'onyx',
  'ivory',
  'walnut',
  'maple',
  'tournament',
  'ocean',
  'midnight',
  'emerald',
  'amethyst',
  'rose',
  'sand',
  'coral',
  'olive',
  'sky',
  'ruby',
  'mint',
  'teal',
  'sakura',
  'coffee',
  'charcoal',
  'sandstone',
  'honey',
  'apricot',
] as const;
export type BoardTheme = (typeof BOARD_THEMES)[number];
/** Piece sets. Artwork and credits live in apps/app/art/pieces. */
export const PIECE_SETS = ['classic', 'glass', 'spatial', 'celtic', 'fantasy', 'bold', 'caramel', 'shapes', 'eyes', 'cats', 'skulls', 'cburnett', 'firi', 'kaneo', 'moonlight'] as const;
export type PieceSet = (typeof PIECE_SETS)[number];
/** Ids from older versions, mapped to their closest current choice when settings are loaded. */
const LEGACY_VALUES: Record<string, Record<string, string>> = {
  'board.pieces': { outline: 'spatial' },
};
export const VISIBILITY = ['everyone', 'friends', 'nobody'] as const;
export type Visibility = (typeof VISIBILITY)[number];
/** Who may send a friend request. "friendsOfFriends" needs at least one mutual friend. */
export const FRIEND_REQUEST_AUDIENCE = ['everyone', 'friendsOfFriends', 'nobody'] as const;
export type FriendRequestAudience = (typeof FRIEND_REQUEST_AUDIENCE)[number];

export interface UserSettings {
  board: {
    theme: BoardTheme;
    pieces: PieceSet;
    coordinates: boolean;
    highlightLastMove: boolean;
    showLegalMoves: boolean;
  };
  sound: {
    enabled: boolean;
    /** 0 to 1. */
    volume: number;
    moves: boolean;
    lowTime: boolean;
    /** Vibrate on moves, captures and game end (phones only). */
    haptics: boolean;
    /**
     * Play sounds while the phone is on silent (iPhone silent switch, Android silent or
     * vibrate). Off by default: a muted phone stays quiet. Replaces the earlier `silentMode`,
     * which defaulted to on, so everyone starts from the new default once.
     */
    playOnSilent: boolean;
  };
  gameplay: {
    /** Ask before sending a move in online games. */
    confirmMoves: 'never' | 'correspondence' | 'always';
    autoQueen: boolean;
    confirmResign: boolean;
    /** Queue a move while the opponent is thinking (live games). */
    premoves: boolean;
  };
  notifications: {
    gameStart: boolean;
    yourTurn: boolean;
    challenges: boolean;
    friendRequests: boolean;
    email: boolean;
  };
  privacy: {
    showOnline: boolean;
    showRatingHistory: boolean;
    showGames: boolean;
    /** Who may send you a direct challenge. Invite links you share yourself always work. */
    challenges: Visibility;
    messages: Visibility;
    friendRequests: FriendRequestAudience;
    /** Who may watch your live games. Your opponent always sees the game. */
    spectators: Visibility;
    /** Show up when other players search by username. Friends can always find you. */
    searchable: boolean;
    /** Let players follow you (their feed shows your games). */
    allowFollows: boolean;
  };
}

export const DEFAULT_SETTINGS: UserSettings = {
  board: { theme: 'graphite', pieces: 'classic', coordinates: true, highlightLastMove: true, showLegalMoves: true },
  sound: { enabled: true, volume: 0.7, moves: true, lowTime: true, haptics: true, playOnSilent: false },
  gameplay: { confirmMoves: 'never', autoQueen: false, confirmResign: true, premoves: true },
  notifications: { gameStart: true, yourTurn: true, challenges: true, friendRequests: true, email: false },
  privacy: {
    showOnline: true,
    showRatingHistory: true,
    showGames: true,
    challenges: 'everyone',
    messages: 'friends',
    friendRequests: 'everyone',
    spectators: 'everyone',
    searchable: true,
    allowFollows: true,
  },
};

export type SettingsPatch = { [K in keyof UserSettings]?: Partial<UserSettings[K]> };

const ENUMS: Record<string, readonly string[]> = {
  'board.theme': BOARD_THEMES,
  'board.pieces': PIECE_SETS,
  'gameplay.confirmMoves': ['never', 'correspondence', 'always'],
  'privacy.challenges': VISIBILITY,
  'privacy.messages': VISIBILITY,
  'privacy.friendRequests': FRIEND_REQUEST_AUDIENCE,
  'privacy.spectators': VISIBILITY,
};

/**
 * Merges an untrusted patch onto settings. Unknown keys and wrongly typed
 * values are rejected with a message naming the field.
 */
export function applySettingsPatch(base: UserSettings, patch: unknown): { settings: UserSettings } | { error: string } {
  if (!isObject(patch)) return { error: 'Settings must be an object' };
  const next = structuredCloneSettings(base);
  for (const [section, values] of Object.entries(patch)) {
    if (!(section in DEFAULT_SETTINGS)) return { error: `Unknown settings section "${section}"` };
    if (!isObject(values)) return { error: `"${section}" must be an object` };
    const defaults = DEFAULT_SETTINGS[section as keyof UserSettings] as Record<string, unknown>;
    const target = next[section as keyof UserSettings] as Record<string, unknown>;
    for (const [key, value] of Object.entries(values)) {
      const path = `${section}.${key}`;
      if (!(key in defaults)) return { error: `Unknown setting "${path}"` };
      const allowed = ENUMS[path];
      if (allowed) {
        if (typeof value !== 'string' || !allowed.includes(value)) return { error: `"${path}" must be one of ${allowed.join(', ')}` };
      } else if (typeof defaults[key] === 'boolean') {
        if (typeof value !== 'boolean') return { error: `"${path}" must be true or false` };
      } else if (typeof defaults[key] === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return { error: `"${path}" must be between 0 and 1` };
      }
      target[key] = value;
    }
  }
  return { settings: next };
}

/** Fills missing keys (e.g. settings saved by an older version) from defaults. */
export function normalizeSettings(stored: unknown): UserSettings {
  const out = structuredCloneSettings(DEFAULT_SETTINGS);
  if (!isObject(stored)) return out;
  for (const section of Object.keys(DEFAULT_SETTINGS) as (keyof UserSettings)[]) {
    const values = stored[section];
    if (!isObject(values)) continue;
    for (const key of Object.keys(DEFAULT_SETTINGS[section])) {
      const raw = values[key];
      const value = typeof raw === 'string' ? (LEGACY_VALUES[`${section}.${key}`]?.[raw] ?? raw) : raw;
      const res = applySettingsPatch(out, { [section]: { [key]: value } });
      if ('settings' in res && values[key] !== undefined) Object.assign(out, res.settings);
    }
  }
  return out;
}

function structuredCloneSettings(s: UserSettings): UserSettings {
  return JSON.parse(JSON.stringify(s)) as UserSettings;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ---------- profile ----------

export const BIO_MAX = 400;
export const DISPLAY_NAME_MAX = 30;

export interface ProfileEdit {
  displayName?: string;
  bio?: string | null;
  country?: string | null;
  avatar?: Avatar;
  playerTag?: PlayerTag | null;
  /** Football Mate: id from FOOTBALL_CLUBS, or null to clear. */
  footballClub?: string | null;
}

export function validateProfileEdit(input: unknown): { edit: ProfileEdit } | { error: string; field: string } {
  if (!isObject(input)) return { error: 'Expected an object', field: 'body' };
  const edit: ProfileEdit = {};
  if (input.displayName !== undefined) {
    const v = typeof input.displayName === 'string' ? input.displayName.trim().replace(/\s+/g, ' ') : '';
    if (v.length < 1 || v.length > DISPLAY_NAME_MAX) return { error: `Display name must be 1 to ${DISPLAY_NAME_MAX} characters`, field: 'displayName' };
    if (/[\u0000-\u001f<>]/.test(v)) return { error: 'Display name contains characters that are not allowed', field: 'displayName' };
    edit.displayName = v;
  }
  if (input.bio !== undefined) {
    if (input.bio !== null && typeof input.bio !== 'string') return { error: 'Bio must be text', field: 'bio' };
    const v = input.bio === null ? null : input.bio.trim();
    if (v && v.length > BIO_MAX) return { error: `Bio must be at most ${BIO_MAX} characters`, field: 'bio' };
    edit.bio = v || null;
  }
  if (input.country !== undefined) {
    if (input.country !== null && (typeof input.country !== 'string' || !COUNTRY_CODES.has(input.country.toUpperCase()))) {
      return { error: 'Pick a country from the list', field: 'country' };
    }
    edit.country = input.country === null ? null : input.country.toUpperCase();
  }
  if (input.avatar !== undefined) {
    const a = input.avatar;
    if (!isObject(a) || !AVATARS.includes(a.id as AvatarId) || !AVATAR_TONES.includes(a.tone as AvatarTone)) {
      return { error: 'Pick an avatar from the list', field: 'avatar' };
    }
    edit.avatar = { id: a.id as AvatarId, tone: a.tone as AvatarTone };
  }
  if (input.playerTag !== undefined) {
    if (input.playerTag !== null && !isPlayerTag(input.playerTag)) return { error: 'Pick a tag from the list', field: 'playerTag' };
    edit.playerTag = input.playerTag;
  }
  if (input.footballClub !== undefined) {
    if (input.footballClub !== null && !isFootballClubId(input.footballClub)) return { error: 'Pick a club from the list', field: 'footballClub' };
    edit.footballClub = input.footballClub;
  }
  return { edit };
}

export interface CategoryStats {
  category: TimeCategory;
  rating: number;
  rd: number;
  provisional: boolean;
  peak: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface RecentGame {
  id: string;
  category: TimeCategory;
  timeControl: string;
  rated: boolean;
  color: 'w' | 'b';
  opponent: { username: string; rating: number };
  result: GameResult;
  /** From this player's point of view. */
  outcome: 'win' | 'loss' | 'draw';
  reason: GameEndReason;
  ratingDelta: number | null;
  moves: number;
  endedAt: number;
  /** Accuracy per side once the game has a saved review (shown instead of a Review button). */
  accuracy?: { w: number; b: number } | null;
}

export interface PublicProfile {
  id: string;
  username: string;
  /** Verified chess title (GM, IM, ...), granted by staff after an application. */
  title?: ChessTitle | null;
  /** Official tag (ChessMate staff, streamer, coach, ...), only set by admins. */
  roleTag?: RoleTag | null;
  /** Tag the player picked for themselves (Tactician, Night owl, ...). */
  playerTag?: PlayerTag | null;
  /** Football Mate: the club they support (id from FOOTBALL_CLUBS), shown as a badge by their name. */
  footballClub?: string | null;
  displayName: string;
  avatar: Avatar;
  bio: string | null;
  country: string | null;
  createdAt: number;
  online: boolean | null;
  /** The live game they are playing right now, when their online status is visible. */
  liveGameId?: string | null;
  ratings: CategoryStats[];
  totals: { games: number; wins: number; losses: number; draws: number };
  /** Null when the player hides their games. */
  recentGames: RecentGame[] | null;
  isMe: boolean;
}

export interface MyProfile extends PublicProfile {
  email: string;
  settings: UserSettings;
}

export interface RatingPoint {
  t: number;
  rating: number;
  gameId: string;
}

export const RATED_CATEGORIES: TimeCategory[] = ['bullet', 'blitz', 'rapid', 'classical'];

// ---------- countries (ISO 3166-1 alpha-2) ----------

export const COUNTRIES: readonly (readonly [code: string, name: string])[] = [
  ['AF', 'Afghanistan'], ['AL', 'Albania'], ['DZ', 'Algeria'], ['AD', 'Andorra'], ['AO', 'Angola'], ['AG', 'Antigua and Barbuda'],
  ['AR', 'Argentina'], ['AM', 'Armenia'], ['AU', 'Australia'], ['AT', 'Austria'], ['AZ', 'Azerbaijan'], ['BS', 'Bahamas'],
  ['BH', 'Bahrain'], ['BD', 'Bangladesh'], ['BB', 'Barbados'], ['BY', 'Belarus'], ['BE', 'Belgium'], ['BZ', 'Belize'],
  ['BJ', 'Benin'], ['BT', 'Bhutan'], ['BO', 'Bolivia'], ['BA', 'Bosnia and Herzegovina'], ['BW', 'Botswana'], ['BR', 'Brazil'],
  ['BN', 'Brunei'], ['BG', 'Bulgaria'], ['BF', 'Burkina Faso'], ['BI', 'Burundi'], ['CV', 'Cabo Verde'], ['KH', 'Cambodia'],
  ['CM', 'Cameroon'], ['CA', 'Canada'], ['CF', 'Central African Republic'], ['TD', 'Chad'], ['CL', 'Chile'], ['CN', 'China'],
  ['CO', 'Colombia'], ['KM', 'Comoros'], ['CG', 'Congo'], ['CD', 'Congo (DRC)'], ['CR', 'Costa Rica'], ['CI', "Côte d'Ivoire"],
  ['HR', 'Croatia'], ['CU', 'Cuba'], ['CY', 'Cyprus'], ['CZ', 'Czechia'], ['DK', 'Denmark'], ['DJ', 'Djibouti'],
  ['DM', 'Dominica'], ['DO', 'Dominican Republic'], ['EC', 'Ecuador'], ['EG', 'Egypt'], ['SV', 'El Salvador'], ['GQ', 'Equatorial Guinea'],
  ['ER', 'Eritrea'], ['EE', 'Estonia'], ['SZ', 'Eswatini'], ['ET', 'Ethiopia'], ['FJ', 'Fiji'], ['FI', 'Finland'],
  ['FR', 'France'], ['GA', 'Gabon'], ['GM', 'Gambia'], ['GE', 'Georgia'], ['DE', 'Germany'], ['GH', 'Ghana'],
  ['GR', 'Greece'], ['GD', 'Grenada'], ['GT', 'Guatemala'], ['GN', 'Guinea'], ['GW', 'Guinea-Bissau'], ['GY', 'Guyana'],
  ['HT', 'Haiti'], ['HN', 'Honduras'], ['HK', 'Hong Kong'], ['HU', 'Hungary'], ['IS', 'Iceland'], ['IN', 'India'],
  ['ID', 'Indonesia'], ['IR', 'Iran'], ['IQ', 'Iraq'], ['IE', 'Ireland'], ['IL', 'Israel'], ['IT', 'Italy'],
  ['JM', 'Jamaica'], ['JP', 'Japan'], ['JO', 'Jordan'], ['KZ', 'Kazakhstan'], ['KE', 'Kenya'], ['KI', 'Kiribati'],
  ['KR', 'Korea, South'], ['KP', 'Korea, North'], ['XK', 'Kosovo'], ['KW', 'Kuwait'], ['KG', 'Kyrgyzstan'], ['LA', 'Laos'],
  ['LV', 'Latvia'], ['LB', 'Lebanon'], ['LS', 'Lesotho'], ['LR', 'Liberia'], ['LY', 'Libya'], ['LI', 'Liechtenstein'],
  ['LT', 'Lithuania'], ['LU', 'Luxembourg'], ['MO', 'Macao'], ['MG', 'Madagascar'], ['MW', 'Malawi'], ['MY', 'Malaysia'],
  ['MV', 'Maldives'], ['ML', 'Mali'], ['MT', 'Malta'], ['MH', 'Marshall Islands'], ['MR', 'Mauritania'], ['MU', 'Mauritius'],
  ['MX', 'Mexico'], ['FM', 'Micronesia'], ['MD', 'Moldova'], ['MC', 'Monaco'], ['MN', 'Mongolia'], ['ME', 'Montenegro'],
  ['MA', 'Morocco'], ['MZ', 'Mozambique'], ['MM', 'Myanmar'], ['NA', 'Namibia'], ['NR', 'Nauru'], ['NP', 'Nepal'],
  ['NL', 'Netherlands'], ['NZ', 'New Zealand'], ['NI', 'Nicaragua'], ['NE', 'Niger'], ['NG', 'Nigeria'], ['MK', 'North Macedonia'],
  ['NO', 'Norway'], ['OM', 'Oman'], ['PK', 'Pakistan'], ['PW', 'Palau'], ['PS', 'Palestine'], ['PA', 'Panama'],
  ['PG', 'Papua New Guinea'], ['PY', 'Paraguay'], ['PE', 'Peru'], ['PH', 'Philippines'], ['PL', 'Poland'], ['PT', 'Portugal'],
  ['PR', 'Puerto Rico'], ['QA', 'Qatar'], ['RO', 'Romania'], ['RU', 'Russia'], ['RW', 'Rwanda'], ['KN', 'Saint Kitts and Nevis'],
  ['LC', 'Saint Lucia'], ['VC', 'Saint Vincent and the Grenadines'], ['WS', 'Samoa'], ['SM', 'San Marino'], ['ST', 'São Tomé and Príncipe'], ['SA', 'Saudi Arabia'],
  ['SN', 'Senegal'], ['RS', 'Serbia'], ['SC', 'Seychelles'], ['SL', 'Sierra Leone'], ['SG', 'Singapore'], ['SK', 'Slovakia'],
  ['SI', 'Slovenia'], ['SB', 'Solomon Islands'], ['SO', 'Somalia'], ['ZA', 'South Africa'], ['SS', 'South Sudan'], ['ES', 'Spain'],
  ['LK', 'Sri Lanka'], ['SD', 'Sudan'], ['SR', 'Suriname'], ['SE', 'Sweden'], ['CH', 'Switzerland'], ['SY', 'Syria'],
  ['TW', 'Taiwan'], ['TJ', 'Tajikistan'], ['TZ', 'Tanzania'], ['TH', 'Thailand'], ['TL', 'Timor-Leste'], ['TG', 'Togo'],
  ['TO', 'Tonga'], ['TT', 'Trinidad and Tobago'], ['TN', 'Tunisia'], ['TR', 'Türkiye'], ['TM', 'Turkmenistan'], ['TV', 'Tuvalu'],
  ['UG', 'Uganda'], ['UA', 'Ukraine'], ['AE', 'United Arab Emirates'], ['GB', 'United Kingdom'], ['US', 'United States'], ['UY', 'Uruguay'],
  ['UZ', 'Uzbekistan'], ['VU', 'Vanuatu'], ['VA', 'Vatican City'], ['VE', 'Venezuela'], ['VN', 'Vietnam'], ['YE', 'Yemen'],
  ['ZM', 'Zambia'], ['ZW', 'Zimbabwe'],
];

export const COUNTRY_CODES: ReadonlySet<string> = new Set(COUNTRIES.map(([c]) => c));
const COUNTRY_NAMES = new Map(COUNTRIES);

export function countryName(code: string | null | undefined): string | null {
  return code ? (COUNTRY_NAMES.get(code.toUpperCase()) ?? null) : null;
}

/** Regional-indicator flag emoji for an ISO code (e.g. "SE" → 🇸🇪). */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// ---------- privacy checks ----------

/** Whether a "who can …" setting lets this person in. The owner always passes. */
export function audienceAllows(setting: Visibility, viewer: { self?: boolean; friend: boolean }): boolean {
  if (viewer.self) return true;
  return setting === 'everyone' || (setting === 'friends' && viewer.friend);
}
