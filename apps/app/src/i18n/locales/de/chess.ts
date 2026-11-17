import type { Messages } from '../../core';
import type { chess as en } from '../en/chess';

export const chess: Messages<typeof en> = {
  piece: {
    p: 'Bauer',
    n: 'Springer',
    b: 'Läufer',
    r: 'Turm',
    q: 'Dame',
    k: 'König',
    any: 'Figur',
  },
  threat: {
    mate: 'Matt mit {san}',
    check: 'Schach mit {san}',
    capture: '{san} gewinnt Material ({piece})',
    fork: '{san} mit Gabel auf {pieces}',
  },
  listSep: ', ',
  listAnd: ' und ',
};
