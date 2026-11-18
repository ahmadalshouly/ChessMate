import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal as RNModal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../theme/ThemeProvider';
import { GlassView } from './Glass';
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
 * Glass dialog or bottom sheet over a blurred backdrop.
 *
 *   <Modal visible={open} onClose={close} title="Resign game?" description="Your opponent wins."
 *     actions={<><Button variant="ghost" title="Cancel" onPress={close} /><Button variant="danger" title="Resign" onPress={resign} /></>} />
 */
export function Modal({ visible, onClose, title, description, children, actions, presentation = 'dialog', dismissable = true }: ModalProps) {
  const t = useAppTheme();
  const c = t.colors;
  const insets = useSafeAreaInsets();
  const sheet = presentation === 'sheet';

  return (
    <RNModal visible={visible} transparent animationType={sheet ? 'slide' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={translate('common.close')}
          onPress={dismissable ? onClose : undefined}
          style={StyleSheet.absoluteFill}>
          {Platform.OS !== 'android' && <BlurView intensity={18} tint={c.scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} />
        </Pressable>
        <View
          pointerEvents="box-none"
          style={[styles.host, sheet ? { justifyContent: 'flex-end' } : { justifyContent: 'center', padding: t.space.xl }]}>
          <GlassView
            accessibilityViewIsModal
            strength="strong"
            elevation="lg"
            radius="xl"
            style={[
              { width: '100%', maxWidth: sheet ? t.layout.maxContentWidth : 440 },
              sheet && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: insets.bottom },
            ]}>
            <Stack gap="lg" style={{ padding: t.space.xxl }}>
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
              {children}
              {actions && (
                <Row gap="sm" justify="flex-end" wrap>
                  {actions}
                </Row>
              )}
            </Stack>
          </GlassView>
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, alignItems: 'center' },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginTop: -8 },
});
