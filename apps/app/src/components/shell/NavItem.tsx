import Ionicons from '@expo/vector-icons/Ionicons';
import { useTabTrigger } from 'expo-router/ui';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { useI18n } from '@/i18n';
import type { TabConfig } from '@/navigation/tabs';
import { fonts } from '@/ui';
import { Text } from '@/ui/primitives';

/**
 * One destination in the tab bar (`variant="bar"`) or sidebar
 * (`variant="side"`). Wired to the headless tab navigator by route name.
 */
export function NavItem({ tab, variant, index }: { tab: TabConfig; variant: 'bar' | 'side'; index?: number }) {
  const t = useTheme();
  const { tr, rtl } = useI18n();
  const { trigger, triggerProps } = useTabTrigger({ name: tab.name });
  const focused = triggerProps.isFocused;
  // On web, give the item a real link so middle-click / open-in-new-tab work.
  const webProps = Platform.OS === 'web' ? ({ href: trigger?.resolvedHref } as object) : {};

  if (variant === 'bar') {
    return (
      <Pressable
        {...webProps}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={tr(tab.label)}
        onPress={triggerProps.onPress}
        onLongPress={triggerProps.onLongPress}
        style={({ pressed }) => [styles.bar, { opacity: pressed ? 0.6 : 1 }]}>
        <View style={[styles.barIcon, focused && { backgroundColor: t.accent }]}>
          <Ionicons name={focused ? tab.iconActive : tab.icon} size={19} color={focused ? t.onAccent : t.muted} />
        </View>
        <Text numberOfLines={1} style={[styles.barLabel, { color: focused ? t.text : t.textTertiary }]}>
          {tr(tab.label)}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      {...webProps}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      onPress={triggerProps.onPress}
      onLongPress={triggerProps.onLongPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.side,
        { backgroundColor: focused ? t.surfacePressed : hovered ? t.surfaceSunken : 'transparent', opacity: pressed ? 0.75 : 1 },
      ]}>
      {/* Outer edge of the sidebar. Native already swaps left and right in RTL; web needs it spelled out. */}
      {focused && <View style={[styles.sideMark, Platform.OS === 'web' && rtl ? { right: 0 } : { left: 0 }, { backgroundColor: t.accent }]} />}
      <Ionicons name={focused ? tab.iconActive : tab.icon} size={18} color={focused ? t.text : t.muted} />
      <Text style={[styles.sideLabel, { color: focused ? t.text : t.muted, fontFamily: focused ? fonts.sansSemiBold : fonts.sansMedium }]}>{tr(tab.title)}</Text>
      {index !== undefined && <Text style={[styles.sideIndex, { color: t.textTertiary }]}>{String(index + 1).padStart(2, '0')}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6 },
  barIcon: { width: 46, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  barLabel: { fontFamily: fonts.monoMedium, fontSize: 9.5, letterSpacing: 0.9, textTransform: 'uppercase' },
  side: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, height: 42, borderRadius: 12 },
  sideMark: { position: 'absolute', top: 12, bottom: 12, width: 2.5, borderRadius: 2 },
  sideLabel: { fontSize: 14.5, flex: 1, letterSpacing: -0.15 },
  sideIndex: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 0.5 },
});
