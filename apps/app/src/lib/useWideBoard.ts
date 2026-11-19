import { useWindowDimensions } from 'react-native';

/** Width at which a board screen puts its panel beside the board instead of under it. */
export const WIDE_BOARD_MIN = 900;

/**
 * Board size for screens with a board and a panel (review, analysis, game
 * history, puzzles). On wide screens (web, tablets) the board fills the height
 * with the panel beside it, like a live game; on phones it is as wide as the
 * screen with room below.
 *
 * - `panel`: width of the side panel on wide screens.
 * - `reserve`: height kept free besides the board (header, controls under it).
 * - `sidebar`: true on screens inside the tab shell, which shows a ~250px
 *   navigation sidebar on wide screens.
 */
export function useWideBoard({ panel = 400, reserve = 150, phoneReserve = 300, sidebar = false }: { panel?: number; reserve?: number; phoneReserve?: number; sidebar?: boolean } = {}) {
  const { width, height } = useWindowDimensions();
  const content = sidebar && width >= 960 ? width - 250 : width;
  const wide = content >= WIDE_BOARD_MIN;
  const raw = wide ? Math.min(height - reserve, content - panel - 72, 1000) : Math.min(content - 24, height - phoneReserve, 640);
  return { wide, size: Math.max(240, Math.floor(raw / 8) * 8), panel };
}
