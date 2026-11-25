/**
 * How a computer opponent likes to play. The style decides which openings it
 * goes for (see repertoire.ts); its strength comes from its rating alone.
 *
 * - balanced:   a bit of everything, mainline openings with both colours
 * - aggressive: open games and sharp lines (Sicilian, King's Indian, early attacks)
 * - solid:      safe structures and few risks (Queen's Gambit, Caro-Kann, London)
 * - positional: slow manoeuvring games (English, Catalan, French, Nimzo-Indian)
 * - gambit:     gives material early for the initiative (King's Gambit, Evans, Benko)
 */
export const BOT_STYLES = ['balanced', 'aggressive', 'solid', 'positional', 'gambit'] as const;

export type BotStyle = (typeof BOT_STYLES)[number];
