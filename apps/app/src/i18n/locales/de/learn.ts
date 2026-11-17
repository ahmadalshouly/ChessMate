import type { Messages } from '../../core';
import type { learn as en } from '../en/learn';

export const learn: Messages<typeof en> = {
  soon: {
    title: 'Lernen & Coach',
    blurb: 'Ein KI-Coach, der das Warum hinter jedem Zug erklärt, und Lektionen, die aufeinander aufbauen.',
    coach: 'KI-Coach',
    coachText: 'Frag zu jeder Stellung und erhalte eine verständliche Antwort.',
    review: 'Partieanalyse',
    reviewText: 'Engine-Bewertung, beste Züge und deine wichtigsten Fehler.',
    lessons: 'Lektionen',
    lessonsText: 'Eröffnungen, Mittelspielpläne und Endspieltechnik.',
    threats: 'Drohungstrainer',
    threatsText: 'Lerne zu erkennen, was dein Gegner droht.',
  },
};
