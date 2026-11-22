import { useState } from 'react';
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
  // The panel gives way on narrower windows (down to 320px) so the board gets the room.
  const side = wide ? Math.max(320, Math.min(panel, Math.round(content * 0.3))) : panel;
  const raw = wide ? Math.min(height - reserve, content - side - 56, 1200) : Math.min(content - 24, height - phoneReserve, 640);
  return { wide, size: Math.max(240, Math.floor(raw / 8) * 8), panel: side };
}

/**
 * Height of the area a wide board screen fills, measured on layout. The side
 * panel gets it as an explicit height, so it scrolls on the web instead of
 * growing past the window and getting cut off.
 */
export function useFillHeight(): [number | undefined, (e: { nativeEvent: { layout: { height: number } } }) => void] {
  const [h, setH] = useState<number | undefined>(undefined);
  return [h, (e) => setH((prev) => (Math.abs((prev ?? 0) - e.nativeEvent.layout.height) > 1 ? e.nativeEvent.layout.height : prev))];
}
