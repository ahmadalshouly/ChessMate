import type { Messages } from '../../core';
import type { football as en } from '../en/football';

export const football: Messages<typeof en> = {
  title: 'Football Mate',
  hint: 'Wähle den Fußballverein, dem du die Daumen drückst. Sein Abzeichen steht neben deinem Namen im Profil und in Partien.',
  label: 'Dein Verein',
  notSet: 'Kein Verein',
  search: 'Vereine suchen',
  placeholder: 'Vereinsnamen eingeben',
  noResults: 'Kein Verein passt zu „{q}“.',
  supports: 'Fan von {club}',
  leagues: {
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
    egyptian: 'Ägyptische Premier League',
    mls: 'MLS',
    southAmerica: 'Südamerika',
    other: 'Andere',
  },
};
