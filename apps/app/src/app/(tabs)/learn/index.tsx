import Ionicons from '@expo/vector-icons/Ionicons';
import { LESSON_CREDITS, type Lesson } from '@chessmate/core';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Linking, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AdSpot } from '@/features/ads/AdSpot';
import { useLessonCatalog } from '@/features/learn/catalog';
import { lessonIcon, lessonPuzzleCount } from '@/features/learn/lessonView';
import { useLessonProgress, type ProgressMap } from '@/features/learn/progress';
import { dirIcon, useI18n, useT } from '@/i18n';
import { Badge, Button, GlassView, Row, Screen, SectionHeader, Stack, Text, useAppTheme } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Learn tab: lessons by chapter, with your progress on this device. */
export default function Learn() {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const { lang } = useI18n();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const { progress } = useLessonProgress();
  const { chapters, lessons } = useLessonCatalog();
  const done = lessons.filter((l) => progress[l.id]?.done).length;
  // Carry on where you left off, else the first lesson not finished yet.
  const resume = lessons.find((l) => !progress[l.id]?.done && (progress[l.id]?.step ?? 0) > 0) ?? lessons.find((l) => !progress[l.id]?.done);
  const open = (id: string) => router.push({ pathname: '/learn/[id]', params: { id } });

  return (
    <Screen scroll width="wide">
      <AdSpot spot="learn.list" />

      <GlassView strength="strong" padding="xl" radius="xl" style={{ gap: t.space.lg }}>
        <Row gap="md">
          <Circle icon="school" big />
          <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
            <Text variant="title">{tr('learn.title')}</Text>
            <Text tone="muted">{tr('learn.subtitle')}</Text>
          </Stack>
        </Row>
        <Stack gap="xs">
          <Text variant="caption" tone="muted">
            {tr('learn.progress', { done, total: lessons.length })}
          </Text>
          <View style={[styles.track, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
            <View style={[styles.fill, { width: `${lessons.length ? (done / lessons.length) * 100 : 0}%`, backgroundColor: c.text }]} />
          </View>
        </Stack>
        {resume ? (
          <Button
            title={done === 0 && !progress[resume.id] ? tr('learn.startFirst') : tr('learn.continueWith', { title: resume.title })}
            size="lg"
            fullWidth
            leftIcon={<Ionicons name="play" size={16} color={c.onAccent} />}
            onPress={() => open(resume.id)}
          />
        ) : (
          <Stack gap="sm">
            <Text>{tr('learn.allDone')}</Text>
            <Button title={tr('learn.openPuzzles')} size="lg" fullWidth onPress={() => router.push('/puzzles')} />
          </Stack>
        )}
        {lang !== 'en' ? (
          <Text variant="caption" tone="muted">
            {tr('learn.englishOnly')}
          </Text>
        ) : null}
      </GlassView>

      {chapters.map((chapter, i) => (
        <Stack key={chapter.id} gap="md">
          <SectionHeader index={i + 1} title={chapter.title} action={<Text variant="caption" tone="tertiary">{tr('learn.lessonCount', { count: chapter.lessons.length })}</Text>} />
          <Text tone="muted" style={{ marginTop: -t.space.sm }}>
            {chapter.blurb}
          </Text>
          <View style={styles.grid}>
            {chapter.lessons.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} progress={progress} wide={wide} onPress={() => open(lesson.id)} />
            ))}
          </View>
        </Stack>
      ))}

      {/* The Immortals: famous games to replay, a natural next step after the lessons. */}
      <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
        <Row gap="md">
          <Circle icon="infinite" />
          <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
            <Text variant="heading">{tr('immortals.learnCard.title')}</Text>
            <Text variant="caption" tone="muted">
              {tr('immortals.learnCard.body')}
            </Text>
          </Stack>
        </Row>
        <Button variant="secondary" title={tr('immortals.learnCard.open')} rightIcon={<Ionicons name={dirIcon('arrow-forward')} size={16} color={c.text} />} onPress={() => router.push('/immortals')} />
      </GlassView>

      <GlassView flat padding="lg" radius="lg" elevation="none" style={{ gap: t.space.sm }}>
        <Text variant="overline" tone="muted">
          {tr('learn.credits.title')}
        </Text>
        <Text variant="caption" tone="muted">
          {tr('learn.credits.body')}
        </Text>
        <Row gap="sm" style={{ flexWrap: 'wrap' }}>
          <Button size="sm" variant="ghost" title={tr('learn.credits.puzzles')} rightIcon={<Ionicons name="open-outline" size={14} color={c.text} />} onPress={() => void Linking.openURL(LESSON_CREDITS.puzzles.url)} />
          <Button size="sm" variant="ghost" title={tr('learn.credits.wikipedia')} rightIcon={<Ionicons name="open-outline" size={14} color={c.text} />} onPress={() => void Linking.openURL(LESSON_CREDITS.readMore.url)} />
        </Row>
      </GlassView>
    </Screen>
  );
}

function LessonCard({ lesson, progress, wide, onPress }: { lesson: Lesson; progress: ProgressMap; wide: boolean; onPress: () => void }) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const p = progress[lesson.id];
  const started = !p?.done && (p?.step ?? 0) > 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={lesson.title} onPress={onPress} style={{ flexGrow: 1, flexBasis: wide ? 300 : '100%' }}>
      {({ pressed }) => (
        <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm, flexGrow: 1, transform: [{ scale: pressed ? 0.985 : 1 }] }}>
          {pressed && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.surfacePressed }]} />}
          <Row gap="sm">
            <Circle icon={lessonIcon(lesson.icon)} />
            <Text variant="heading" style={{ flex: 1 }}>
              {lesson.title}
            </Text>
            {p?.done ? <Ionicons name="checkmark-circle" size={20} color={c.success} accessibilityLabel={tr('learn.done')} /> : <Ionicons name="chevron-forward" size={18} color={c.muted} />}
          </Row>
          <Text tone="muted">{lesson.summary}</Text>
          <Row gap="xs" style={{ flexWrap: 'wrap' }}>
            <Badge label={tr(`learn.level.${lesson.level}`)} tone="outline" />
            <Badge label={tr('learn.puzzleCount', { count: lessonPuzzleCount(lesson) })} />
            {started ? <Badge label={tr('learn.inProgress', { n: (p?.step ?? 0) + 1, total: lesson.steps.length })} tone="solid" /> : null}
          </Row>
        </GlassView>
      )}
    </Pressable>
  );
}

/** Monochrome icon in a glass circle, as on the puzzles screen. */
function Circle({ icon, big }: { icon: IconName; big?: boolean }) {
  const t = useAppTheme();
  const s = big ? 52 : 40;
  return (
    <View style={{ width: s, height: s, borderRadius: s / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surfaceSunken, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.glassBorder }}>
      <Ionicons name={icon} size={big ? 24 : 19} color={t.colors.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  track: { height: 8, borderRadius: 999, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  fill: { height: '100%', borderRadius: 999 },
});
