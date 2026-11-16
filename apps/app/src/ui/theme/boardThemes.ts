/**
 * Board colour themes. `mono` is the brand default; the rest are user choices
 * (Settings > Board). Overlay colours stay semi-transparent so they read on any theme.
 */
export interface BoardTheme {
  id: BoardThemeId;
  name: string;
  light: string;
  dark: string;
  /** Coordinates drawn on light / dark squares. */
  coordOnLight: string;
  coordOnDark: string;
  whitePiece: string;
  whitePieceOutline: string;
  blackPiece: string;
  blackPieceOutline: string;
  lastMove: string;
  selected: string;
  check: string;
  threat: string;
  hint: string;
  /** Best-move / arrow colour for analysis and coach overlays. */
  arrow: string;
  /** Frame around the board. */
  frame: string;
}

export type BoardThemeId = 'mono' | 'graphite' | 'marble' | 'slate' | 'walnut' | 'tournament';

const shared = {
  whitePiece: '#FFFFFF',
  whitePieceOutline: '#15171B',
  blackPiece: '#15171B',
  blackPieceOutline: 'rgba(255, 255, 255, 0.35)',
  check: 'rgba(201, 56, 56, 0.72)',
  threat: 'rgba(201, 56, 56, 0.32)',
  arrow: 'rgba(20, 20, 22, 0.62)',
};

export const boardThemes: Record<BoardThemeId, BoardTheme> = {
  mono: {
    ...shared,
    id: 'mono',
    name: 'Monochrome',
    light: '#EDEDEF',
    dark: '#8E8E96',
    coordOnLight: '#8E8E96',
    coordOnDark: '#EDEDEF',
    lastMove: 'rgba(255, 214, 10, 0.38)',
    selected: 'rgba(10, 10, 11, 0.28)',
    hint: 'rgba(10, 10, 11, 0.30)',
    frame: 'rgba(255, 255, 255, 0.5)',
  },
  graphite: {
    ...shared,
    id: 'graphite',
    name: 'Graphite',
    light: '#A3A3AB',
    dark: '#4A4A52',
    coordOnLight: '#4A4A52',
    coordOnDark: '#A3A3AB',
    lastMove: 'rgba(255, 255, 255, 0.28)',
    selected: 'rgba(255, 255, 255, 0.30)',
    hint: 'rgba(10, 10, 11, 0.38)',
    arrow: 'rgba(255, 255, 255, 0.7)',
    frame: 'rgba(255, 255, 255, 0.18)',
  },
  marble: {
    ...shared,
    id: 'marble',
    name: 'Marble',
    light: '#F7F7F5',
    dark: '#C9C9C6',
    coordOnLight: '#A6A6A2',
    coordOnDark: '#F7F7F5',
    lastMove: 'rgba(10, 10, 11, 0.12)',
    selected: 'rgba(10, 10, 11, 0.22)',
    hint: 'rgba(10, 10, 11, 0.26)',
    frame: 'rgba(255, 255, 255, 0.7)',
  },
  slate: {
    ...shared,
    id: 'slate',
    name: 'Slate',
    light: '#DDE3EA',
    dark: '#6F7F91',
    coordOnLight: '#6F7F91',
    coordOnDark: '#DDE3EA',
    lastMove: 'rgba(120, 190, 255, 0.42)',
    selected: 'rgba(10, 30, 60, 0.26)',
    hint: 'rgba(10, 20, 40, 0.30)',
    frame: 'rgba(255, 255, 255, 0.45)',
  },
  walnut: {
    ...shared,
    id: 'walnut',
    name: 'Walnut',
    light: '#E8D5B5',
    dark: '#A47A55',
    coordOnLight: '#A47A55',
    coordOnDark: '#E8D5B5',
    lastMove: 'rgba(255, 220, 80, 0.42)',
    selected: 'rgba(40, 20, 0, 0.26)',
    hint: 'rgba(40, 20, 0, 0.30)',
    frame: 'rgba(255, 240, 220, 0.4)',
  },
  tournament: {
    ...shared,
    id: 'tournament',
    name: 'Tournament',
    light: '#E6EBDD',
    dark: '#7A9270',
    coordOnLight: '#7A9270',
    coordOnDark: '#E6EBDD',
    lastMove: 'rgba(255, 230, 60, 0.45)',
    selected: 'rgba(20, 40, 10, 0.25)',
    hint: 'rgba(20, 30, 10, 0.28)',
    frame: 'rgba(255, 255, 255, 0.4)',
  },
};

export const boardThemeList: BoardTheme[] = Object.values(boardThemes);
export const DEFAULT_BOARD_THEME: BoardThemeId = 'mono';
