import type { Avatar as AvatarValue, AvatarTone } from '@chessmate/core';
import { Text, View } from 'react-native';

const GLYPH: Record<string, string> = { king: '♚︎', queen: '♛︎', rook: '♜︎', bishop: '♝︎', knight: '♞︎', pawn: '♟︎' };
export const TONES: Record<AvatarTone, { bg: string; fg: string; ring: string }> = {
  ink: { bg: '#0B0B0C', fg: '#F5F5F7', ring: 'rgba(255,255,255,0.18)' },
  paper: { bg: '#FAFAFA', fg: '#0B0B0C', ring: 'rgba(11,11,12,0.12)' },
  graphite: { bg: '#3A3A40', fg: '#F5F5F7', ring: 'rgba(255,255,255,0.16)' },
  silver: { bg: '#C9C9CF', fg: '#0B0B0C', ring: 'rgba(11,11,12,0.14)' },
};

export function initials(name: string) {
  const parts = name.trim().split(/[\s_-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function Avatar({ avatar, name, size = 72 }: { avatar: AvatarValue; name: string; size?: number }) {
  const tone = TONES[avatar.tone];
  const isGlyph = avatar.id !== 'initials';
  return (
    <View
      accessibilityLabel={`${name} avatar`}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tone.bg, borderWidth: 2, borderColor: tone.ring, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: tone.fg, fontSize: size * (isGlyph ? 0.56 : 0.38), fontWeight: '700', lineHeight: size * (isGlyph ? 0.7 : 0.5), letterSpacing: isGlyph ? 0 : 0.5 }}>
        {isGlyph ? GLYPH[avatar.id] : initials(name)}
      </Text>
    </View>
  );
}
