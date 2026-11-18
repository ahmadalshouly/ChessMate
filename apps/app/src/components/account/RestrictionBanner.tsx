import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { dirIcon, useT } from '@/i18n';
import { useAccountRestriction } from '@/lib/accountRestriction';
import { GlassView, Text, useAppTheme } from '@/ui';

/**
 * Shown on the main screens while the account is closed for a fair-play
 * violation: says online play is off and what still works, and opens the
 * message that explains it. Renders nothing for accounts in good standing.
 */
export function RestrictionBanner({ compact = false }: { compact?: boolean }) {
  const tr = useT();
  const c = useAppTheme().colors;
  const restriction = useAccountRestriction();
  if (!restriction) return null;
  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${tr('server.restriction.title')}. ${tr('server.restriction.body')}`}
        onPress={() => router.push('/notifications')}
        style={({ pressed }) => [styles.press, pressed && { opacity: 0.85 }]}>
        <GlassView radius="lg" elevation="sm" strength="strong" style={[styles.card, { borderColor: c.danger }]}>
          <View style={[styles.icon, { backgroundColor: c.danger }]}>
            <Ionicons name="shield-outline" size={18} color="#FFFFFF" />
          </View>
          <View style={styles.text}>
            <Text variant="overline" style={{ color: c.danger }}>
              {tr('server.restriction.badge')}
            </Text>
            <Text variant="subheading">{tr('server.restriction.title')}</Text>
            {!compact && (
              <Text variant="label" tone="muted">
                {tr('server.restriction.body')}
              </Text>
            )}
          </View>
          <Ionicons name={dirIcon('chevron-forward')} size={18} color={c.muted} />
        </GlassView>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 12, width: '100%', alignItems: 'center' },
  compact: { paddingHorizontal: 0, paddingTop: 0 },
  press: { width: '100%', maxWidth: 960 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
