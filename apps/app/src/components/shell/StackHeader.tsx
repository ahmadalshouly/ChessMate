import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackHeaderProps } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { fonts } from '@/ui';

import { PressableScale } from '@/ui/components/liquid';

import { Glass, floatShadow } from './Glass';

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
  // No bar: the header shares the page's top colour, and the back button floats as a glass
  // circle. Depth comes from the floating controls, not from a rule under the header.
  return (
    <View style={[styles.bar, { backgroundColor: insetTop ? t.bgGradient[0] : 'transparent', paddingTop: (insetTop ? insets.top : 0) + 6 }]}>
      <View style={styles.row}>
        {back ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={back.title ? tr('common.backTo', { title: back.title }) : tr('common.back')}
            onPress={() => navigation.goBack()}
            hitSlop={8}
            scaleTo={0.88}>
            <Glass radius={20} interactive style={[styles.back, floatShadow(t.scheme)]}>
              <Ionicons name={rtl ? 'chevron-forward' : 'chevron-back'} size={20} color={t.text} />
            </Glass>
          </PressableScale>
        ) : null}
        {typeof options.headerTitle === 'function' ? (
          <View style={styles.custom}>{options.headerTitle({ children: title, tintColor: t.text })}</View>
        ) : (
          <Text numberOfLines={1} style={[styles.title, { color: t.text }]} accessibilityRole="header">
            {title}
          </Text>
        )}
        {options.headerRight ? <View style={styles.right}>{options.headerRight({ tintColor: t.text, canGoBack: !!back })}</View> : null}
      </View>
    </View>
  );
}

/** Same header, for stacks outside the shell. */
export function RootStackHeader(props: NativeStackHeaderProps) {
  return <StackHeader {...props} insetTop />;
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 12, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 42 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 18, lineHeight: 24, letterSpacing: -0.3 },
  custom: { flex: 1, minWidth: 0 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
