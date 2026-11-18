import { Game, START_FEN, type Color, type PlayedMove } from '@chessmate/core';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Board } from '@/components/Board';
import type { GameAction } from '@/components/game/ActionBar';
import { GameLayout } from '@/components/game/GameLayout';
import { MoveStrip } from '@/components/game/MoveStrip';
import { ConfirmPanel, BoardNotice, NoticeButton, OptionsPanel, type OptionItem } from '@/components/game/Panels';
import { PlayerCard } from '@/components/game/PlayerCard';
import { useHistoryNav } from '@/components/game/useHistoryNav';
import { reasonText } from '@/components/play/GameOverCard';
import { Screen } from '@/components/ui';
import { useMoveFeedback } from '@/lib/feedback';
import { checkSquareOf, useBoardInteraction } from '@/lib/useBoardInteraction';
import { saveGame } from '@/lib/archive';
import { practiceGame } from '@/lib/recordGame';
import { dirIcon, useT } from '@/i18n';
import { colorLabel } from '@/i18n/chess';

/**
 * Pass-and-play practice board. Runs fully on device so it works offline.
 * Like every game screen, no engine help while playing: the engine review
 * opens when the game ends.
 */
export default function LocalPlay() {
  const tr = useT();
  const game = useRef(new Game());
  const [view, setView] = useState<{ fen: string; history: PlayedMove[] }>(() => ({ fen: new Game().fen, history: [] }));
  const [flip, setFlip] = useState(false);
  const [panel, setPanel] = useState<'more' | 'undo' | null>(null);
  const toggle = (p: 'more' | 'undo') => setPanel((cur) => (cur === p ? null : p));
  const confirmThen = (fn: () => void) => () => {
    setPanel(null);
    fn();
  };

  const sync = () => setView({ fen: game.current.fen, history: game.current.history() });
  const play = (uci: string) => {
    const ok = !!game.current.move(uci);
    if (ok) sync();
    return ok;
  };

  const snapshot = useMemo(() => new Game(view.fen), [view.fen]);
  const outcome = useMemo(() => (view.history.length ? Game.fromUciMoves(view.history.map((m) => m.uci)).boardOutcome() : null), [view.history]);
  const interaction = useBoardInteraction(view.fen, () => !outcome, play);
  useMoveFeedback(view.history, !!outcome);
  const { history } = view;
  const nav = useHistoryNav(history.length);

  // Practice games are saved to the archive when they end, or on request.
  const session = useRef({ id: `pr_${Date.now().toString(36)}`, startedAt: Date.now() });
  const [savedId, setSavedId] = useState<string | null>(null);
  const save = () => {
    void saveGame(practiceGame(session.current.id, history, outcome, session.current.startedAt));
    setSavedId(session.current.id);
  };
  useEffect(() => {
    if (outcome) save();
  }, [outcome]); // eslint-disable-line react-hooks/exhaustive-deps

  const undo = () => {
    game.current.undo();
    interaction.clear();
    nav.toLive();
    sync();
  };
  const openReview = () => router.push({ pathname: '/review', params: { moves: history.map((m) => m.uci).join(','), orientation: flip ? 'b' : 'w' } });

  const orientation: Color = flip ? 'b' : 'w';
  const top: Color = orientation === 'w' ? 'b' : 'w';
  const shownMove = nav.shown > 0 ? history[nav.shown - 1] : undefined;
  const boardFen = nav.live ? view.fen : (shownMove?.fenAfter ?? START_FEN);
  const lastShown = nav.live ? history[history.length - 1] : shownMove;
  const side = colorLabel(snapshot.turn);

  const card = (c: Color) => (
    <PlayerCard
      player={{ id: `g_${c}`, name: colorLabel(c), rating: 0, provisional: false }}
      subtitle={tr('titles.practice')}
      status={!outcome && snapshot.turn === c ? tr('game.player.toMove') : null}
      active={!outcome && snapshot.turn === c}
      pressable={false}
    />
  );

  const actions: GameAction[] = [
    outcome
      ? { key: 'review', icon: 'chart-box-outline', label: tr('game.action.review'), onPress: openReview }
      : { key: 'undo', icon: 'undo-variant', label: tr('practice.undo'), onPress: () => toggle('undo'), active: panel === 'undo', disabled: history.length === 0 },
    { key: 'more', icon: 'dots-horizontal', label: tr('game.action.more'), onPress: () => toggle('more'), active: panel === 'more' },
    { key: 'flip', icon: 'swap-vertical', label: tr('game.action.flip'), onPress: () => setFlip((f) => !f) },
    { key: 'back', icon: dirIcon('chevron-left'), label: tr('game.action.back'), onPress: nav.back, disabled: !nav.canBack, repeat: true },
    { key: 'forward', icon: dirIcon('chevron-right'), label: tr('game.action.forward'), onPress: nav.forward, disabled: !nav.canForward, repeat: true },
  ];
  const moreItems: OptionItem[] = [
    ...(!outcome && history.length > 0 ? [{ key: 'save', icon: 'content-save-outline' as const, label: savedId ? tr('practice.updateSaved') : tr('game.more.save'), onPress: save }] : []),
    ...(savedId ? [{ key: 'history', icon: 'history' as const, label: tr('game.more.reviewHistory'), onPress: () => router.push({ pathname: '/games/[id]', params: { id: savedId } }) }] : []),
    ...(history.length > 0 ? [{ key: 'review', icon: 'chart-box-outline' as const, label: tr('play.engineReview'), onPress: openReview, disabled: !outcome }] : []),
  ];

  return (
    <Screen>
      <GameLayout
        top={card(top)}
        bottom={card(orientation)}
        renderBoard={(size) => (
          <Board
            fen={boardFen}
            orientation={orientation}
            size={size}
            selected={nav.live ? interaction.selected : null}
            targets={nav.live ? interaction.targets : []}
            lastMove={lastShown ? { from: lastShown.from, to: lastShown.to } : null}
            checkSquare={checkSquareOf(boardFen)}
            onSquarePress={nav.live ? interaction.onSquarePress : undefined}
            {...(nav.live ? interaction.dragProps : {})}
          />
        )}
        strip={<MoveStrip sans={history.map((m) => m.san)} shown={nav.shown} onSelect={nav.goTo} onLive={nav.toLive} />}
        notices={
          nav.live && outcome ? (
            <BoardNotice icon="trophy-outline" text={`${outcome.result} · ${reasonText(outcome.reason)}`} strong>
              <NoticeButton icon="chart-box-outline" label={tr('game.action.review')} onPress={openReview} primary />
            </BoardNotice>
          ) : nav.live && snapshot.inCheck ? (
            <BoardNotice icon="alert-outline" text={tr('practice.toMoveInCheck', { color: side })} />
          ) : null
        }
        onDismissPopover={() => setPanel(null)}
        popover={
          panel === 'more' ? (
            <OptionsPanel
              title={tr('game.more.title')}
              onClose={() => setPanel(null)}
              items={(moreItems.length ? moreItems : [{ key: 'flip', icon: 'swap-vertical' as const, label: tr('game.more.flip'), onPress: () => setFlip((f) => !f) }]).map((it) => ({
                ...it,
                onPress: confirmThen(it.onPress),
              }))}
            />
          ) : panel === 'undo' ? (
            <ConfirmPanel icon="undo-variant" title={tr('game.confirm.undoTitle')} confirmLabel={tr('game.confirm.undo')} onConfirm={confirmThen(undo)} onCancel={() => setPanel(null)} />
          ) : null
        }
        actions={actions}
      />
    </Screen>
  );
}
