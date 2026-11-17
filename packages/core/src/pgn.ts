import { Chess } from 'chess.js';
import { withDerivedFields, type ArchivedGame } from './archive';
import { Game, START_FEN, parseUci, toUci } from './game';
import type { TimeControl } from './timeControl';
import type { GameEndReason, GameResult } from './types';

const RESULTS: readonly GameResult[] = ['1-0', '0-1', '1/2-1/2', '*'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** PGN tag value escaping (backslash and quote). */
function tag(name: string, value: string) {
  return `[${name} "${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

function termination(reason: GameEndReason | null): string | null {
  switch (reason) {
    case null:
      return null;
    case 'timeout':
    case 'timeout_vs_insufficient':
      return 'time forfeit';
    case 'abandoned':
      return 'abandoned';
    default:
      return 'normal';
  }
}

/** Seven Tag Roster plus the extras other chess software reads. */
export function pgnTags(g: ArchivedGame): [string, string][] {
  const d = new Date(g.endedAt || Date.now());
  const date = `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  const kept = g.tags ?? {};
  const event =
    kept.Event ?? (g.source === 'online' ? `ChessMate ${g.rated ? 'rated' : 'casual'} ${g.category ?? 'game'}` : g.source === 'practice' ? 'ChessMate practice board' : '?');
  const tags: [string, string][] = [
    ['Event', event],
    ['Site', kept.Site ?? (g.source === 'import' ? '?' : 'ChessMate')],
    ['Date', kept.Date ?? date],
    ['Round', kept.Round ?? '-'],
    ['White', g.white],
    ['Black', g.black],
    ['Result', g.result],
  ];
  if (g.source !== 'import' || !kept.Date) tags.push(['UTCDate', date], ['UTCTime', time]);
  if (g.whiteRating != null) tags.push(['WhiteElo', String(Math.round(g.whiteRating))]);
  if (g.blackRating != null) tags.push(['BlackElo', String(Math.round(g.blackRating))]);
  if (g.whiteDelta != null) tags.push(['WhiteRatingDiff', `${g.whiteDelta >= 0 ? '+' : ''}${Math.round(g.whiteDelta)}`]);
  if (g.blackDelta != null) tags.push(['BlackRatingDiff', `${g.blackDelta >= 0 ? '+' : ''}${Math.round(g.blackDelta)}`]);
  if (g.timeControl) tags.push(['TimeControl', `${Math.round(g.timeControl.initialMs / 1000)}+${Math.round(g.timeControl.incrementMs / 1000)}`]);
  if (g.eco) tags.push(['ECO', g.eco]);
  if (g.opening) tags.push(['Opening', g.opening]);
  const term = termination(g.reason);
  if (term) tags.push(['Termination', term]);
  if (g.initialFen !== START_FEN) tags.push(['SetUp', '1'], ['FEN', g.initialFen]);
  const written = new Set(tags.map(([k]) => k));
  for (const [k, v] of Object.entries(kept)) if (!written.has(k) && k !== 'UTCDate' && k !== 'UTCTime') tags.push([k, v]);
  return tags;
}

/** Movetext only, e.g. "1. e4 e5 2. Nf3 1-0", wrapped at 80 columns. */
export function pgnMovetext(moves: string[], initialFen: string, result: GameResult): string {
  const chess = new Chess(initialFen);
  const parts: string[] = [];
  const [, side, , , , fullmove] = initialFen.split(' ');
  let moveNo = Number(fullmove) || 1;
  let white = side !== 'b';
  for (const [i, uci] of moves.entries()) {
    const m = chess.move(parseUci(uci));
    if (white) parts.push(`${moveNo}. ${m.san}`);
    else parts.push(i === 0 ? `${moveNo}... ${m.san}` : m.san);
    if (!white) moveNo++;
    white = !white;
  }
  parts.push(result);
  const lines: string[] = [];
  let line = '';
  for (const p of parts) {
    if (line && line.length + 1 + p.length > 80) {
      lines.push(line);
      line = p;
    } else line = line ? `${line} ${p}` : p;
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

/** Full PGN for one game. */
export function gameToPgn(g: ArchivedGame): string {
  const header = pgnTags(g).map(([k, v]) => tag(k, v)).join('\n');
  return `${header}\n\n${pgnMovetext(g.moves, g.initialFen, g.result)}\n`;
}

/** Several games in one PGN file. */
export function gamesToPgn(games: readonly ArchivedGame[]): string {
  return games.map(gameToPgn).join('\n');
}

/** Splits a multi-game PGN file into one string per game. */
export function splitPgn(text: string): string[] {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const games: string[] = [];
  let cur: string[] = [];
  let hasMoves = false;
  const flush = () => {
    const s = cur.join('\n').trim();
    if (s) games.push(s);
    cur = [];
    hasMoves = false;
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && hasMoves) flush();
    if (trimmed && !trimmed.startsWith('[') && !trimmed.startsWith('%')) hasMoves = true;
    cur.push(line);
  }
  flush();
  return games;
}

/** FNV-1a, for stable ids so re-importing the same game does not duplicate it. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function parseDate(tags: Record<string, string>): number | null {
  const date = tags.UTCDate ?? tags.Date;
  const m = date && /^(\d{4})\.(\d{2}|\?\?)\.(\d{2}|\?\?)$/.exec(date);
  if (!m) return null;
  const t = /^(\d{2}):(\d{2}):(\d{2})$/.exec(tags.UTCTime ?? '');
  const month = m[2] === '??' ? 1 : Number(m[2]);
  const day = m[3] === '??' ? 1 : Number(m[3]);
  return Date.UTC(Number(m[1]), month - 1, day, t ? Number(t[1]) : 0, t ? Number(t[2]) : 0, t ? Number(t[3]) : 0);
}

function parseTimeControlTag(v: string | undefined): TimeControl | null {
  const m = v && /^(\d+)(?:\+(\d+))?$/.exec(v.trim());
  return m ? { initialMs: Number(m[1]) * 1000, incrementMs: Number(m[2] ?? 0) * 1000 } : null;
}

function rating(v: string | undefined): number | null {
  return v && /^\d+$/.test(v) ? Number(v) : null;
}

function ratingDiff(v: string | undefined): number | null {
  return v && /^[+-]?\d+$/.test(v) ? Number(v) : null;
}

function reasonFor(game: Game, terminationTag: string | undefined, result: GameResult): GameEndReason | null {
  const board = game.boardOutcome();
  if (board) return board.reason;
  const t = (terminationTag ?? '').toLowerCase();
  if (t.includes('time')) return 'timeout';
  if (t.includes('abandon')) return 'abandoned';
  if (result === '1-0' || result === '0-1') return 'resignation';
  if (result === '1/2-1/2') return 'draw_agreement';
  return null;
}

/** Tags the archive models directly; everything else is kept in `tags`. */
const MODELLED = new Set([
  'White', 'Black', 'Result', 'WhiteElo', 'BlackElo', 'WhiteRatingDiff', 'BlackRatingDiff',
  'TimeControl', 'ECO', 'Opening', 'Termination', 'SetUp', 'FEN', 'UTCDate', 'UTCTime',
]);

export interface PgnImportOptions {
  /** Names (case-insensitive) that identify the viewer, to set `myColor`. */
  myNames?: string[];
  /** Timestamp for games without a date. */
  now?: number;
}

export interface PgnImportResult {
  games: ArchivedGame[];
  errors: { index: number; message: string }[];
}

/** Parses one or more PGN games. Comments, NAGs and variations are ignored. */
export function parsePgn(text: string, opts: PgnImportOptions = {}): PgnImportResult {
  const now = opts.now ?? Date.now();
  const mine = new Set((opts.myNames ?? []).map((n) => n.toLowerCase()));
  const out: PgnImportResult = { games: [], errors: [] };
  for (const [index, chunk] of splitPgn(text).entries()) {
    try {
      const chess = new Chess();
      chess.loadPgn(chunk);
      const raw = chess.getHeaders() as Record<string, string | null | undefined>;
      const tags: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) if (typeof v === 'string' && v !== '' && v !== '?' && !(k === 'Date' && v === '????.??.??')) tags[k] = v;
      const initialFen = tags.FEN ?? START_FEN;
      const moves = chess.history({ verbose: true }).map(toUci);
      if (moves.length === 0 && !tags.FEN) throw new Error('No moves found');
      const game = Game.fromUciMoves(moves, initialFen);
      const headerResult = tags.Result as GameResult | undefined;
      const result: GameResult = headerResult && RESULTS.includes(headerResult) ? headerResult : (game.boardOutcome()?.result ?? '*');
      const white = tags.White ?? 'White';
      const black = tags.Black ?? 'Black';
      const endedAt = parseDate(tags) ?? now;
      const timeControl = parseTimeControlTag(tags.TimeControl);
      const extra: Record<string, string> = {};
      for (const [k, v] of Object.entries(tags)) if (!MODELLED.has(k)) extra[k] = v;
      const derived = withDerivedFields({
        id: `imp_${hash(`${white}|${black}|${tags.Date ?? ''}|${tags.UTCTime ?? ''}|${initialFen}|${moves.join(' ')}`)}`,
        source: 'import',
        white,
        black,
        whiteRating: rating(tags.WhiteElo),
        blackRating: rating(tags.BlackElo),
        whiteDelta: ratingDiff(tags.WhiteRatingDiff),
        blackDelta: ratingDiff(tags.BlackRatingDiff),
        myColor: mine.has(white.toLowerCase()) ? 'w' : mine.has(black.toLowerCase()) ? 'b' : null,
        timeControl,
        category: null,
        rated: (tags.Event ?? '').toLowerCase().includes('rated') && !(tags.Event ?? '').toLowerCase().includes('unrated'),
        result,
        reason: reasonFor(game, tags.Termination, result),
        initialFen,
        moves,
        startedAt: endedAt,
        endedAt,
        eco: null,
        opening: null,
        tags: Object.keys(extra).length ? extra : undefined,
      });
      // Fall back to the file's own opening tags when our table has no match.
      if (!derived.opening && tags.Opening) derived.opening = tags.Opening;
      if (!derived.eco && tags.ECO) derived.eco = tags.ECO;
      out.games.push(derived);
    } catch (e) {
      out.errors.push({ index, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
