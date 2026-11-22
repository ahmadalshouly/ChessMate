import { useWindowDimensions } from 'react-native';

export function useBoardSize(reserveHeight = 260) {
  const { width, height } = useWindowDimensions();
  // Phones: the screen's width; wide windows (web, tablets): as tall as the window allows.
  const s = Math.min(width - 24, height - reserveHeight, width >= 900 ? 1000 : 640);
  return Math.max(240, Math.floor(s / 8) * 8);
}
