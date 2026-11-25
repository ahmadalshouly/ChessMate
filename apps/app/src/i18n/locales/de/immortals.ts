import type { Messages } from '../../core';
import type { immortals as en } from '../en/immortals';

export const immortals: Messages<typeof en> = {
  title: 'Unsterbliche',
  overline: 'Ruhmeshalle',
  subtitle: 'Die größten Partien aller Zeiten und die Legenden, die sie gespielt haben.',
  stats: '{players} Legenden · {games} Partien',
  englishOnly: 'Geschichten und Anmerkungen sind vorerst auf Englisch.',
  ofTheDay: 'Unsterbliche Partie des Tages',
  replay: 'Partie nachspielen',
  legends: 'Legenden',
  games: 'Unsterbliche Partien',
  gameCount: { one: '{count} Partie', other: '{count} Partien' },
  champion: 'Weltmeister',
  worldChampion: 'Weltmeister {years}',
  bornIn: 'Geboren {year}, {place}',
  lifespan: '{born}–{died}',
  alive: 'Geboren {born}',
  all: 'Alle',
  theme: {
    sacrifice: 'Opfer',
    attack: 'Angriffe',
    kingHunt: 'Königsjagden',
    strategy: 'Strategie',
    titleMatch: 'WM-Kämpfe',
    prodigy: 'Wunderkinder',
  },
  outcome: {
    win: 'Gewonnen',
    loss: 'Verloren',
    draw: 'Remis',
  },
  player: {
    games: 'Berühmte Partien',
    notFound: 'Diese Legende ist nicht in der Sammlung.',
    back: 'Alle Legenden',
  },
  game: {
    notFound: 'Diese Partie ist nicht in der Sammlung.',
    back: 'Alle unsterblichen Partien',
    story: 'Die Geschichte',
    moments: 'Schlüsselmomente',
    moment: 'Schlüsselmoment',
    round: 'Runde {round}',
    openAnalysis: 'Im Analysebrett öffnen',
    legends: 'Legenden in dieser Partie',
  },
  learnCard: {
    title: 'Unsterbliche',
    body: 'Spiel die berühmtesten Partien der Geschichte nach, von Anderssens Unsterblicher Partie bis zu Carlsen mit 13.',
    open: 'Zu den Unsterblichen',
  },
};
