import type { ViewStyle } from 'react-native';

/**
 * Container style for `placeAt` children: absolutely positioned children with no insets
 * sit at the centre of a centring parent.
 */
export const PLACE_ORIGIN: ViewStyle = { alignItems: 'center', justifyContent: 'center' };

/**
 * Puts a `w`×`h` box with its top-left corner at (`x`, `y`) inside a `boxW`×`boxH` parent
 * styled with `PLACE_ORIGIN`, the same way in every language.
 *
 * Boards, arrows and badges never mirror. Positioning them with `left` is not enough: in
 * Arabic, React Native treats `left` as the start edge (the right), and whether a
 * container's `direction: 'ltr'` overrides that depends on the platform. Touches are
 * always reported unmirrored, so a mirrored board moved the wrong piece. The centre of a
 * box is the same in both directions and transforms are never mirrored, so this places
 * the box from the centre with a translate.
 */
export function placeAt(x: number, y: number, w: number, h: number, boxW: number, boxH: number = boxW): ViewStyle {
  return {
    position: 'absolute',
    width: w,
    height: h,
    transform: [{ translateX: x + w / 2 - boxW / 2 }, { translateY: y + h / 2 - boxH / 2 }],
  };
}
