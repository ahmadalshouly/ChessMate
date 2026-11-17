import { PIECE_SETS, type PieceSet } from '@chessmate/core';
import type { ImageSourcePropType } from 'react-native';

import { PIECE_IMAGES, type PieceCode } from './pieceImages';

export interface PieceSetInfo {
  id: PieceSet;
  name: string;
  note: string;
  /** Credit line shown in Settings > Board > Credits. */
  credit: string;
  license: string;
  licenseUrl: string;
  source: string;
}

/**
 * Piece sets offered in Settings. Every set is licensed for commercial use; artwork
 * sources and full licence texts are in apps/app/art/pieces (see its README).
 */
export const PIECE_SET_INFO: Record<PieceSet, PieceSetInfo> = {
  classic: {
    id: 'classic',
    name: 'Classic',
    note: 'Tournament style',
    credit: 'Chessnut by Alexis Luengas',
    license: 'Apache 2.0',
    licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
    source: 'https://github.com/LexLuengas/chessnut-pieces',
  },
  glass: {
    id: 'glass',
    name: 'Glass',
    note: 'Our signature',
    credit: 'ChessMate restyle of Chessnut by Alexis Luengas',
    license: 'Apache 2.0',
    licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
    source: 'https://github.com/LexLuengas/chessnut-pieces',
  },
  spatial: {
    id: 'spatial',
    name: 'Spatial',
    note: 'Sculpted, airy',
    credit: 'Spatial by Maurizio Monge',
    license: 'MIT',
    licenseUrl: 'https://github.com/maurimo/chess-art/blob/main/LICENSE',
    source: 'https://github.com/maurimo/chess-art',
  },
  celtic: {
    id: 'celtic',
    name: 'Celtic',
    note: 'Carved',
    credit: 'Celtic by Maurizio Monge',
    license: 'MIT',
    licenseUrl: 'https://github.com/maurimo/chess-art/blob/main/LICENSE',
    source: 'https://github.com/maurimo/chess-art',
  },
  fantasy: {
    id: 'fantasy',
    name: 'Fantasy',
    note: 'Ornate',
    credit: 'Fantasy by Maurizio Monge',
    license: 'MIT',
    licenseUrl: 'https://github.com/maurimo/chess-art/blob/main/LICENSE',
    source: 'https://github.com/maurimo/chess-art',
  },
  bold: {
    id: 'bold',
    name: 'Bold',
    note: 'Graphic, modern',
    credit: 'kiwen-suwi by neverRare',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://github.com/neverRare',
  },
  caramel: {
    id: 'caramel',
    name: 'Caramel',
    note: 'Warm, friendly',
    credit: 'Pieces by RhosGFX',
    license: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source: 'https://rhosgfx.itch.io/',
  },
  shapes: {
    id: 'shapes',
    name: 'Shapes',
    note: 'Abstract, for fun',
    credit: 'chess_shapes by flugsio',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    source: 'https://github.com/flugsio/chess_shapes',
  },
};

export const pieceSetList: PieceSetInfo[] = PIECE_SETS.map((id) => PIECE_SET_INFO[id]);

/** Image for one piece, e.g. pieceImage('glass', 'w', 'n'). */
export function pieceImage(set: PieceSet, color: 'w' | 'b', type: string): ImageSourcePropType {
  const images = PIECE_IMAGES[set] ?? PIECE_IMAGES.classic!;
  return images[`${color}${type.toUpperCase()}` as PieceCode];
}
