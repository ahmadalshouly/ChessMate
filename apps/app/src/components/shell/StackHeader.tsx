import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackHeaderProps } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { fonts } from '@/ui';

import { Glass } from './Glass';

/**
 * Glass header for pushed screens (a game, a puzzle, a lesson). Pass
 * `insetTop` when the screen is shown outside the shell, where the header
 * also has to clear the status bar.
 */
export function StackHeader({ navigation, options, route, back, insetTop }: NativeStackHeaderProps & { insetTop?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { tr, rtl } = useI18n();
  const title = typeof options.title === 'string' ? options.title : route.name;
  return (
    <Glass intensity={60} sheen={false} style={[styles.bar, { paddingTop: (insetTop ? insets.top : 0) + 8 }]}>
      <View style={styles.row}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={back.title ? tr('common.backTo', { title: back.title }) : tr('common.back')}
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={({ pressed }) => [styles.back, { borderColor: t.border, opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name={rtl ? 'chevron-forward' : 'chevron-back'} size={20} color={t.text} />
          </Pressable>
        ) : null}
        <Text numberOfLines={1} style={[styles.title, { color: t.text }]} accessibilityRole="header">
          {title}
        </Text>
        {options.headerRight ? <View style={styles.right}>{options.headerRight({ tintColor: t.text, canGoBack: !!back })}</View> : null}
      </View>
    </Glass>
  );
}

/** Same header, for stacks outside the shell. */
export function RootStackHeader(props: NativeStackHeaderProps) {
  return <StackHeader {...props} insetTop />;
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, paddingHorizontal: 12, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 38 },
  back: { width: 36, height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 17, lineHeight: 22, letterSpacing: -0.3 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
