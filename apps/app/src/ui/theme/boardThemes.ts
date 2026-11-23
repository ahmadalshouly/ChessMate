import { BOARD_THEMES, type BoardTheme as BoardThemeId } from '@chessmate/core';

export type { BoardThemeId };

/**
 * Board themes (Settings > Board). Graphite is the brand default; the ids are shared
 * with the server (`BOARD_THEMES` in @chessmate/core) so a player's choice follows them
 * to every device. Overlay colours stay semi-transparent so they read on any theme.
 */
export interface BoardTheme {
  id: BoardThemeId;
  name: string;
  /** Short line shown under the name in the picker. */
  note: string;
  light: string;
  dark: string;
  /**
   * Surface treatment drawn over the squares:
   * - flat: plain squares
   * - glass: a soft light-to-shade sheen across the whole board
   * - natural: each square shifts its tone slightly, like stone or wood
   */
  finish: 'flat' | 'glass' | 'natural';
  /** Coordinates drawn on light / dark squares. */
  coordOnLight: string;
  coordOnDark: string;
  lastMove: string;
  selected: string;
  check: string;
  threat: string;
  hint: string;
  /** Best-move / arrow colour for analysis and coach overlays. */
  arrow: string;
  /** Frame around the board. */
  frame: string;
  /** Legacy piece colours, used only by the Unicode fallback. */
  whitePiece: string;
  whitePieceOutline: string;
  blackPiece: string;
  blackPieceOutline: string;
}

type Spec = Pick<BoardTheme, 'name' | 'note' | 'light' | 'dark'> & Partial<Omit<BoardTheme, 'id'>>;

function make(id: BoardThemeId, spec: Spec): BoardTheme {
  return {
    id,
    finish: 'flat',
    coordOnLight: spec.dark,
    coordOnDark: spec.light,
    lastMove: 'rgba(255, 214, 10, 0.36)',
    selected: 'rgba(10, 10, 11, 0.24)',
    check: 'rgba(214, 48, 48, 0.75)',
    threat: 'rgba(214, 48, 48, 0.3)',
    hint: 'rgba(10, 10, 11, 0.28)',
    arrow: 'rgba(20, 20, 22, 0.62)',
    frame: 'rgba(255, 255, 255, 0.45)',
    whitePiece: '#FFFFFF',
    whitePieceOutline: '#15171B',
    blackPiece: '#15171B',
    blackPieceOutline: 'rgba(255, 255, 255, 0.35)',
    ...spec,
  };
}

export const boardThemes: Record<BoardThemeId, BoardTheme> = {
  graphite: make('graphite', { name: 'Graphite', note: 'Default', light: '#EDEDEF', dark: '#8E8E96', finish: 'glass' }),
  marble: make('marble', { name: 'Marble', note: 'Veined stone', light: '#F4F2ED', dark: '#B5B0A6', finish: 'natural', lastMove: 'rgba(10, 10, 11, 0.13)', selected: 'rgba(10, 10, 11, 0.2)' }),
  slate: make('slate', { name: 'Slate', note: 'Cool and calm', light: '#DCE2E8', dark: '#5F6B78', finish: 'natural', lastMove: 'rgba(120, 190, 255, 0.4)' }),
  contrast: make('contrast', { name: 'High contrast', note: 'Maximum clarity', light: '#FFFFFF', dark: '#3A3B41', lastMove: 'rgba(255, 196, 0, 0.5)', hint: 'rgba(120, 120, 128, 0.55)', arrow: 'rgba(255, 170, 0, 0.8)' }),
  frost: make('frost', { name: 'Frost', note: 'Frosted glass', light: '#F6F8FB', dark: '#BAC4D0', finish: 'glass', lastMove: 'rgba(90, 160, 255, 0.3)', frame: 'rgba(255, 255, 255, 0.75)' }),
  onyx: make('onyx', {
    name: 'Onyx',
    note: 'Polished black',
    light: '#C9CBD1',
    dark: '#45474F',
    finish: 'glass',
    lastMove: 'rgba(255, 255, 255, 0.26)',
    selected: 'rgba(255, 255, 255, 0.28)',
    hint: 'rgba(10, 10, 11, 0.4)',
    arrow: 'rgba(255, 255, 255, 0.72)',
    frame: 'rgba(255, 255, 255, 0.18)',
  }),
  ivory: make('ivory', { name: 'Ivory', note: 'Warm and quiet', light: '#F7F2E8', dark: '#A0968A', finish: 'natural' }),
  walnut: make('walnut', { name: 'Walnut', note: 'Dark wood', light: '#E9D6B6', dark: '#9C7250', finish: 'natural', lastMove: 'rgba(255, 220, 80, 0.4)', selected: 'rgba(40, 20, 0, 0.26)', hint: 'rgba(40, 20, 0, 0.3)', frame: 'rgba(255, 240, 220, 0.4)' }),
  maple: make('maple', { name: 'Maple', note: 'Light wood', light: '#F1E2C6', dark: '#C49A6C', finish: 'natural', lastMove: 'rgba(255, 210, 60, 0.42)', selected: 'rgba(40, 20, 0, 0.24)', hint: 'rgba(40, 20, 0, 0.28)' }),
  tournament: make('tournament', { name: 'Tournament', note: 'Club classic', light: '#E8ECDF', dark: '#76906C', lastMove: 'rgba(255, 230, 60, 0.45)', selected: 'rgba(20, 40, 10, 0.25)' }),
  ocean: make('ocean', { name: 'Ocean', note: 'Deep blue', light: '#E0EAF1', dark: '#4E7896', finish: 'glass', lastMove: 'rgba(120, 220, 255, 0.38)', selected: 'rgba(5, 25, 50, 0.26)' }),
  midnight: make('midnight', {
    name: 'Midnight',
    note: 'Night blue',
    light: '#A7B0C2',
    dark: '#2E374B',
    finish: 'glass',
    lastMove: 'rgba(140, 180, 255, 0.34)',
    selected: 'rgba(255, 255, 255, 0.24)',
    hint: 'rgba(5, 8, 20, 0.42)',
    arrow: 'rgba(255, 255, 255, 0.72)',
    frame: 'rgba(255, 255, 255, 0.16)',
  }),
  emerald: make('emerald', { name: 'Emerald', note: 'Jewel green', light: '#E2EFE7', dark: '#3A7D61', finish: 'glass', lastMove: 'rgba(255, 236, 110, 0.42)' }),
  amethyst: make('amethyst', { name: 'Amethyst', note: 'Soft violet', light: '#ECE6F3', dark: '#7F6CA1', finish: 'glass' }),
  rose: make('rose', { name: 'Rose', note: 'Muted rose', light: '#F5E7E7', dark: '#B67D87', finish: 'natural' }),
  sand: make('sand', { name: 'Sand', note: 'Desert light', light: '#F3E9D4', dark: '#C8AC82', finish: 'natural' }),
  coral: make('coral', { name: 'Coral', note: 'Warm sunset', light: '#F7E6DA', dark: '#D58A6C', finish: 'natural', lastMove: 'rgba(255, 220, 90, 0.42)' }),
  olive: make('olive', { name: 'Olive', note: 'Muted green', light: '#EDECD6', dark: '#8A8D58', finish: 'natural', lastMove: 'rgba(255, 228, 70, 0.42)', selected: 'rgba(30, 30, 5, 0.24)' }),
  sky: make('sky', { name: 'Sky', note: 'Light blue', light: '#EEF5FC', dark: '#8DB4D8', finish: 'glass', lastMove: 'rgba(255, 214, 10, 0.4)' }),
  ruby: make('ruby', { name: 'Ruby', note: 'Deep red', light: '#F4E3E3', dark: '#A3465A', finish: 'glass', lastMove: 'rgba(255, 210, 90, 0.42)', selected: 'rgba(40, 0, 10, 0.26)' }),
  mint: make('mint', { name: 'Mint', note: 'Fresh green', light: '#EAF6F0', dark: '#7EBFA0', finish: 'glass' }),
  teal: make('teal', { name: 'Teal', note: 'Lagoon', light: '#DDEEEE', dark: '#3F8A8C', finish: 'glass', lastMove: 'rgba(255, 230, 110, 0.42)', selected: 'rgba(0, 30, 30, 0.26)' }),
  sakura: make('sakura', { name: 'Sakura', note: 'Cherry blossom', light: '#FBF0F3', dark: '#DFA3B4', finish: 'natural' }),
  coffee: make('coffee', { name: 'Coffee', note: 'Roasted brown', light: '#E8D6C2', dark: '#7A5840', finish: 'natural', lastMove: 'rgba(255, 214, 80, 0.4)', selected: 'rgba(40, 20, 0, 0.28)', hint: 'rgba(40, 20, 0, 0.32)', frame: 'rgba(255, 240, 220, 0.4)' }),
  charcoal: make('charcoal', {
    name: 'Charcoal',
    note: 'Low light',
    light: '#9EA1A8',
    dark: '#3B3D43',
    lastMove: 'rgba(255, 214, 10, 0.3)',
    selected: 'rgba(255, 255, 255, 0.24)',
    hint: 'rgba(5, 5, 8, 0.42)',
    arrow: 'rgba(255, 255, 255, 0.72)',
    frame: 'rgba(255, 255, 255, 0.14)',
  }),
  sandstone: make('sandstone', { name: 'Sandstone', note: 'Brown on sand', light: '#EBECD0', dark: '#B68860', finish: 'natural', lastMove: 'rgba(255, 214, 10, 0.4)', selected: 'rgba(40, 20, 0, 0.24)' }),
  honey: make('honey', { name: 'Honey', note: 'Brown on yellow', light: '#F4EEAA', dark: '#AF7C59', finish: 'natural', lastMove: 'rgba(90, 170, 255, 0.34)', selected: 'rgba(40, 20, 0, 0.24)' }),
  apricot: make('apricot', { name: 'Apricot', note: 'Soft peach', light: '#F4EEAA', dark: '#D29B75', finish: 'natural', lastMove: 'rgba(90, 170, 255, 0.34)', selected: 'rgba(40, 20, 0, 0.22)' }),
};

export const boardThemeList: BoardTheme[] = BOARD_THEMES.map((id) => boardThemes[id]);
export const DEFAULT_BOARD_THEME: BoardThemeId = 'graphite';
