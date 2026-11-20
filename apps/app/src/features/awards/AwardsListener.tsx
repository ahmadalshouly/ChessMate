import { router } from 'expo-router';
import { useEffect } from 'react';

import { useT } from '@/i18n';
import { playClient } from '@/lib/playClient';
import { useToast } from '@/ui';

import { earnedLabel } from './catalog';

/** Shows a toast when a finished game unlocks awards, on any screen. */
export function AwardsListener() {
  const tr = useT();
  const toast = useToast();
  useEffect(
    () =>
      playClient.onServerMessage((m) => {
        if (m.t !== 'awards' || !m.earned.length) return;
        // Highest level per award, so going straight from bronze to gold shows once.
        const best = new Map<string, number>();
        for (const e of m.earned) best.set(e.id, Math.max(best.get(e.id) ?? 0, e.level));
        const names = [...best].map(([id, level]) => earnedLabel(id, level));
        toast.show({
          title: names.length === 1 ? tr('awards.unlocked') : tr('awards.unlockedMany', { count: names.length }),
          message: names.slice(0, 3).join('\n') + (names.length > 3 ? '\n…' : ''),
          tone: 'success',
          duration: 6000,
          action: { label: tr('awards.view'), onPress: () => router.push('/awards') },
        });
      }),
    [tr, toast],
  );
  return null;
}
