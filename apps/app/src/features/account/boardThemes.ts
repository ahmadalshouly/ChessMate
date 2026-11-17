import { useSettings } from './settingsStore';

/** Board look from the user's settings: piece set and the board toggles. Colours come from `useBoardTheme()`. */
export function useBoardAppearance() {
  const { board } = useSettings();
  return { pieces: board.pieces, coordinates: board.coordinates, highlightLastMove: board.highlightLastMove, showLegalMoves: board.showLegalMoves };
}
