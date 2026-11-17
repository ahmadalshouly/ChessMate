import type { Messages } from '../../core';
import type { feedback as en } from '../en/feedback';

export const feedback: Messages<typeof en> = {
  best: '{san} ist die erste Wahl der Engine.',
  forced: '{san} war der einzige legale Zug.',
  book: '{san} ist ein bekannter Eröffnungszug.',
  solid: '{san} ist solide. {best} war etwas stärker.',
  allows: 'Das erlaubt {threat}.',
  undefended: 'Deine Figur auf {square} ({piece}) bleibt ungedeckt.',
  bad: '{san} ist {cls}.{reason} Besser war {best}.',
  masterpiece: '{san}!!! Ein Meisterwerk: Die Dame wird angeboten, und die Engine bestätigt es.',
  brilliant: '{san}!! Ein korrektes Opfer. Das Material kommt mit Zinsen zurück.',
  great: '{san}! Der einzige Zug, der den Vorteil hält. Alles andere war klar schlechter.',
  miss: '{san} verpasst eine Chance nach dem Fehler deines Gegners. {best} hätte ihn bestraft.',
};
