import type { ChessTitle } from '@chessmate/core';
import { View } from 'react-native';

import { useT } from '@/i18n';
import { Badge } from '@/ui';

/** The verified title next to a name: a small solid tag, like "GM". */
export function TitleBadge({ title, size }: { title: ChessTitle | null | undefined; size?: 'sm' | 'md' }) {
  const tr = useT();
  if (!title) return null;
  return (
    <View accessible accessibilityLabel={tr(`chessTitle.names.${title}`)}>
      <Badge label={title} tone="solid" size={size} />
    </View>
  );
}

/** Badge tone for an application's status. */
export const TITLE_STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'danger', withdrawn: 'neutral' } as const;
