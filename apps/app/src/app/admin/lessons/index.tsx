import Ionicons from '@expo/vector-icons/Ionicons';
import type { AdminLesson, AdminLessonChapter } from '@chessmate/core';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, EmptyState, ErrorLine, PageHeader, Section, useLoad } from '@/features/admin/ui';
import { lessonIcon } from '@/features/learn/lessonView';
import { formatDateTime, useT } from '@/i18n';
import { Badge, Button, IconButton, Row, Stack, Text, TextField, useAppTheme, useToast } from '@/ui';

/** Lessons for the Learn tab: chapters in order, their lessons, drafts and published. */
export default function AdminLessons() {
  const c = useAppTheme().colors;
  const tr = useT();
  const { api } = useAdmin();
  const toast = useToast();
  const { data, setData, error, loading, reload } = useLoad(() => api.lessons(), [api]);
  const [chapterForm, setChapterForm] = useState<{ id: string; title: string; blurb: string; isNew: boolean } | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      const r = await fn();
      if (Array.isArray(r)) setData(r as AdminLessonChapter[]);
      else reload();
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : tr('admin.common.failed'), tone: 'danger' });
    }
  };
  const newLesson = (chapterId?: string) => router.push({ pathname: '/admin/lessons/[id]', params: { id: 'new', ...(chapterId ? { chapter: chapterId } : {}) } });

  return (
    <AdminPage onRefresh={reload} refreshing={loading && !!data}>
      <PageHeader
        title={tr('admin.nav.lessons')}
        subtitle={tr('admin.lessons.subtitle')}
        right={
          <Row gap="sm" wrap>
            <Button size="sm" variant="secondary" title={tr('admin.lessons.newChapter')} onPress={() => setChapterForm({ id: '', title: '', blurb: '', isNew: true })} />
            {data && data.length > 0 ? <Button size="sm" title={tr('admin.lessons.newLesson')} onPress={() => newLesson()} /> : null}
          </Row>
        }
      />
      <ErrorLine message={error} />
      {chapterForm ? (
        <ChapterForm
          value={chapterForm}
          onCancel={() => setChapterForm(null)}
          onSave={async (c) => {
            try {
              await api.saveLessonChapter({ id: c.id.trim(), title: c.title, blurb: c.blurb });
              setChapterForm(null);
              toast.show({ title: tr('admin.common.done'), tone: 'success' });
              reload();
            } catch (e) {
              toast.show({ title: e instanceof Error ? e.message : tr('admin.common.failed'), tone: 'danger' });
            }
          }}
        />
      ) : null}
      {data && data.length === 0 && !chapterForm ? <EmptyState icon="school-outline" title={tr('admin.lessons.empty')} body={tr('admin.lessons.emptyBody')} /> : null}
      {data?.map((chapter, i) => (
        <Section
          key={chapter.id}
          index={i + 1}
          title={chapter.title}
          padding="none"
          action={
            <Row gap="xxs">
              <IconButton icon={<Glyph name="arrow-up" />} size={32} variant="ghost" accessibilityLabel={tr('admin.lessons.moveUp')} disabled={i === 0} onPress={() => void run(() => api.moveLessonChapter(chapter.id, -1))} />
              <IconButton icon={<Glyph name="arrow-down" />} size={32} variant="ghost" accessibilityLabel={tr('admin.lessons.moveDown')} disabled={i === data.length - 1} onPress={() => void run(() => api.moveLessonChapter(chapter.id, 1))} />
              <IconButton icon={<Glyph name="create-outline" />} size={32} variant="ghost" accessibilityLabel={tr('admin.lessons.editChapter')} onPress={() => setChapterForm({ id: chapter.id, title: chapter.title, blurb: chapter.blurb, isNew: false })} />
              <IconButton
                icon={<Glyph name="trash-outline" />}
                size={32}
                variant="ghost"
                accessibilityLabel={chapter.lessons.length ? tr('admin.lessons.chapterNotEmpty') : tr('admin.lessons.deleteChapter')}
                disabled={chapter.lessons.length > 0}
                onPress={() => void run(() => api.deleteLessonChapter(chapter.id))}
              />
            </Row>
          }>
          <Stack>
            {chapter.blurb ? (
              <Text tone="muted" style={styles.blurb}>
                {chapter.blurb}
              </Text>
            ) : null}
            {chapter.lessons.length === 0 ? (
              <Text tone="tertiary" style={styles.blurb}>
                {tr('admin.lessons.noLessons')}
              </Text>
            ) : null}
            {chapter.lessons.map((l, j) => (
              <LessonRow
                key={l.id}
                lesson={l}
                first={j === 0}
                last={j === chapter.lessons.length - 1}
                onMove={(delta) => void run(() => api.moveLesson(l.id, delta))}
              />
            ))}
            <View style={styles.footer}>
              <Button size="sm" variant="ghost" title={tr('admin.lessons.newLesson')} leftIcon={<Ionicons name="add" size={16} color={c.text} />} onPress={() => newLesson(chapter.id)} />
            </View>
          </Stack>
        </Section>
      ))}
    </AdminPage>
  );
}

function LessonRow({ lesson, first, last, onMove }: { lesson: AdminLesson; first: boolean; last: boolean; onMove: (delta: number) => void }) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const open = () => router.push({ pathname: '/admin/lessons/[id]', params: { id: lesson.id } });
  return (
    <View style={[styles.row, { borderTopColor: c.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${tr('admin.lessons.edit')}: ${lesson.title}`} onPress={open} style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}>
        <Ionicons name={lessonIcon(lesson.icon)} size={20} color={c.text} />
        <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label" numberOfLines={1}>
            {lesson.title}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {`${lesson.id} · ${tr('admin.lessons.steps', { count: lesson.steps.length })} · ${tr('admin.lessons.updated', { when: formatDateTime(lesson.updatedAt) })}${lesson.updatedBy ? ` · ${lesson.updatedBy}` : ''}`}
          </Text>
        </Stack>
        <Badge label={lesson.published ? tr('admin.lessons.published') : tr('admin.lessons.draft')} tone={lesson.published ? 'outline' : 'solid'} />
      </Pressable>
      <Row gap="xxs">
        <IconButton icon={<Glyph name="arrow-up" />} size={32} variant="ghost" accessibilityLabel={tr('admin.lessons.moveUp')} disabled={first} onPress={() => onMove(-1)} />
        <IconButton icon={<Glyph name="arrow-down" />} size={32} variant="ghost" accessibilityLabel={tr('admin.lessons.moveDown')} disabled={last} onPress={() => onMove(1)} />
      </Row>
    </View>
  );
}

function ChapterForm({ value, onSave, onCancel }: { value: { id: string; title: string; blurb: string; isNew: boolean }; onSave: (c: { id: string; title: string; blurb: string }) => Promise<void>; onCancel: () => void }) {
  const tr = useT();
  const [id, setId] = useState(value.id);
  const [title, setTitle] = useState(value.title);
  const [blurb, setBlurb] = useState(value.blurb);
  const [busy, setBusy] = useState(false);
  return (
    <Section title={value.isNew ? tr('admin.lessons.newChapter') : tr('admin.lessons.editChapter')}>
      <Stack gap="md">
        {value.isNew ? <TextField label={tr('admin.lessons.chapterId')} value={id} onChangeText={setId} autoCapitalize="none" autoCorrect={false} maxLength={48} /> : null}
        <TextField label={tr('admin.lessons.chapterTitle')} value={title} onChangeText={setTitle} maxLength={80} />
        <TextField label={tr('admin.lessons.chapterBlurb')} value={blurb} onChangeText={setBlurb} maxLength={300} multiline />
        <Row gap="sm">
          <Button
            size="sm"
            title={tr('admin.common.save')}
            loading={busy}
            disabled={!id.trim() || !title.trim()}
            onPress={() => {
              setBusy(true);
              void onSave({ id, title, blurb }).finally(() => setBusy(false));
            }}
          />
          <Button size="sm" variant="ghost" title={tr('admin.common.cancel')} onPress={onCancel} />
        </Row>
      </Stack>
    </Section>
  );
}

const styles = StyleSheet.create({
  blurb: { paddingHorizontal: 16, paddingTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  footer: { paddingHorizontal: 8, paddingVertical: 8, alignItems: 'flex-start' },
});

/** Icon for an IconButton, in the text colour of the current theme. */
function Glyph({ name }: { name: ComponentProps<typeof Ionicons>['name'] }) {
  return <Ionicons name={name} size={18} color={useAppTheme().colors.text} />;
}
