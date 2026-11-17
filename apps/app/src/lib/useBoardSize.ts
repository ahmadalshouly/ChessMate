import { useWindowDimensions } from 'react-native';

export function useBoardSize(reserveHeight = 260) {
  const { width, height } = useWindowDimensions();
  const s = Math.min(width - 24, height - reserveHeight, 640);
  return Math.max(240, Math.floor(s / 8) * 8);
}
