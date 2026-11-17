import { Pressable, StyleSheet, View } from 'react-native';

import { boardThemeList, type BoardTheme } from '../theme/boardThemes';
import { useAppTheme, useBoardTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

/** 4x4 preview of a board theme. */
export function BoardThemeSwatch({ theme, size = 64 }: { theme: BoardTheme; size?: number }) {
  const cell = size / 4;
  return (
    <View style={{ width: size, height: size, borderRadius: 8, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' }}>
      {Array.from({ length: 16 }, (_, i) => (
        <View key={i} style={{ width: cell, height: cell, backgroundColor: (Math.floor(i / 4) + i) % 2 === 0 ? theme.light : theme.dark }} />
      ))}
    </View>
  );
}

/** Grid of board themes bound to the user's board preference. Drop into Settings. */
export function BoardThemePicker({ size = 64 }: { size?: number }) {
  const t = useAppTheme();
  const { boardTheme, setBoardTheme } = useBoardTheme();
  return (
    <View style={styles.grid}>
      {boardThemeList.map((theme) => {
        const active = theme.id === boardTheme.id;
        return (
          <Pressable
            key={theme.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`${theme.name} board`}
            onPress={() => setBoardTheme(theme.id)}
            style={{ alignItems: 'center', gap: 6 }}>
            <View style={{ padding: 3, borderRadius: 11, borderWidth: 2, borderColor: active ? t.colors.accent : 'transparent' }}>
              <BoardThemeSwatch theme={theme} size={size} />
            </View>
            <Text variant="caption" tone={active ? 'default' : 'muted'}>
              {theme.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
