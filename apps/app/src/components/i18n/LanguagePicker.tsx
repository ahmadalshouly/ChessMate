import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CountryFlag } from '@/components/CountryFlag';
import { useTheme } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { LANGS, LANGUAGE_FLAG_COUNTRY, LANGUAGE_NAMES, deviceLanguage, needsRestartFor, setLanguagePreference, useI18n, type LanguagePreference } from '@/i18n';
import { rimShadow } from '@/ui';
import { Text } from '@/ui/primitives';

export interface LanguagePickerProps {
  /** Offer "Device language (…)" at the top (Settings). Default true. */
  includeSystem?: boolean;
  /** A narrower, centred trigger (the welcome screen). */
  compact?: boolean;
}

/**
 * Language dropdown: the current language with its flag; tap to open the list of every
 * language, each with a flag and its name in its own language. Opens in place (no overlay),
 * so it works the same inside scroll views on web, iOS and Android.
 */
export function LanguagePicker({ includeSystem = true, compact = false }: LanguagePickerProps) {
  const t = useTheme();
  const { tr, preference } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const choices: LanguagePreference[] = includeSystem ? ['system', ...LANGS] : [...LANGS];
  const current: LanguagePreference = includeSystem ? preference : preference === 'system' ? deviceLanguage() : preference;

  const nameOf = (p: LanguagePreference) => (p === 'system' ? tr('settings.language.system', { language: LANGUAGE_NAMES[deviceLanguage()] }) : LANGUAGE_NAMES[p]);
  const flagOf = (p: LanguagePreference) => LANGUAGE_FLAG_COUNTRY[p === 'system' ? deviceLanguage() : p];

  const pick = (p: LanguagePreference) => {
    setOpen(false);
    if (p === current || busy) return;
    setBusy(true);
    track('language_change', { lang: p });
    setLanguagePreference(p).finally(() => setBusy(false));
  };

  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${tr('settings.language.title')}: ${nameOf(current)}`}
        accessibilityState={{ expanded: open, disabled: busy }}
        disabled={busy}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [
          styles.trigger,
          { borderColor: open ? t.text : t.border, backgroundColor: t.surfaceStrong, opacity: pressed ? 0.75 : 1 },
        ]}>
        {current === 'system' ? (
          <Ionicons name="phone-portrait-outline" size={18} color={t.muted} />
        ) : (
          <CountryFlag code={flagOf(current)} size={16} decorative />
        )}
        <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 15, fontWeight: '600' }}>
          {nameOf(current)}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={t.muted} />
      </Pressable>
      {open && (
        <View style={[styles.menu, { borderColor: t.border, backgroundColor: t.surfaceStrong }]}>
          <ScrollView style={styles.scroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            <View accessibilityRole="radiogroup" accessibilityLabel={tr('settings.language.title')}>
              {choices.map((p) => {
                const on = p === current;
                const restart = !on && needsRestartFor(p);
                return (
                  <Pressable
                    key={p}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    // Each language name is announced in its own language.
                    accessibilityLanguage={p === 'system' ? undefined : p}
                    onPress={() => pick(p)}
                    style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                      styles.option,
                      { backgroundColor: on ? t.glassSelected : pressed || hovered ? t.surface : 'transparent' },
                      on && rimShadow(t, 'bright'),
                    ]}>
                    {p === 'system' ? (
                      <View style={styles.iconSlot}>
                        <Ionicons name="phone-portrait-outline" size={16} color={t.muted} />
                      </View>
                    ) : (
                      <CountryFlag code={flagOf(p)} size={14} decorative style={styles.flag} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.text, fontSize: 15, fontWeight: on ? '700' : '400' }}>{nameOf(p)}</Text>
                      {restart && <Text style={{ color: t.muted, fontSize: 12 }}>{tr('settings.language.restart')}</Text>}
                    </View>
                    {on && <Ionicons name="checkmark" size={18} color={t.text} />}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, width: '100%' },
  compact: { maxWidth: 280, alignSelf: 'center' },
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 },
  menu: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  scroll: { maxHeight: 360, padding: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  iconSlot: { width: 21, alignItems: 'center' },
  flag: { marginHorizontal: 0 },
});
