import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/shell/Logo';
import { Card, Label, Screen } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useI18n } from '@/i18n';

/** The ChessMate line-art mark. */
export function BrandMark({ size = 56 }: { size?: number }) {
  return <Logo size={size} wordmark={false} />;
}

/** Centered, keyboard-aware glass card used by every auth screen. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  back = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  back?: boolean;
}) {
  const t = useTheme();
  const { tr, rtl } = useI18n();
  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.column}>
              {back ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tr('common.back')}
                  hitSlop={12}
                  onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
                  style={styles.back}>
                  <Text style={{ color: t.muted, fontSize: 15, fontWeight: '600' }}>{`${rtl ? '›' : '‹'} ${tr('common.back')}`}</Text>
                </Pressable>
              ) : null}
              <View style={styles.header}>
                <BrandMark />
                <Label size={26} bold>
                  {title}
                </Label>
                {subtitle ? <Label muted>{subtitle}</Label> : null}
              </View>
              <Card>
                <View style={styles.form}>{children}</View>
              </Card>
              {footer ? <View style={styles.footer}>{footer}</View> : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Screen>
  );
}

/** Inline text link. */
export function TextLink({ title, onPress }: { title: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="link" onPress={onPress} style={{ color: t.text, fontWeight: '700', textDecorationLine: 'underline' }}>
      {title}
    </Text>
  );
}

/** Form-level message: error (red) or info (neutral). */
export function FormMessage({ kind, children }: { kind: 'error' | 'info'; children: ReactNode }) {
  const t = useTheme();
  const color = kind === 'error' ? t.danger : t.text;
  return (
    <View
      accessibilityLiveRegion="polite"
      role={kind === 'error' ? 'alert' : undefined}
      style={[styles.message, { borderColor: kind === 'error' ? t.danger : t.border, backgroundColor: t.surface }]}>
      <Text style={{ color, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export function Divider({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={styles.divider}>
      <View style={[styles.rule, { backgroundColor: t.border }]} />
      <Text style={{ color: t.muted, fontSize: 13 }}>{label}</Text>
      <View style={[styles.rule, { backgroundColor: t.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16, paddingVertical: 32 },
  column: { width: '100%', maxWidth: 420, gap: 20 },
  back: { alignSelf: 'flex-start', paddingVertical: 4 },
  header: { alignItems: 'center', gap: 8 },
  form: { gap: 14, paddingVertical: 4 },
  footer: { alignItems: 'center', gap: 10 },
  mark: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 6 },
  message: { borderWidth: 1, borderRadius: 12, padding: 12 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
});
