# Languages (English, Arabic, German)

Every piece of text a player sees comes from a dictionary. English is the source of truth; Arabic and German must have exactly the same keys, which `pnpm typecheck` and `pnpm test` enforce (placeholders included).

```
src/i18n/
  core.ts            plural rules, interpolation, lookup (no React)
  store.ts           chosen language, device language, RTL switch
  index.ts           useT(), translate(), formatDate/Number/Ago, dirIcon()
  chess.ts           chess vocabulary built at runtime (pieces, threats, move feedback, board themes)
  serverMessages.ts  maps English server errors to keys
  notifications.ts   maps server notification text to keys
  locales/{en,ar,de}/<feature>.ts
```

## Adding text to a screen

1. Add the English string to the feature file in `locales/en/` (for example `locales/en/play.ts`). Create a new file for a new feature and add it to `locales/en/index.ts`.
2. Add the same key to `locales/ar/` and `locales/de/`. The type checker tells you which keys are missing. If you can't translate yet, copy the English: it still type-checks, and it is easy to find later.
3. Use it:

```tsx
import { useT } from '@/i18n';

const tr = useT(); // `tr`, because `t` is the theme in most screens
<Text>{tr('play.lobby.findGame')}</Text>
<Text>{tr('games.moveCount', { count: 12 })}</Text>
```

- **Parameters:** `{name}` in the string, `tr('key', { name })`.
- **Plurals:** use an object, `{ one: '{count} move', other: '{count} moves' }`, and pass `count`. Arabic can add `zero`, `two`, `few` and `many`; German uses `one` and `other`.
- **Outside components** (callbacks, module helpers): `translate('key')`. It does not re-render on a language change, so prefer `useT()` in components.
- **Ids from data** (puzzle themes, report reasons): `translateOr(\`puzzleThemes.themes.${id}\`, fallback)`.
- **Dates and numbers:** `formatDate`, `formatDateTime`, `formatNumber`, `formatAgo` from `@/i18n`. Arabic keeps Western digits (ratings and clocks read better that way).
- Don't build sentences from pieces (`'You ' + verb`): word order differs. Make one string with parameters.
- Brand names, move notation (Nf3, e4), FEN and PGN stay as they are.

## Right-to-left (Arabic)

- Layout mirrors automatically: rows flip, `marginStart`/`paddingEnd` follow the language. Use `start`/`end` instead of `left`/`right` for spacing.
- The chessboard never mirrors. Board squares, pieces and move badges are placed with `placeAt` (`src/components/boardLayout.ts`), and engine arrows are SVG, because `left` flips in Arabic and `direction: 'ltr'` is not honoured the same way on every platform, while touches are never flipped. Eval graphs and move navigation set `direction: 'ltr'` (inline, since `StyleSheet.create` rejects it on the web). Do the same for anything with a fixed left-to-right meaning (a timeline, a1 to h8).
- Arrows that mean "forward" use `dirIcon('arrow-forward')`, which points left in Arabic.
- On native, switching between Arabic and another language restarts the app once (React Native applies direction at launch). Settings says so before you switch.

## Fonts

Montserrat and Geist have no Arabic letters. In Arabic, `@/ui/primitives` and `<Text variant>` swap Sans and Display for **IBM Plex Sans Arabic** at the same weight and clear letter spacing (tracking breaks Arabic joins). Geist Mono stays for clocks and ratings. Nothing to do per screen: use the `Text` from `@/ui` or `@/ui/primitives` and it works.

## The AI coach

`lib/coachApi.ts` sends the current language; the server asks the model to answer in it (`coachLanguageNote` in `packages/core/src/review.ts`).

## Not translated (on purpose)

- `/admin` (the staff console) is translated like the rest of the app (`admin` namespace). `/design` (component gallery) is internal and stays English.
- Push notifications sent while the app is closed are written by the server in English. The in-app inbox shows them translated.
