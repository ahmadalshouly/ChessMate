import Ionicons from '@expo/vector-icons/Ionicons';
import type { AppPath } from '@chessmate/core';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { GameIcon, type GameIconName } from '@/components/game/ActionBar';
import { Glass, floatShadow } from '@/components/shell/Glass';
import { useTheme } from '@/constants/theme';
import { useT } from '@/i18n';
import { appLink, shareLink, sharesWithSheet } from '@/lib/links';
import { CollectionPicker } from '@/features/collections/CollectionPicker';
import type { CollectableGame } from '@/lib/collectionsApi';
import { copyText } from '@/lib/share';
import { Button, ListGroup, ListRow, Modal, Text, fonts, useAppTheme, useToast } from '@/ui';
import { PressableScale } from '@/ui/components/liquid';

/** What the Share button on a board offers. */
export interface GameShare {
  /** Names the game in the share message: "Alice vs Bob", "Analysis board". */
  title: string;
  /** Where the link opens: the game itself when the server keeps it, else the moves on the analysis board. */
  link: AppPath;
  /** A live game: the message says "Watch … live". */
  live?: boolean;
  /** Builds the PGN when asked; null while it can't be copied (a live online game). */
  pgn: (() => string) | null;
  /** Why there is no PGN, when it is not "until the game ends". */
  pgnNote?: string;
  /** Where a copy kept in a collection opens, when not `link` (a live game is kept as its finished page). */
  keepLink?: AppPath;
}

/**
 * Share icon for the header of a board screen (play, watch, review, analysis,
 * replays). Opens a sheet with Copy PGN and Share link: the share sheet on
 * phones, the clipboard in desktop browsers. Put it in the screen's options:
 *
 *   <Stack.Screen options={{ headerRight: () => <ShareGameButton share={share} /> }} />
 */
export function ShareGameButton({ share }: { share: GameShare | null }) {
  const t = useTheme();
  const tr = useT();
  const [open, setOpen] = useState(false);
  if (!share) return null;
  return (
    <>
      <PressableScale accessibilityRole="button" accessibilityLabel={tr('share.button')} onPress={() => setOpen(true)} hitSlop={8} scaleTo={0.88}>
        <Glass radius={20} interactive style={[styles.round, floatShadow(t.scheme)]}>
          <Ionicons name={Platform.OS === 'ios' ? 'share-outline' : 'share-social-outline'} size={19} color={t.text} />
        </Glass>
      </PressableScale>
      <ShareGameSheet visible={open} onClose={() => setOpen(false)} share={share} />
    </>
  );
}

/** The sheet behind the Share button, for screens that also offer it from a button of their own. */
export function ShareGameSheet({ visible, onClose, share }: { visible: boolean; onClose: () => void; share: GameShare }) {
  const tr = useT();
  const toast = useToast();
  const c = useAppTheme().colors;
  // Shown when the browser blocks the clipboard (a page on plain http): the text to copy by hand.
  const [byHand, setByHand] = useState<string | null>(null);
  // "Add to collection" swaps the sheet's content rather than stacking a second sheet on it.
  const [collecting, setCollecting] = useState<CollectableGame | null>(null);
  const close = () => {
    setByHand(null);
    setCollecting(null);
    onClose();
  };
  // Built only while open: the header re-renders with every clock tick.
  const url = visible ? appLink(share.link) : '';
  const sheet = sharesWithSheet();

  // The toast shows over the screen, so the sheet closes first.
  const done = (title: string) => {
    close();
    toast.show({ title, tone: 'success', duration: 2000 });
  };

  const copyPgn = async () => {
    if (!share.pgn) return;
    let pgn: string;
    try {
      pgn = share.pgn();
    } catch {
      toast.show({ title: tr('share.failed'), tone: 'danger' });
      return;
    }
    if (await copyText(pgn)) done(tr('share.pgnCopied'));
    else setByHand(pgn);
  };

  const sendLink = async () => {
    // The share sheet opens over this one; it closes once something was shared.
    const r = await shareLink(url, tr(share.live ? 'share.messageLive' : 'share.message', { title: share.title }));
    if (r === 'copied') done(tr('share.linkCopied'));
    else if (r === 'shared') close();
    else if (r === 'failed') setByHand(url);
  };

  const collect = () => {
    let pgn: string | null = null;
    try {
      pgn = share.pgn ? share.pgn() : null;
    } catch {
      // Kept without its PGN: the link still opens the game.
    }
    setCollecting({ title: share.title, link: share.keepLink ?? share.link, pgn });
  };

  if (collecting) {
    return (
      <Modal
        visible={visible}
        onClose={close}
        title={tr('collections.addTitle')}
        description={share.title}
        presentation="sheet"
        actions={<Button variant="ghost" title={tr('common.back')} onPress={() => setCollecting(null)} />}>
        <CollectionPicker game={collecting} onDone={close} />
      </Modal>
    );
  }

  return (
    <Modal visible={visible} onClose={close} title={tr('share.title')} presentation="sheet" actions={<Button variant="ghost" title={tr('common.close')} onPress={close} />}>
      <ListGroup>
        <ListRow
          left={<RowIcon name="content-copy" />}
          title={tr('share.copyPgn')}
          subtitle={share.pgn ? tr('share.copyPgnBody') : (share.pgnNote ?? tr('share.pgnAfterGame'))}
          onPress={() => void copyPgn()}
          disabled={!share.pgn}
        />
        <ListRow
          left={<RowIcon name={sheet ? (Platform.OS === 'ios' ? 'export-variant' : 'share-variant') : 'link-variant'} />}
          title={sheet ? tr('share.shareLink') : tr('share.copyLink')}
          subtitle={url || undefined}
          onPress={() => void sendLink()}
        />
        <ListRow left={<RowIcon name="folder-star-outline" />} title={tr('collections.addTitle')} subtitle={tr('collections.addBody')} onPress={collect} chevron />
      </ListGroup>
      {byHand !== null && (
        <View style={{ gap: 8 }}>
          <Text tone="muted">{tr('share.copyByHand')}</Text>
          <View style={[styles.byHand, { borderColor: c.border, backgroundColor: c.surfaceSunken }]}>
            <Text selectable variant="caption" style={styles.mono}>
              {byHand}
            </Text>
          </View>
        </View>
      )}
    </Modal>
  );
}

function RowIcon({ name }: { name: GameIconName }) {
  const c = useAppTheme().colors;
  return (
    <View style={[styles.icon, { backgroundColor: c.surfaceSunken }]}>
      <GameIcon name={name} size={18} color={c.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  round: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  byHand: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12 },
  mono: { fontFamily: fonts.mono },
});
