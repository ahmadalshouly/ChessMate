import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { LANGS, LANGUAGE_NAMES, setLanguagePreference, useI18n } from '@/i18n';

/** Compact language switcher (welcome screen). Settings has the full picker with "device language". */
export function LanguageChips() {
  const t = useTheme();
  const { lang, tr } = useI18n();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={tr('settings.language.title')} style={styles.row}>
      {LANGS.map((l) => {
        const on = l === lang;
        return (
          <Pressable
            key={l}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLanguage={l}
            onPress={() => !on && void setLanguagePreference(l)}
            style={[styles.chip, { borderColor: on ? t.text : t.border, backgroundColor: on ? t.surfaceStrong : 'transparent' }]}>
            <Text style={{ color: on ? t.text : t.muted, fontSize: 13, fontWeight: on ? '700' : '500' }}>{LANGUAGE_NAMES[l]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
});
