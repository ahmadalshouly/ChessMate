import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Modal as RNModal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../theme/ThemeProvider';
import { GlassView } from './Glass';
import { KeyboardAvoider } from './Keyboard';
import { Row, Stack } from './Layout';
import { Text } from './Text';
import { translate } from '@/i18n';

export interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  /** Buttons at the bottom, laid out in a row (primary last). */
  actions?: ReactNode;
  /** `dialog` centres a card; `sheet` slides up from the bottom. Default `dialog`. */
  presentation?: 'dialog' | 'sheet';
  /** Close when the backdrop is tapped. Default true. */
  dismissable?: boolean;
}

/**
 * Glass dialog or bottom sheet over a blurred backdrop. It never grows past the
 * screen: the title and the action buttons stay put and the content between
 * them scrolls.
 *
 *   <Modal visible={open} onClose={close} title="Resign game?" description="Your opponent wins."
 *     actions={<><Button variant="ghost" title="Cancel" onPress={close} /><Button variant="danger" title="Resign" onPress={resign} /></>} />
 */
export function Modal({ visible, onClose, title, description, children, actions, presentation = 'dialog', dismissable = true }: ModalProps) {
  const t = useAppTheme();
  const c = t.colors;
  // The device's own insets: a sheet opened inside the app shell must not see the tab bar's
  // space (which the shell hands its screens as a bottom inset).
  const screenInsets = useSafeAreaInsets();
  const insets = initialWindowMetrics?.insets ?? screenInsets;
  const sheet = presentation === 'sheet';

  return (
    <RNModal visible={visible} transparent animationType={sheet ? 'slide' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoider style={{ flex: 1 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={translate('common.close')}
          onPress={dismissable ? onClose : undefined}
          style={StyleSheet.absoluteFill}>
          {Platform.OS !== 'android' && <BlurView intensity={12} tint={c.scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} />
        </Pressable>
        <View
          pointerEvents="box-none"
          style={[styles.host, sheet ? { justifyContent: 'flex-end', paddingHorizontal: t.space.sm } : { justifyContent: 'center', padding: t.space.xl }]}>
          <GlassView
            accessibilityViewIsModal
            kind="chrome"
            strength="strong"
            elevation="float"
            radius="xl"
            style={[
              { width: '100%', maxWidth: sheet ? t.layout.maxContentWidth : 440, maxHeight: sheet ? '94%' : '100%', overflow: 'hidden' },
              // Sheets float clear of the screen edges with every corner rounded, like iOS sheets.
              sheet && { marginBottom: Math.max(insets.bottom, t.space.sm), marginTop: insets.top, borderRadius: t.radii.xl + 4 },
            ]}>
            {(sheet || title || description) && (
              <Stack gap="lg" style={{ paddingHorizontal: t.space.xxl, paddingTop: t.space.xxl }}>
                {sheet && <View style={[styles.grabber, { backgroundColor: c.borderStrong }]} />}
                {(title || description) && (
                  <Stack gap="xs">
                    {title && (
                      <Text variant="heading" accessibilityRole="header">
                        {title}
                      </Text>
                    )}
                    {description && <Text tone="muted">{description}</Text>}
                  </Stack>
                )}
              </Stack>
            )}
            {children ? (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={{ paddingHorizontal: t.space.xxl, paddingTop: sheet || title || description ? t.space.lg : t.space.xxl, paddingBottom: actions ? t.space.sm : t.space.xxl }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator>
                <Stack gap="lg">{children}</Stack>
              </ScrollView>
            ) : null}
            {actions && (
              <Row gap="sm" justify="flex-end" wrap style={{ paddingHorizontal: t.space.xxl, paddingTop: t.space.md, paddingBottom: t.space.xxl }}>
                {actions}
              </Row>
            )}
          </GlassView>
        </View>
      </KeyboardAvoider>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, alignItems: 'center' },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginTop: -8 },
  scroll: { flexGrow: 0, flexShrink: 1 },
});
