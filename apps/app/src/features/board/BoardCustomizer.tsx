import type { PieceSet } from '@chessmate/core';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Board } from '@/components/Board';
import { useSettings } from '@/features/account/settingsStore';
import { Tabs, Text, boardThemeList, useAppTheme, type BoardTheme, type BoardThemeId } from '@/ui';

import { pieceImage, pieceSetList, PIECE_SET_INFO } from './pieceSets';

// Italian Game with the bishop picked up: shows pieces, last move, selection and move dots at once.
const PREVIEW = {
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
  lastMove: { from: 'b8', to: 'c6' } as const,
  selected: 'f1' as const,
  targets: ['e2', 'd3', 'c4', 'b5', 'a6'] as const,
};

type Section = 'board' | 'pieces';

/**
 * Board and piece picker with a live preview. Choices apply instantly to every board
 * in the app and are saved through `onChange` (the settings screen saves them to the account).
 */
export function BoardCustomizer({ onChange }: { onChange: (patch: { theme?: BoardThemeId; pieces?: PieceSet }) => void }) {
  const t = useAppTheme();
  const c = t.colors;
  const { board } = useSettings();
  const [section, setSection] = useState<Section>('board');
  const [width, setWidth] = useState(0);
  const [credits, setCredits] = useState(false);
  const theme = boardThemeList.find((b) => b.id === board.theme) ?? boardThemeList[0]!;
  const set = PIECE_SET_INFO[board.pieces];
  const previewSize = Math.min(Math.floor(width), 420);
  const columns = width >= 640 ? 6 : width >= 520 ? 5 : width >= 380 ? 4 : 3;
  const gap = 10;
  const tile = width > 0 ? Math.floor((width - gap * (columns - 1)) / columns) : 0;

  return (
    <View style={{ gap: 14 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <View style={[styles.stage, { borderColor: c.glassBorder, borderRadius: t.radii.lg }]}>
          <LinearGradient
            colors={c.scheme === 'dark' ? ['#1B1C20', '#0B0B0C'] : ['#FAFAFA', '#E3E3E7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.boardShadow, t.shadows.lg, { borderRadius: previewSize * 0.012 }]}>
            <Board
              fen={PREVIEW.fen}
              orientation="w"
              size={Math.max(0, previewSize - 32)}
              lastMove={PREVIEW.lastMove}
              selected={PREVIEW.selected}
              targets={[...PREVIEW.targets]}
              theme={theme}
              pieces={board.pieces}
            />
          </View>
          <View style={styles.caption}>
            <Text variant="overline" tone="muted">
              Now using
            </Text>
            <Text variant="subheading">
              {theme.name} board · {set.name} pieces
            </Text>
          </View>
        </View>
      )}

      <Tabs<Section>
        items={[
          { key: 'board', label: 'Board' },
          { key: 'pieces', label: 'Pieces' },
        ]}
        value={section}
        onChange={setSection}
      />

      {tile > 0 && section === 'board' && (
        <View style={[styles.grid, { gap }]} accessibilityRole="radiogroup" accessibilityLabel="Board theme">
          {boardThemeList.map((b) => (
            <ThemeTile key={b.id} theme={b} pieces={board.pieces} size={tile} active={b.id === theme.id} onPress={() => onChange({ theme: b.id })} />
          ))}
        </View>
      )}

      {tile > 0 && section === 'pieces' && (
        <View style={[styles.grid, { gap }]} accessibilityRole="radiogroup" accessibilityLabel="Piece set">
          {pieceSetList.map((p) => (
            <PieceTile key={p.id} id={p.id} theme={theme} size={tile} active={p.id === board.pieces} onPress={() => onChange({ pieces: p.id })} />
          ))}
        </View>
      )}

      <Pressable onPress={() => setCredits((v) => !v)} accessibilityRole="button" style={styles.creditsToggle}>
        <Text variant="caption" tone="muted">
          Piece artwork credits
        </Text>
        <Ionicons name={credits ? 'chevron-up' : 'chevron-down'} size={14} color={c.textTertiary} />
      </Pressable>
      {credits && (
        <View style={{ gap: 6 }}>
          {pieceSetList.map((p) => (
            <Text key={p.id} variant="caption" tone="muted">
              <Text variant="caption">{p.name}: </Text>
              {p.credit},{' '}
              <Text variant="caption" style={{ textDecorationLine: 'underline' }} onPress={() => void Linking.openURL(p.licenseUrl)}>
                {p.license}
              </Text>
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function Selectable({ active, label, onPress, children, size }: { active: boolean; label: string; onPress: () => void; size: number; children: ReactNode }) {
  const t = useAppTheme();
  const c = t.colors;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      style={({ pressed }) => [{ width: size, opacity: pressed ? 0.75 : 1 }]}>
      <View style={[styles.tileFrame, { borderColor: active ? c.accent : 'transparent', borderRadius: t.radii.md + 3 }]}>
        <View style={{ borderRadius: t.radii.md, overflow: 'hidden' }}>{children}</View>
        {active && (
          <View style={[styles.check, { backgroundColor: c.accent }]}>
            <Ionicons name="checkmark" size={12} color={c.onAccent} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** 3x3 corner of a board in the theme, with the player's pieces on it. */
function ThemeTile({ theme, pieces, size, active, onPress }: { theme: BoardTheme; pieces: PieceSet; size: number; active: boolean; onPress: () => void }) {
  const inner = size - 10;
  const cell = inner / 3;
  const layout: (readonly ['w' | 'b', string] | null)[] = [['b', 'q'], null, ['b', 'n'], null, ['w', 'n'], null, ['w', 'b'], null, ['w', 'p']];
  return (
    <View style={{ gap: 6, width: size }}>
      <Selectable active={active} label={`${theme.name} board`} onPress={onPress} size={size}>
        <View style={{ width: inner, height: inner, flexDirection: 'row', flexWrap: 'wrap' }}>
          {layout.map((p, i) => (
            <View key={i} style={{ width: cell, height: cell, backgroundColor: i % 2 === 0 ? theme.light : theme.dark }}>
              {p && <Image source={pieceImage(pieces, p[0], p[1])} style={{ width: cell, height: cell }} />}
            </View>
          ))}
          {theme.finish !== 'flat' && (
            <LinearGradient
              pointerEvents="none"
              colors={theme.finish === 'glass' ? ['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.03)', 'rgba(0,0,0,0.12)'] : ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.08)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
        </View>
      </Selectable>
      <TileLabel title={theme.name} note={theme.note} active={active} />
    </View>
  );
}

/** King and knight of both colours on the current board. */
function PieceTile({ id, theme, size, active, onPress }: { id: PieceSet; theme: BoardTheme; size: number; active: boolean; onPress: () => void }) {
  const info = PIECE_SET_INFO[id];
  const inner = size - 10;
  const cell = inner / 2;
  const pieces: ['w' | 'b', string][] = [
    ['w', 'k'],
    ['b', 'n'],
    ['w', 'n'],
    ['b', 'k'],
  ];
  return (
    <View style={{ gap: 6, width: size }}>
      <Selectable active={active} label={`${info.name} pieces`} onPress={onPress} size={size}>
        <View style={{ width: inner, height: inner, flexDirection: 'row', flexWrap: 'wrap' }}>
          {pieces.map(([color, type], i) => (
            <View key={i} style={{ width: cell, height: cell, backgroundColor: (i + Math.floor(i / 2)) % 2 === 0 ? theme.light : theme.dark }}>
              <Image source={pieceImage(id, color, type)} style={{ width: cell, height: cell }} />
            </View>
          ))}
        </View>
      </Selectable>
      <TileLabel title={info.name} note={info.note} active={active} />
    </View>
  );
}

function TileLabel({ title, note, active }: { title: string; note: string; active: boolean }) {
  return (
    <View style={{ paddingHorizontal: 2 }}>
      <Text variant="label" tone={active ? 'default' : 'muted'} numberOfLines={1}>
        {title}
      </Text>
      <Text variant="caption" tone="tertiary" numberOfLines={1}>
        {note}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth * 2, alignItems: 'center', paddingTop: 16, paddingBottom: 14, gap: 12 },
  boardShadow: { overflow: 'visible' },
  caption: { alignItems: 'center', gap: 2, paddingHorizontal: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tileFrame: { borderWidth: 2, padding: 3 },
  check: { position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  creditsToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
});
