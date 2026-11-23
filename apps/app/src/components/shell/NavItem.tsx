import Ionicons from '@expo/vector-icons/Ionicons';
import { useTabTrigger } from 'expo-router/ui';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { useI18n } from '@/i18n';
import type { TabConfig } from '@/navigation/tabs';
import { fonts } from '@/ui';
import { Text } from '@/ui/primitives';
import { PressableScale, rimShadow } from '@/ui/components/liquid';

/**
 * One destination in the tab bar (`variant="bar"`) or sidebar
 * (`variant="side"`). Wired to the headless tab navigator by route name.
 */
export function NavItem({ tab, variant, index }: { tab: TabConfig; variant: 'bar' | 'side'; index?: number }) {
  const t = useTheme();
  const { tr } = useI18n();
  const { trigger, triggerProps } = useTabTrigger({ name: tab.name });
  const focused = triggerProps.isFocused;
  // On web, give the item a real link so middle-click / open-in-new-tab work.
  const webProps = Platform.OS === 'web' ? ({ href: trigger?.resolvedHref } as object) : {};

  if (variant === 'bar') {
    return (
      <PressableScale
        {...webProps}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={tr(tab.label)}
        onPress={triggerProps.onPress}
        onLongPress={triggerProps.onLongPress}
        scaleTo={0.88}
        style={styles.bar}>
        <BarIcon focused={focused} icon={focused ? tab.iconActive : tab.icon} />
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.barLabel, { color: focused ? t.text : t.muted }]}>
          {tr(tab.label)}
        </Text>
      </PressableScale>
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
        { backgroundColor: focused ? t.glassSelected : hovered ? t.surfaceSunken : 'transparent', opacity: pressed ? 0.75 : 1 },
        focused && rimShadow(t),
      ]}>
      <Ionicons name={focused ? tab.iconActive : tab.icon} size={18} color={focused ? t.text : t.muted} />
      <Text style={[styles.sideLabel, { color: focused ? t.text : t.muted, fontFamily: focused ? fonts.sansSemiBold : fonts.sansMedium }]}>{tr(tab.title)}</Text>
      {index !== undefined && <Text style={[styles.sideIndex, { color: t.textTertiary }]}>{String(index + 1).padStart(2, '0')}</Text>}
    </Pressable>
  );
}

/** Tab icon. The selected lens behind it is drawn once by the tab bar and slides between tabs. */
export function BarIcon({ focused, icon }: { focused: boolean; icon: TabConfig['icon'] }) {
  const t = useTheme();
  return (
    <View style={styles.barIcon}>
      <Ionicons name={icon} size={21} color={focused ? t.text : t.muted} />
    </View>
  );
}

export const barLabelStyle = { fontFamily: fonts.label, fontSize: 9, letterSpacing: 0.4, textTransform: 'uppercase' } as const;

const styles = StyleSheet.create({
  bar: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6 },
  barIcon: { width: 46, height: 26, alignItems: 'center', justifyContent: 'center' },
  barLabel: barLabelStyle,
  side: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, height: 42, borderRadius: 21 },
  sideLabel: { fontSize: 14.5, flex: 1, letterSpacing: -0.15 },
  sideIndex: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 0.5 },
});
