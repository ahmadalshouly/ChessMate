import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../theme/ThemeProvider';
import { GlassView } from './Glass';
import { Text } from './Text';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Leading element: Avatar, icon, flag. */
  left?: ReactNode;
  /** Trailing element: Badge, Switch, button. A string renders as muted value text. */
  right?: ReactNode;
  /** Show a › chevron (navigates somewhere). */
  chevron?: boolean;
  onPress?: () => void;
  /** Red title for destructive rows (Sign out, Delete account). */
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * One line in a list: friends, games, settings. Put several inside `<ListGroup>`.
 *
 *   <ListRow left={<Avatar name="Magnus" status="online" />} title="Magnus" subtitle="Blitz 2850" right={<Badge label="Challenge" />} />
 */
export function ListRow({ title, subtitle, left, right, chevron, onPress, destructive, disabled }: ListRowProps) {
  const t = useAppTheme();
  const c = t.colors;
  const content = (pressed: boolean) => (
    <View style={[styles.row, { backgroundColor: pressed ? c.surfacePressed : 'transparent', opacity: disabled ? 0.45 : 1 }]}>
      {left}
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="bodyStrong" tone={destructive ? 'danger' : 'default'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {typeof right === 'string' || typeof right === 'number' ? (
        <Text tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
          {right}
        </Text>
      ) : (
        right
      )}
      {chevron && (
        <Text tone="tertiary" style={{ fontSize: 22, lineHeight: 22, marginTop: -2 }}>
          ›
        </Text>
      )}
    </View>
  );
  if (!onPress) return content(false);
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}>
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

/** Glass container that stacks ListRows with inset hairline dividers. */
export function ListGroup({ children }: { children: ReactNode }) {
  const c = useAppTheme().colors;
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <GlassView radius="lg">
      {rows.map((row, i) => (
        <Fragment key={row.key ?? i}>
          {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, marginStart: 16, backgroundColor: c.border }} />}
          {row}
        </Fragment>
      ))}
    </GlassView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 52 },
});
