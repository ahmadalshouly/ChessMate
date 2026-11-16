import Ionicons from '@expo/vector-icons/Ionicons';
import { useTabTrigger } from 'expo-router/ui';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import type { TabConfig } from '@/navigation/tabs';

/**
 * One destination in the tab bar (`variant="bar"`) or sidebar
 * (`variant="side"`). Wired to the headless tab navigator by route name.
 */
export function NavItem({ tab, variant }: { tab: TabConfig; variant: 'bar' | 'side' }) {
  const t = useTheme();
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
        accessibilityLabel={tab.label}
        onPress={triggerProps.onPress}
        onLongPress={triggerProps.onLongPress}
        style={({ pressed }) => [styles.bar, { opacity: pressed ? 0.6 : 1 }]}>
        <View style={[styles.barIcon, focused && { backgroundColor: t.accent }]}>
          <Ionicons name={focused ? tab.iconActive : tab.icon} size={21} color={focused ? t.onAccent : t.muted} />
        </View>
        <Text numberOfLines={1} style={[styles.barLabel, { color: focused ? t.text : t.muted, fontWeight: focused ? '700' : '500' }]}>
          {tab.label}
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
        { backgroundColor: focused ? t.accent : hovered ? t.border : 'transparent', opacity: pressed ? 0.75 : 1 },
      ]}>
      <Ionicons name={focused ? tab.iconActive : tab.icon} size={20} color={focused ? t.onAccent : t.text} />
      <Text style={[styles.sideLabel, { color: focused ? t.onAccent : t.text, fontWeight: focused ? '700' : '500' }]}>{tab.title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 6 },
  barIcon: { width: 44, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  barLabel: { fontSize: 11, letterSpacing: 0.1 },
  side: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, height: 44, borderRadius: 12 },
  sideLabel: { fontSize: 15 },
});
