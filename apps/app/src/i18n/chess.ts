import { analyzePosition, countryName, themeLabel as coreThemeLabel, type ReviewedMove, type Color, type PieceType, type PuzzleHint, type Square, type Threat } from '@chessmate/core';

import { COUNTRY_NAMES } from './countries';
import { translate, translateOr } from './index';
import { i18nStore } from './store';

/** Localised piece name: "knight", "Springer", "حصان". */
export function pieceLabel(type: PieceType): string {
  return translate(`chess.piece.${type}`);
}

export function colorLabel(c: Color): string {
  return translate(c === 'w' ? 'play.white' : 'play.black');
}

/** Piece type on a square of a FEN position, or null. */
export function pieceAt(fen: string, square: Square): PieceType | null {
  const rows = fen.split(' ')[0]?.split('/') ?? [];
  const file = square.charCodeAt(0) - 97;
  const row = rows[8 - Number(square[1])];
  if (!row) return null;
  let col = 0;
  for (const ch of row) {
    if (/\d/.test(ch)) col += Number(ch);
    else {
      if (col === file) return ch.toLowerCase() as PieceType;
      col++;
    }
  }
  return null;
}

/**
 * Localised version of core's English `Threat.description`, e.g. "Nxe5, winning the knight".
 * `fen` is the position the threat was computed in (before the move).
 */
export function threatText(th: Threat, fen: string): string {
  switch (th.kind) {
    case 'mate':
      return translate('chess.threat.mate', { san: th.san });
    case 'check':
      return translate('chess.threat.check', { san: th.san });
    case 'capture': {
      const p = pieceAt(fen, th.to);
      return p ? translate('chess.threat.capture', { san: th.san, piece: pieceLabel(p) }) : th.description;
    }
    case 'fork': {
      const names = th.targets.map((s) => pieceAt(fen, s)).filter((p): p is PieceType => !!p).map(pieceLabel);
      if (names.length < 2) return th.description;
      const list = names.slice(0, -1).join(translate('chess.listSep')) + translate('chess.listAnd') + names[names.length - 1];
      return translate('chess.threat.fork', { san: th.san, pieces: list });
    }
    default:
      return th.description;
  }
}

/** Localised puzzle theme ("fork" → "Gabel"), falling back to core's English label. */
export function puzzleThemeLabel(theme: string): string {
  return translateOr(`puzzleThemes.themes.${theme}`, coreThemeLabel(theme));
}

/** Localised puzzle theme group title ("Mates", "Tactics", …). */
export function puzzleGroupLabel(title: string): string {
  return translateOr(`puzzleThemes.groups.${title}`, title);
}

/** Localised puzzle hint: level 1 names the piece, level 2 the move. */
export function puzzleHintText(hint: PuzzleHint, fen: string): string {
  if (hint.level === 1) {
    const p = pieceAt(fen, hint.from);
    return translate('puzzles.hintLook', { piece: p ? pieceLabel(p) : translate('chess.piece.any'), square: hint.from });
  }
  const san = /^Play (.+)\.$/.exec(hint.text)?.[1];
  return san ? translate('puzzles.hintPlay', { san }) : hint.text;
}

/** Country name in the current language (core has English). */
export function countryLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const lang = i18nStore.get().lang;
  const local = lang === 'en' ? undefined : COUNTRY_NAMES[lang][code.toUpperCase()];
  return local ?? countryName(code);
}

/**
 * Localised one-line move feedback, mirroring core's English `quickFeedback`
 * (core/src/coach.ts). Recomputes the tactical facts from the position after the move.
 */
export function moveFeedbackText(m: Pick<ReviewedMove, 'san' | 'bestSan' | 'color' | 'fenAfter' | 'judgement'>): string {
  const cls = m.judgement.classification;
  switch (cls) {
    case 'best':
      return translate('feedback.best', { san: m.san });
    case 'forced':
      return translate('feedback.forced', { san: m.san });
    case 'book':
      return translate('feedback.book', { san: m.san });
    case 'masterpiece':
      return translate('feedback.masterpiece', { san: m.san });
    case 'brilliant':
      return translate('feedback.brilliant', { san: m.san });
    case 'great':
      return translate('feedback.great', { san: m.san });
    case 'miss':
      return translate('feedback.miss', { san: m.san, best: m.bestSan });
    case 'excellent':
    case 'good':
      return translate('feedback.solid', { san: m.san, best: m.bestSan });
    default: {
      const insight = analyzePosition(m.fenAfter, m.color);
      const top = insight.threats[0];
      const hang = insight.hanging[0];
      const reason = top
        ? translate('feedback.allows', { threat: threatText(top, m.fenAfter) })
        : hang
          ? translate('feedback.undefended', { piece: pieceLabel(hang.piece), square: hang.square })
          : '';
      return translate('feedback.bad', { san: m.san, cls: translate(`moveClass.${cls}.phrase`), best: m.bestSan, reason: reason ? ` ${reason}` : '' });
    }
  }
}

/** Board theme name and one-line note (`boardThemes.<id>.name|note`), falling back to the theme's own English. */
export function boardThemeText(theme: { id: string; name: string; note: string }): { name: string; note: string } {
  return { name: translateOr(`boardThemes.${theme.id}.name`, theme.name), note: translateOr(`boardThemes.${theme.id}.note`, theme.note) };
}

/** Piece set name and note (`pieceSets.<id>.name|note`). Credits and licences stay as published. */
export function pieceSetText(set: { id: string; name: string; note: string }): { name: string; note: string } {
  return { name: translateOr(`pieceSets.${set.id}.name`, set.name), note: translateOr(`pieceSets.${set.id}.note`, set.note) };
}
