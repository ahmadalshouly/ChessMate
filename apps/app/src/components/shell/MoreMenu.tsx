import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { MORE_SECTIONS, type MoreItem } from '@/navigation/more';
import { fonts } from '@/ui';
import { Text } from '@/ui/primitives';

import { BrandLine } from './BrandLine';
import { Glass } from './Glass';
import { Logo } from './Logo';

/**
 * The "More" side menu on phones: slides in from the start edge with every
 * section that isn't in the bottom bar. Tapping outside or an item closes it.
 */
export function MoreMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const { tr, rtl } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelW = Math.min(340, Math.round(width * 0.86));
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, { toValue: visible ? 1 : 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [visible, slide]);

  // From the left in left-to-right languages, from the right in Arabic.
  const from = rtl ? panelW : -panelW;
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [from, 0] });
  const go = (item: MoreItem) => {
    if (item.soon || !item.href) return;
    onClose();
    router.push(item.href);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityRole="button" accessibilityLabel={tr('common.close')} onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }]} />
      <Animated.View style={[styles.panelWrap, rtl ? { right: 0 } : { left: 0 }, { width: panelW, transform: [{ translateX }] }]}>
        <Glass intensity={80} style={[styles.panel, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.head}>
            <Logo size={30} />
            <Pressable accessibilityRole="button" accessibilityLabel={tr('common.close')} onPress={onClose} hitSlop={10} style={[styles.close, { borderColor: t.border }]}>
              <Ionicons name="close" size={18} color={t.text} />
            </Pressable>
          </View>
          <Text style={[styles.tagline, { color: t.textTertiary }]}>{tr('brand.tagline')}</Text>
          <ScrollView contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
            {MORE_SECTIONS.map((section) => (
              <View key={section.title} style={{ marginTop: 18 }}>
                <Text style={[styles.section, { color: t.textTertiary }]}>{tr(section.title)}</Text>
                {section.items.map((item) => (
                  <Pressable
                    key={item.key}
                    accessibilityRole="link"
                    accessibilityState={{ disabled: !!item.soon }}
                    disabled={item.soon}
                    onPress={() => go(item)}
                    style={({ pressed }) => [styles.item, { backgroundColor: pressed ? t.surfacePressed : 'transparent', opacity: item.soon ? 0.55 : 1 }]}>
                    <Ionicons name={item.icon} size={19} color={t.text} />
                    <Text style={[styles.itemLabel, { color: t.text }]}>{tr(item.label)}</Text>
                    {item.soon ? (
                      <View style={[styles.soon, { borderColor: t.border }]}>
                        <Text style={[styles.soonText, { color: t.muted }]}>{tr('more.soon')}</Text>
                      </View>
                    ) : (
                      <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={15} color={t.textTertiary} />
                    )}
                  </Pressable>
                ))}
              </View>
            ))}
            <BrandLine />
          </ScrollView>
        </Glass>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  panelWrap: { position: 'absolute', top: 0, bottom: 0 },
  panel: { flex: 1, paddingHorizontal: 14, borderRadius: 0 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 },
  close: { width: 34, height: 34, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  tagline: { fontFamily: fonts.label, fontSize: 9.5, letterSpacing: 1.8, textTransform: 'uppercase', marginTop: 8, paddingHorizontal: 6 },
  section: { fontFamily: fonts.label, fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', paddingHorizontal: 8, marginBottom: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 46, paddingHorizontal: 10, borderRadius: 14 },
  itemLabel: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 15 },
  soon: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  soonText: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' },
});
