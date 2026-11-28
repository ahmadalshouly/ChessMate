/**
 * Football Mate: players pick the football club they support, and a small club
 * badge shows next to their name (profile, games, player cards).
 *
 * Logos come from TheSportsDB: the game server looks each club up and serves the URLs
 * (apps/server/src/football/logos.ts), and the app draws them (apps/app/src/features/football).
 * A club without a logo, or whose logo fails to load, gets an original shield drawn from
 * its colours and short name. `logo` pins a URL for one club and wins over the lookup.
 */

export interface FootballClub {
  /** Stable id, stored on the profile. Never rename one. */
  id: string;
  /** Club name as commonly written in English. */
  name: string;
  /** Up to 4 letters, drawn on the badge. */
  short: string;
  /** ISO 3166-1 alpha-2 (GB-ENG style subdivisions are folded into GB). */
  country: string;
  league: FootballLeague;
  /** Badge colours: field, then trim. Hex, #rrggbb. */
  colors: readonly [primary: string, secondary: string];
  /** Fixed logo URL for this club, used instead of the server's lookup. Usually empty. */
  logo?: string;
}

export const FOOTBALL_LEAGUES = [
  'premierLeague',
  'laLiga',
  'serieA',
  'bundesliga',
  'ligue1',
  'eredivisie',
  'primeiraLiga',
  'scottish',
  'superLig',
  'saudiPro',
  'egyptian',
  'mls',
  'southAmerica',
  'other',
] as const;
export type FootballLeague = (typeof FOOTBALL_LEAGUES)[number];

/** English names; the app translates them under `football.leagues`. */
export const FOOTBALL_LEAGUE_LABELS: Record<FootballLeague, string> = {
  premierLeague: 'Premier League',
  laLiga: 'La Liga',
  serieA: 'Serie A',
  bundesliga: 'Bundesliga',
  ligue1: 'Ligue 1',
  eredivisie: 'Eredivisie',
  primeiraLiga: 'Primeira Liga',
  scottish: 'Scottish Premiership',
  superLig: 'Süper Lig',
  saudiPro: 'Saudi Pro League',
  egyptian: 'Egyptian Premier League',
  mls: 'MLS',
  southAmerica: 'South America',
  other: 'Other',
};

const club = (id: string, name: string, short: string, country: string, league: FootballLeague, primary: string, secondary: string): FootballClub => ({
  id,
  name,
  short,
  country,
  league,
  colors: [primary, secondary],
});

/** The most widely followed clubs, grouped by league. Order within a league is by following. */
export const FOOTBALL_CLUBS: readonly FootballClub[] = [
  // England
  club('man-utd', 'Manchester United', 'MUN', 'GB', 'premierLeague', '#DA291C', '#FBE122'),
  club('liverpool', 'Liverpool', 'LIV', 'GB', 'premierLeague', '#C8102E', '#F6EB61'),
  club('man-city', 'Manchester City', 'MCI', 'GB', 'premierLeague', '#6CABDD', '#1C2C5B'),
  club('arsenal', 'Arsenal', 'ARS', 'GB', 'premierLeague', '#EF0107', '#FFFFFF'),
  club('chelsea', 'Chelsea', 'CHE', 'GB', 'premierLeague', '#034694', '#FFFFFF'),
  club('tottenham', 'Tottenham Hotspur', 'TOT', 'GB', 'premierLeague', '#FFFFFF', '#132257'),
  club('newcastle', 'Newcastle United', 'NEW', 'GB', 'premierLeague', '#241F20', '#FFFFFF'),
  club('aston-villa', 'Aston Villa', 'AVL', 'GB', 'premierLeague', '#670E36', '#95BFE5'),
  club('west-ham', 'West Ham United', 'WHU', 'GB', 'premierLeague', '#7A263A', '#1BB1E7'),
  club('everton', 'Everton', 'EVE', 'GB', 'premierLeague', '#003399', '#FFFFFF'),
  // Spain
  club('real-madrid', 'Real Madrid', 'RMA', 'ES', 'laLiga', '#FFFFFF', '#FEBE10'),
  club('barcelona', 'FC Barcelona', 'BAR', 'ES', 'laLiga', '#A50044', '#004D98'),
  club('atletico-madrid', 'Atlético Madrid', 'ATM', 'ES', 'laLiga', '#CB3524', '#FFFFFF'),
  club('sevilla', 'Sevilla', 'SEV', 'ES', 'laLiga', '#FFFFFF', '#D71920'),
  club('valencia', 'Valencia', 'VAL', 'ES', 'laLiga', '#FFFFFF', '#EE3524'),
  club('real-betis', 'Real Betis', 'BET', 'ES', 'laLiga', '#00954C', '#FFFFFF'),
  club('athletic-club', 'Athletic Club', 'ATH', 'ES', 'laLiga', '#EE2523', '#FFFFFF'),
  club('real-sociedad', 'Real Sociedad', 'RSO', 'ES', 'laLiga', '#0067B1', '#FFFFFF'),
  // Italy
  club('juventus', 'Juventus', 'JUV', 'IT', 'serieA', '#000000', '#FFFFFF'),
  club('ac-milan', 'AC Milan', 'MIL', 'IT', 'serieA', '#FB090B', '#000000'),
  club('inter', 'Inter Milan', 'INT', 'IT', 'serieA', '#010E80', '#000000'),
  club('roma', 'AS Roma', 'ROM', 'IT', 'serieA', '#8E1F2F', '#F0BC42'),
  club('napoli', 'Napoli', 'NAP', 'IT', 'serieA', '#12A0D7', '#FFFFFF'),
  club('lazio', 'Lazio', 'LAZ', 'IT', 'serieA', '#87D8F7', '#FFFFFF'),
  club('fiorentina', 'Fiorentina', 'FIO', 'IT', 'serieA', '#482E92', '#FFFFFF'),
  // Germany
  club('bayern', 'Bayern Munich', 'FCB', 'DE', 'bundesliga', '#DC052D', '#FFFFFF'),
  club('dortmund', 'Borussia Dortmund', 'BVB', 'DE', 'bundesliga', '#FDE100', '#000000'),
  club('leverkusen', 'Bayer Leverkusen', 'B04', 'DE', 'bundesliga', '#E32221', '#000000'),
  club('schalke', 'Schalke 04', 'S04', 'DE', 'bundesliga', '#004D9D', '#FFFFFF'),
  club('leipzig', 'RB Leipzig', 'RBL', 'DE', 'bundesliga', '#FFFFFF', '#DD0741'),
  club('gladbach', 'Borussia Mönchengladbach', 'BMG', 'DE', 'bundesliga', '#000000', '#00B050'),
  club('frankfurt', 'Eintracht Frankfurt', 'SGE', 'DE', 'bundesliga', '#E1000F', '#000000'),
  club('hamburg', 'Hamburger SV', 'HSV', 'DE', 'bundesliga', '#0A3F86', '#FFFFFF'),
  // France
  club('psg', 'Paris Saint-Germain', 'PSG', 'FR', 'ligue1', '#004170', '#DA291C'),
  club('marseille', 'Olympique de Marseille', 'OM', 'FR', 'ligue1', '#FFFFFF', '#2FAEE0'),
  club('lyon', 'Olympique Lyonnais', 'OL', 'FR', 'ligue1', '#FFFFFF', '#14387F'),
  club('monaco', 'AS Monaco', 'ASM', 'FR', 'ligue1', '#E51B22', '#FFFFFF'),
  club('lille', 'Lille', 'LOSC', 'FR', 'ligue1', '#E01E13', '#20325F'),
  // Netherlands, Portugal, Scotland, Türkiye
  club('ajax', 'Ajax', 'AJX', 'NL', 'eredivisie', '#FFFFFF', '#D2122E'),
  club('psv', 'PSV Eindhoven', 'PSV', 'NL', 'eredivisie', '#ED1C24', '#FFFFFF'),
  club('feyenoord', 'Feyenoord', 'FEY', 'NL', 'eredivisie', '#FF0000', '#FFFFFF'),
  club('benfica', 'Benfica', 'SLB', 'PT', 'primeiraLiga', '#E30613', '#FFFFFF'),
  club('porto', 'FC Porto', 'FCP', 'PT', 'primeiraLiga', '#003893', '#FFFFFF'),
  club('sporting', 'Sporting CP', 'SCP', 'PT', 'primeiraLiga', '#008057', '#FFFFFF'),
  club('celtic', 'Celtic', 'CEL', 'GB', 'scottish', '#018749', '#FFFFFF'),
  club('rangers', 'Rangers', 'RAN', 'GB', 'scottish', '#1B458F', '#FFFFFF'),
  club('galatasaray', 'Galatasaray', 'GAL', 'TR', 'superLig', '#A90432', '#FDB912'),
  club('fenerbahce', 'Fenerbahçe', 'FEN', 'TR', 'superLig', '#163962', '#FFED00'),
  club('besiktas', 'Beşiktaş', 'BJK', 'TR', 'superLig', '#000000', '#FFFFFF'),
  // Saudi Arabia, Egypt
  club('al-hilal', 'Al Hilal', 'HIL', 'SA', 'saudiPro', '#0055A5', '#FFFFFF'),
  club('al-nassr', 'Al Nassr', 'NSR', 'SA', 'saudiPro', '#FFE500', '#1D3E8F'),
  club('al-ittihad', 'Al Ittihad', 'ITT', 'SA', 'saudiPro', '#FFDD00', '#000000'),
  club('al-ahli-sa', 'Al Ahli', 'AHL', 'SA', 'saudiPro', '#00843D', '#FFFFFF'),
  club('al-ahly', 'Al Ahly', 'AHY', 'EG', 'egyptian', '#D2232A', '#FFFFFF'),
  club('zamalek', 'Zamalek', 'ZAM', 'EG', 'egyptian', '#FFFFFF', '#E30613'),
  // Americas
  club('inter-miami', 'Inter Miami', 'MIA', 'US', 'mls', '#F7B5CD', '#231F20'),
  club('la-galaxy', 'LA Galaxy', 'LAG', 'US', 'mls', '#00245D', '#FFD200'),
  club('boca-juniors', 'Boca Juniors', 'BOC', 'AR', 'southAmerica', '#103F79', '#F3B229'),
  club('river-plate', 'River Plate', 'RIV', 'AR', 'southAmerica', '#FFFFFF', '#E30613'),
  club('flamengo', 'Flamengo', 'FLA', 'BR', 'southAmerica', '#C4161C', '#000000'),
  club('corinthians', 'Corinthians', 'COR', 'BR', 'southAmerica', '#FFFFFF', '#000000'),
  club('palmeiras', 'Palmeiras', 'PAL', 'BR', 'southAmerica', '#006437', '#FFFFFF'),
  club('santos', 'Santos', 'SAN', 'BR', 'southAmerica', '#FFFFFF', '#000000'),
];

const BY_ID = new Map(FOOTBALL_CLUBS.map((c) => [c.id, c]));

export function footballClub(id: string | null | undefined): FootballClub | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

export function isFootballClubId(v: unknown): v is string {
  return typeof v === 'string' && BY_ID.has(v);
}

/** Case- and accent-insensitive search over name, short name and id. Empty query returns every club. */
export function searchFootballClubs(query: string): FootballClub[] {
  const q = fold(query.trim());
  if (!q) return [...FOOTBALL_CLUBS];
  return FOOTBALL_CLUBS.filter((c) => fold(c.name).includes(q) || fold(c.short) === q || c.id.includes(q.replace(/\s+/g, '-')));
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Text colour that reads on a badge field: dark ink on light fields, white on dark ones
 * (WCAG relative luminance).
 */
export function badgeInk(hex: string): '#111111' | '#FFFFFF' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#111111';
  const n = parseInt(m[1]!, 16);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // Pick whichever of the two inks has the higher contrast ratio.
  return (l + 0.05) / (0.0056 + 0.05) > 1.05 / (l + 0.05) ? '#111111' : '#FFFFFF';
}
