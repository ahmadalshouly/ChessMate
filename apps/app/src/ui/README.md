# ChessMate UI kit

Black and white, casual but professional, Liquid Glass. Three type voices: Montserrat (from the logo) for titles, Geist for reading, Geist Mono for anything that counts. Everything a screen needs comes from one import:

```tsx
import { Screen, Card, Button, Text, useAppTheme } from '@/ui';
```

Open **/design** in the running app (web: `http://localhost:8081/design`) for a live gallery of every component in light and dark.

## Rules

1. **No raw colours, sizes or fonts in screens.** Read tokens from `useAppTheme()` (`colors`, `space`, `radii`, `typography`, `shadows`) or use a component.
2. **Monochrome first.** Black/white/grey for UI. Colour only carries meaning: `success`, `warning`, `danger`, `live`, and the board.
3. **One primary button per view.** Use `secondary` (glass) for most actions, `ghost` for tertiary, `danger` for resign/delete.
4. **Use `<Text>` from `@/ui`**, not React Native's, so type and colour follow the theme.
5. **Glass needs something behind it.** Put screens in `<Screen>` (gradient + soft glow). Inside long lists use `flat` glass to skip blur for performance.
6. **Touch targets are at least 44 px** (`layout.hitSize`). `IconButton` adds hit slop for you.

## Setup

`UIProvider` (theme + toasts) is mounted once in `src/app/_layout.tsx`. Nothing else to do.

Appearance (`system` / `light` / `dark`) and board theme are stored in `localStorage` on web and in memory on native. To persist them to the account or device, pass a storage adapter:

```tsx
<UIProvider storage={{ load: () => api.getAppearance(), save: (s) => api.saveAppearance(s) }}>
```

## Tokens

| Token | Values |
| --- | --- |
| `space` | `none 0, xxs 2, xs 4, sm 8, md 12, lg 16, xl 20, xxl 24, xxxl 32, huge 48, giant 64` |
| `radii` | `xs 6, sm 10, md 14, lg 22, xl 30, pill 999` |
| `typography` | `display, title, heading` (Montserrat), `subheading, body, bodyStrong, label, caption` (Geist), `overline, numeric, figure, clock, mono` (Geist Mono) |
| `fonts` | Family names for hand-styled text. Screens that use React Native's `Text`/`TextInput` should import them from `@/ui/primitives` instead, which maps `fontWeight` to the bundled families. |
| `blur` | `subtle 20, regular 40, strong 70` (BlurView intensity) |
| `shadows` | `none, sm, md, lg` |
| `layout` | `maxContentWidth 720, maxWideWidth 1200, hitSize 44` |

Colour tokens (`useColors()`): `bg, bgGradient, surface, surfaceStrong, surfaceSubtle, surfaceSolid, surfaceSunken, surfacePressed, glassBorder, glassHighlight, text, muted, textTertiary, textInverse, accent, onAccent, border, borderStrong, focusRing, overlay, success(+Soft), warning(+Soft), danger(+Soft), onDanger, live, skeleton, skeletonHighlight`.

Older code that uses `useTheme()` from `@/constants/theme` and `Screen/Card/Button/Label` from `@/components/ui` keeps working; those files now forward to this kit and follow the user's appearance setting. Prefer `@/ui` in new code.

## Hooks

| Hook | Returns |
| --- | --- |
| `useAppTheme()` | Full theme: `scheme, colors, space, radii, typography, shadows, blur, motion, layout, fonts` |
| `useColors()` | Colour tokens only |
| `useThemePreference()` | `{ preference, setPreference, toggleScheme, scheme }` |
| `useBoardTheme()` | `{ boardTheme, setBoardTheme }` |
| `useToast()` | `{ show(options), hide(id) }` |

## Components

### Layout
```tsx
<Screen scroll width="content" gap="lg">        {/* gradient page, readable column, bottom safe area */}
  <SectionHeader index={1} title="Recent games" action={<Button title="See all" variant="ghost" size="sm" />} />
  <Stack gap="md">…</Stack>                       {/* vertical */}
  <Row gap="sm" justify="space-between">…</Row>   {/* horizontal */}
  <Divider />  <Spacer />  <Spacer size="lg" />
</Screen>
```
`Screen` props: `scroll`, `padding` (default `lg`), `gap`, `width` (`content` 720 / `wide` 1200 / `full`), `edges` (safe-area edges, default `['bottom']`). Use `<Backdrop />` alone behind a custom layout.

### Glass and cards
```tsx
<GlassView strength="regular" radius="lg" padding="lg">…</GlassView>   {/* the primitive */}
<Card title="Play online" subtitle="Rated" headerRight={<Badge label="1520" />} onPress={open}>…</Card>
```

### Liquid Glass

Glass comes in three kinds (`<GlassView kind=…>`):

| Kind | Use | iOS 26+ | Everywhere else |
| --- | --- | --- | --- |
| `panel` (default) | Content cards, lists | Hand-drawn glass | Hand-drawn glass |
| `chrome` | Floating navigation: tab bar, header capsule, sidebar, sheets, menus | Native Liquid Glass | Hand-drawn glass, `chrome` tint |
| `control` | Glass buttons, icon buttons | Native Liquid Glass, reacts to touch | Hand-drawn glass, `chrome` tint |

Hand-drawn glass = backdrop blur with extra saturation, a thin tint, a top sheen and a **specular rim** (`rimShadow(c)`: a bright inset line along the top, a softer one along the bottom) instead of a heavy outline. Use `rimShadow` on any hand-built surface (chips, selected rows, clock pills) so it matches. Selected items inside glass sit on a `glassSelected` lens. Floating chrome lifts off the page with `shadows.float`, a box shadow that is not clipped by the glass's `overflow: hidden`.

Pressables that should feel like glass under the finger use `<PressableScale scaleTo={0.95}>` (Reanimated spring on the UI thread). `Button`, `IconButton`, `Chip`, `Card onPress` and the tab bar already do.

Performance: content panels never use native Liquid Glass, and the board's squares and pieces are never glass. For long lists pass `flat` to skip the blur. *Reduce Transparency* turns every glass layer into a solid `surfaceSolid` fill.

Inside the app shell the shell draws the one page backdrop; `<Screen>` detects this (`BackdropContext`) and leaves its own background off, so the page runs unbroken under the header and tab bar.

Android has no backdrop blur, and it draws `elevation` as a solid shadow that shows through translucent fills as a grey slab. So on Android the glass tokens (`surface`, `surfaceStrong`, `surfaceSubtle`) are near-opaque and the `sm`/`md` shadows have no elevation (see `androidGlass` in `theme/tokens.ts`). Use the tokens rather than hand-written `rgba(...)` fills and the panels stay readable over the board on every platform.

### Text
```tsx
<Text variant="title">Play</Text>
<Text tone="muted">Subtitle</Text>        {/* tones: default muted tertiary inverse accent success warning danger */}
<Text variant="clock">04:59</Text>        {/* tabular digits for clocks and ratings */}
```

### Buttons
```tsx
<Button title="Play" onPress={play} />                           {/* primary */}
<Button title="Analyse" variant="secondary" size="sm" />
<Button title="Resign" variant="danger" loading={busy} fullWidth />
<IconButton accessibilityLabel="Flip board" icon={<Ionicons name="swap-vertical" size={18} color={c.text} />} />
```

### Inputs
```tsx
<TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
<TextField label="Password" password value={pw} onChangeText={setPw} error={error} helper="At least 8 characters" />
<Chip label="5+0" selected={tc === '5+0'} onPress={() => setTc('5+0')} />
<Switch value={on} onValueChange={setOn} />
```

### Modal and sheet
```tsx
<Modal visible={open} onClose={close} title="Resign this game?" description="Your opponent wins."
  presentation="dialog" /* or "sheet" */
  actions={<><Button variant="ghost" title="Cancel" onPress={close} /><Button variant="danger" title="Resign" onPress={resign} /></>} />
```

### Toasts
```tsx
const toast = useToast();
toast.show({ title: 'Game saved', tone: 'success' });
toast.show({ title: 'Connection lost', message: 'Reconnecting…', tone: 'danger', duration: 0, action: { label: 'Retry', onPress: retry } });
```

### Avatars and badges
```tsx
<Avatar name="Nora Lind" uri={photo} size={40} status="online" />   {/* online | playing | away | offline */}
<Badge label="1520" />  <Badge tone="live" label="Live" />  <Badge tone="danger" label={3} />
```
Badge tones: `neutral, solid, outline, success, warning, danger, live`.

### Tabs
```tsx
<Tabs items={[{ key: 'games', label: 'Games', count: 12 }, { key: 'stats', label: 'Stats' }]} value={tab} onChange={setTab} />
<Tabs variant="underline" items={…} value={…} onChange={…} />
```

### Lists
```tsx
<ListGroup>
  <ListRow left={<Avatar name="Leo" />} title="Leo Park" subtitle="Blitz 1874" right={<Badge label="Live" tone="live" />} onPress={open} />
  <ListRow title="Language" right="English" chevron onPress={pick} />
  <ListRow title="Sign out" destructive onPress={signOut} />
</ListGroup>
```

### Loading
```tsx
<Skeleton width={120} height={14} />  <SkeletonText lines={3} />  <SkeletonRow />
```

## Board themes

`boardThemes`: 16 themes keyed by the ids in `BOARD_THEMES` (@chessmate/core), `graphite` is the default. Each has square colours, a `finish` (`flat`, `glass` sheen, or `natural` per-square tone variation), coordinates and overlay colours (`lastMove, selected, check, threat, hint, arrow`).

The theme and piece set live in the player's settings (`board.theme`, `board.pieces`), saved to their account when signed in and on the device otherwise. `<Board>` uses both automatically; pass `theme={boardThemes.slate}` or `pieces="glass"` to override for previews. The full picker with live preview is `<BoardCustomizer />` (`src/features/board`), used in Settings; `<BoardThemePicker />` and `<BoardThemeSwatch theme={…} />` remain for compact pickers. Change settings from anywhere with `updateSettings(patch)` from `src/features/account/settingsStore`.
