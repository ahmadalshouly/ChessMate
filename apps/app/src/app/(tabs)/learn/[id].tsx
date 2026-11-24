import Ionicons from '@expo/vector-icons/Ionicons';
import { lessonById, lichessPuzzleUrl, nextLesson, type Lesson, type LessonExplainStep, type LessonPuzzleStep } from '@chessmate/core';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Board } from '@/components/Board';
import { PuzzleBoard } from '@/components/PuzzleBoard';
import { LESSON_ARROW_COLORS, lessonArrows } from '@/features/learn/lessonView';
import { completeLesson, saveLessonStep, useLessonProgress } from '@/features/learn/progress';
import { dirIcon, useT } from '@/i18n';
import { puzzleThemeLabel } from '@/i18n/chess';
import { NO_SWIPE_BACK, useNoSwipeBack } from '@/lib/useNoSwipeBack';
import { usePuzzle } from '@/lib/usePuzzle';
import { SIDEBAR_BREAKPOINT, SIDEBAR_WIDTH } from '@/navigation/tabs';
import { useFillHeight, useWideBoard } from '@/lib/useWideBoard';
import { Button, GlassView, Row, Screen, Stack as Column, Text, useAppTheme } from '@/ui';

/** Width of the panel beside the board on wide screens (as on the puzzle screens). */
const PANEL_WIDE = 380;

/**
 * One lesson: explanation pages on example positions, then practice puzzles
 * from the Lichess database, then a summary with links to more practice.
 * Progress is kept on the device, so a lesson reopens on the step it was left on.
 */
export default function LessonScreen() {
  const tr = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const lesson = id ? lessonById(id) : undefined;
  if (!lesson) {
    return (
      <Screen scroll>
        <Stack.Screen options={{ title: tr('learn.title') }} />
        <GlassView padding="xl" radius="xl" style={{ gap: 12 }}>
          <Text variant="heading">{tr('learn.notFound')}</Text>
          <Button title={tr('learn.finished.all')} onPress={() => router.dismissTo('/learn')} />
        </GlassView>
      </Screen>
    );
  }
  // Keyed by lesson, so "next lesson" starts fresh.
  return <LessonPlayer key={lesson.id} lesson={lesson} />;
}

function LessonPlayer({ lesson }: { lesson: Lesson }) {
  const t = useAppTheme();
  const { progress, loaded } = useLessonProgress();
  const [chosen, setStep] = useState<number | null>(null);
  // A puzzle that was failed can be tried again from the start.
  const [attempt, setAttempt] = useState(0);
  // Dragging a piece must never swipe the lesson away.
  useNoSwipeBack();
  const { wide, size: fit } = useWideBoard({ panel: PANEL_WIDE, reserve: 116, phoneReserve: 340, sidebar: true });
  // The panel beside the board is a fixed width (as in PuzzleBoard), so leave room for it, the gap and the page padding.
  const { width } = useWindowDimensions();
  const content = width >= SIDEBAR_BREAKPOINT ? width - SIDEBAR_WIDTH : width;
  const size = wide ? Math.max(240, Math.min(fit, Math.floor((content - PANEL_WIDE - 24 - 80) / 8) * 8)) : fit;
  const total = lesson.steps.length;

  // Until a step is picked, resume where the lesson was left (once progress is read from storage).
  const saved = progress[lesson.id];
  const step = chosen ?? (loaded ? (saved && !saved.done ? Math.min(saved.step, total - 1) : 0) : null);

  const go = (n: number) => {
    setAttempt(0);
    setStep(n);
    if (n >= total) completeLesson(lesson.id);
    else saveLessonStep(lesson.id, n);
  };

  const current = step !== null && step < total ? lesson.steps[step] : null;

  const header = <Stack.Screen options={{ title: lesson.title, ...NO_SWIPE_BACK }} />;
  if (step !== null && !current) {
    return (
      <Screen scroll>
        {header}
        <Finished lesson={lesson} onRestart={() => go(0)} />
      </Screen>
    );
  }

  return (
    <Screen width="full">
      {header}
      {step === null || !current ? (
        <View style={styles.center}>
          <ActivityIndicator color={t.colors.text} />
        </View>
      ) : current.kind === 'explain' ? (
        <ExplainStep key={step} step={current} index={step} total={total} size={size} wide={wide} onBack={step > 0 ? () => go(step - 1) : undefined} onNext={() => go(step + 1)} />
      ) : (
        <PracticeStep
          key={`${step}:${attempt}`}
          step={current}
          index={step}
          total={total}
          size={size}
          wide={wide}
          onBack={step > 0 ? () => go(step - 1) : undefined}
          onNext={() => go(step + 1)}
          onRetry={() => setAttempt((a) => a + 1)}
        />
      )}
    </Screen>
  );
}

/** Board on top (phones) or to the side (wide screens), with the panel scrolling. */
function BoardWithPanel({ board, panel, size, wide }: { board: ReactNode; panel: ReactNode; size: number; wide: boolean }) {
  const [fillH, onFill] = useFillHeight();
  return (
    <View style={[styles.screen, wide && styles.screenWide]} onLayout={onFill}>
      <View style={[styles.fixed, { width: size }]}>{board}</View>
      <ScrollView
        style={wide ? [styles.scrollWide, { height: fillH }] : styles.scroll}
        contentContainerStyle={wide ? styles.scrollContentWide : styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={{ width: wide ? PANEL_WIDE : size, gap: 12 }}>{panel}</View>
      </ScrollView>
    </View>
  );
}

/** "Idea · Step 2 of 7" with one segment per step, puzzles marked. */
function StepHeader({ kind, index, total }: { kind: 'explain' | 'puzzle'; index: number; total: number }) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  return (
    <Column gap="sm">
      <Row gap="xs">
        <Ionicons name={kind === 'explain' ? 'bulb-outline' : 'extension-puzzle-outline'} size={14} color={c.muted} />
        <Text variant="overline" tone="muted" style={{ flex: 1 }}>
          {kind === 'explain' ? tr('learn.idea') : tr('learn.practice')}
        </Text>
        <Text variant="caption" tone="muted">
          {tr('learn.stepOf', { n: index + 1, total })}
        </Text>
      </Row>
      {/* Steps run left to right in every language, like a timeline. */}
      <View style={[styles.segments, { direction: 'ltr' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.segment, { backgroundColor: i <= index ? c.text : c.surfaceSunken, borderColor: c.border }]} />
        ))}
      </View>
    </Column>
  );
}

function ExplainStep({
  step,
  index,
  total,
  size,
  wide,
  onBack,
  onNext,
}: {
  step: LessonExplainStep;
  index: number;
  total: number;
  size: number;
  wide: boolean;
  onBack?: () => void;
  onNext: () => void;
}) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const arrows = useMemo(() => lessonArrows(step.arrows), [step.arrows]);
  const orientation = step.orientation ?? (step.fen.split(' ')[1] === 'b' ? 'b' : 'w');
  const tones = [...new Set((step.arrows ?? []).map((a) => a.tone ?? 'move'))];
  const many = (step.highlights?.length ?? 0) > 6;
  return (
    <BoardWithPanel
      size={size}
      wide={wide}
      board={
        <Board
          fen={step.fen}
          orientation={orientation}
          size={size}
          arrows={arrows}
          // A few key squares get rings; an area (the square of a pawn) gets a tint.
          ringed={many ? undefined : step.highlights}
          highlighted={many ? step.highlights : undefined}
          sound={false}
        />
      }
      panel={
        <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
          <StepHeader kind="explain" index={index} total={total} />
          <Text variant="heading">{step.title}</Text>
          <Text style={{ lineHeight: 22 }}>{step.body}</Text>
          {tones.length > 0 ? (
            <Row gap="md" style={{ flexWrap: 'wrap' }}>
              {tones.map((tone) => (
                <Row key={tone} gap="xs">
                  <View style={[styles.swatch, { backgroundColor: LESSON_ARROW_COLORS[tone] }]} />
                  <Text variant="caption" tone="muted">
                    {tr(`learn.legend.${tone}`)}
                  </Text>
                </Row>
              ))}
            </Row>
          ) : null}
          <Row gap="sm">
            {onBack ? (
              <View style={styles.flex}>
                <Button variant="secondary" fullWidth title={tr('learn.back')} onPress={onBack} />
              </View>
            ) : null}
            <View style={styles.flex}>
              <Button fullWidth title={tr('learn.next')} rightIcon={<Ionicons name={dirIcon('arrow-forward')} size={16} color={c.onAccent} />} onPress={onNext} />
            </View>
          </Row>
        </GlassView>
      }
    />
  );
}

function PracticeStep({
  step,
  index,
  total,
  size,
  wide,
  onBack,
  onNext,
  onRetry,
}: {
  step: LessonPuzzleStep;
  index: number;
  total: number;
  size: number;
  wide: boolean;
  onBack?: () => void;
  onNext: () => void;
  onRetry: () => void;
}) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const view = usePuzzle(step.puzzle);
  const over = view.feedback === 'solved' || view.feedback === 'failed';
  return (
    <PuzzleBoard
      view={view}
      puzzle={step.puzzle}
      size={size}
      wide={wide}
      showRating={false}
      rated={false}
      below={
        <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
          <StepHeader kind="puzzle" index={index} total={total} />
          <Text variant="subheading">{step.prompt}</Text>
          <Row gap="sm">
            {onBack ? (
              <View style={styles.flex}>
                <Button variant="secondary" fullWidth title={tr('learn.back')} onPress={onBack} />
              </View>
            ) : null}
            <View style={styles.flex}>
              <Button
                variant={over ? 'primary' : 'secondary'}
                fullWidth
                title={over ? tr('learn.continue') : tr('learn.next')}
                rightIcon={<Ionicons name={dirIcon('arrow-forward')} size={16} color={over ? c.onAccent : c.text} />}
                onPress={onNext}
              />
            </View>
          </Row>
          {view.feedback === 'failed' ? <Button variant="ghost" title={tr('learn.tryAgain')} leftIcon={<Ionicons name="refresh" size={16} color={c.text} />} onPress={onRetry} /> : null}
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(lichessPuzzleUrl(step.puzzle.id))}>
            <Text variant="caption" tone="muted">
              {tr('learn.puzzleSource', { id: step.puzzle.id })}
            </Text>
          </Pressable>
        </GlassView>
      }
    />
  );
}

function Finished({ lesson, onRestart }: { lesson: Lesson; onRestart: () => void }) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const next = nextLesson(lesson.id);
  const theme = puzzleThemeLabel(lesson.practiceTheme);
  return (
    <>
      <GlassView strength="strong" padding="xl" radius="xl" style={{ gap: t.space.lg }}>
        <View style={[styles.doneIcon, { backgroundColor: c.successSoft, borderColor: c.success }]}>
          <Ionicons name="checkmark-done" size={26} color={c.success} />
        </View>
        <Column gap="xs">
          <Text variant="title">{tr('learn.finished.title')}</Text>
          <Text tone="muted">{tr('learn.finished.body', { title: lesson.title })}</Text>
        </Column>
        <Column gap="sm">
          {next ? (
            <Text variant="caption" tone="muted">
              {tr('learn.finished.upNext', { title: next.title })}
            </Text>
          ) : null}
          {next ? (
            <Button
              size="lg"
              fullWidth
              title={tr('learn.finished.next')}
              rightIcon={<Ionicons name={dirIcon('arrow-forward')} size={16} color={c.onAccent} />}
              onPress={() => router.replace({ pathname: '/learn/[id]', params: { id: next.id } })}
            />
          ) : null}
          <Button
            variant={next ? 'secondary' : 'primary'}
            size="lg"
            fullWidth
            title={tr('learn.finished.practiceMore', { theme })}
            leftIcon={<Ionicons name="extension-puzzle-outline" size={16} color={next ? c.text : c.onAccent} />}
            onPress={() => router.push({ pathname: '/puzzles/train', params: { theme: lesson.practiceTheme } })}
          />
          <Row gap="sm">
            <View style={styles.flex}>
              <Button variant="ghost" fullWidth title={tr('learn.finished.all')} onPress={() => router.dismissTo('/learn')} />
            </View>
            <View style={styles.flex}>
              <Button variant="ghost" fullWidth title={tr('learn.finished.restart')} onPress={onRestart} />
            </View>
          </Row>
        </Column>
      </GlassView>
      {lesson.readMore.length > 0 ? (
        <GlassView flat padding="lg" radius="lg" elevation="none" style={{ gap: t.space.sm }}>
          <Text variant="overline" tone="muted">
            {tr('learn.readMore')}
          </Text>
          {lesson.readMore.map((r) => (
            <Pressable key={r.url} accessibilityRole="link" onPress={() => void Linking.openURL(r.url)}>
              <Row gap="xs">
                <Ionicons name="open-outline" size={14} color={c.muted} />
                <Text variant="label">{r.title}</Text>
              </Row>
            </Pressable>
          ))}
        </GlassView>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1, alignItems: 'center' },
  screenWide: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 24, paddingHorizontal: 16, minHeight: 0 },
  scrollWide: { flexGrow: 0, width: PANEL_WIDE, alignSelf: 'stretch' },
  scrollContentWide: { paddingTop: 12, paddingBottom: 32 },
  fixed: { gap: 12, paddingTop: 12 },
  scroll: { flex: 1, alignSelf: 'stretch' },
  scrollContent: { alignItems: 'center', paddingTop: 12, paddingHorizontal: 12, paddingBottom: 32 },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth },
  swatch: { width: 14, height: 4, borderRadius: 2 },
  doneIcon: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
