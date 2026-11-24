import Ionicons from '@expo/vector-icons/Ionicons';
import { PUZZLE_THEME_GROUPS, checkLessonFen, puzzleFen, startPuzzle, type AdminLessonChapter, type PuzzleDto } from '@chessmate/core';
import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, View, useWindowDimensions } from 'react-native';

import { Board } from '@/components/Board';
import { Segmented } from '@/components/play/Controls';
import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, ErrorLine, PageHeader, Section } from '@/features/admin/ui';
import {
  draftFromLesson,
  draftProblems,
  emptyLesson,
  lessonInputFrom,
  moveItem,
  newExplainStep,
  newPuzzleStep,
  previewStep,
  type ExplainDraft,
  type LessonDraft,
  type PuzzleDraft,
  type StepDraft,
} from '@/features/learn/lessonEditor';
import { lessonArrows, lessonIcon } from '@/features/learn/lessonView';
import { useT } from '@/i18n';
import { puzzleThemeLabel } from '@/i18n/chess';
import { Badge, Button, Chip, GlassView, IconButton, Row, Stack, Switch, Text, TextField, useAppTheme, useToast } from '@/ui';
import { goBack } from '@/lib/goBack';

const ALL_THEMES = PUZZLE_THEME_GROUPS.flatMap((g) => Object.keys(g.themes));

/** Write or edit one lesson: its details, then explanation and puzzle steps with live boards. */
export default function AdminLessonEditor() {
  const { colors } = useAppTheme();
  const tr = useT();
  const { api } = useAdmin();
  const toast = useToast();
  const params = useLocalSearchParams<{ id: string; chapter?: string }>();
  const isNew = params.id === 'new';
  const [chapters, setChapters] = useState<AdminLessonChapter[] | null>(null);
  const [draft, setDraft] = useState<LessonDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [armDelete, setArmDelete] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .lessons()
      .then((list) => {
        if (!live) return;
        setChapters(list);
        if (isNew) return setDraft(emptyLesson(params.chapter && list.some((c) => c.id === params.chapter) ? params.chapter : (list[0]?.id ?? '')));
        const found = list.flatMap((c) => c.lessons).find((l) => l.id === params.id);
        if (found) setDraft(draftFromLesson(found));
        else setMissing(true);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [api, isNew, params.id, params.chapter]);

  const problems = useMemo(() => (draft ? draftProblems(draft) : new Map<string, string>()), [draft]);
  const patch = (p: Partial<LessonDraft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const patchStep = (key: string, p: Partial<ExplainDraft> | Partial<PuzzleDraft>) => setDraft((d) => (d ? { ...d, steps: d.steps.map((s) => (s.key === key ? ({ ...s, ...p } as StepDraft) : s)) } : d));

  const save = async () => {
    if (!draft) return;
    if (problems.size) return setError(tr('admin.lessons.editor.fixFirst'));
    setBusy(true);
    setError(null);
    try {
      const input = lessonInputFrom(draft);
      const saved = isNew ? await api.createLesson(input) : await api.saveLesson(input);
      toast.show({ title: tr('admin.lessons.editor.saved'), tone: 'success' });
      if (isNew) router.replace({ pathname: '/admin/lessons/[id]', params: { id: saved.id } });
      else setDraft(draftFromLesson(saved));
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('admin.common.failed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft) return;
    if (!armDelete) return setArmDelete(true);
    setBusy(true);
    try {
      await api.deleteLesson(draft.id);
      toast.show({ title: tr('admin.lessons.editor.deleted'), tone: 'success' });
      router.replace('/admin/lessons');
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('admin.common.failed'));
      setBusy(false);
    }
  };

  const title = isNew ? tr('admin.lessons.editor.titleNew') : (draft?.title ?? '');
  const back = <Button size="sm" variant="ghost" title={tr('admin.lessons.editor.back')} onPress={() => goBack('/admin/lessons')} />;

  if (missing) {
    return (
      <AdminPage>
        <RouterStack.Screen options={{ title: tr('admin.nav.lessons'), headerShown: true }} />
        <PageHeader title={tr('admin.nav.lessons')} subtitle={tr('admin.lessons.editor.notFound')} right={back} />
      </AdminPage>
    );
  }
  if (!draft || !chapters) {
    return (
      <AdminPage>
        <RouterStack.Screen options={{ title: tr('admin.nav.lessons'), headerShown: true }} />
        <ErrorLine message={error} />
        {!error ? <ActivityIndicator /> : null}
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <RouterStack.Screen options={{ title: title || tr('admin.nav.lessons'), headerShown: true }} />
      <PageHeader title={title || tr('admin.lessons.editor.titleNew')} subtitle={isNew ? undefined : draft.id} right={back} />

      <Section title={tr('admin.lessons.editor.basics')} index={1}>
        <Stack gap="md">
          {isNew ? <TextField label={tr('admin.lessons.editor.id')} helper={tr('admin.lessons.editor.idHint')} value={draft.id} onChangeText={(id) => patch({ id })} autoCapitalize="none" autoCorrect={false} maxLength={48} /> : null}
          <TextField label={tr('admin.lessons.editor.title')} value={draft.title} onChangeText={(v) => patch({ title: v })} maxLength={80} />
          <TextField label={tr('admin.lessons.editor.summary')} value={draft.summary} onChangeText={(summary) => patch({ summary })} maxLength={200} multiline />
          <Labeled label={tr('admin.lessons.editor.chapter')}>
            <Row gap="xs" wrap>
              {chapters.map((c) => (
                <Chip key={c.id} label={c.title} selected={draft.chapterId === c.id} onPress={() => patch({ chapterId: c.id })} />
              ))}
            </Row>
          </Labeled>
          <Labeled label={tr('admin.lessons.editor.level')}>
            <Segmented<LessonDraft['level']>
              size="sm"
              value={draft.level}
              onChange={(level) => patch({ level })}
              options={[
                { value: 'beginner', label: tr('learn.level.beginner') },
                { value: 'intermediate', label: tr('learn.level.intermediate') },
              ]}
            />
          </Labeled>
          <TextField
            label={tr('admin.lessons.editor.icon')}
            value={draft.icon}
            onChangeText={(icon) => patch({ icon })}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={40}
            left={<Ionicons name={lessonIcon(draft.icon.trim())} size={18} color={colors.text} />}
          />
          <Labeled label={`${tr('admin.lessons.editor.practiceTheme')}: ${draft.practiceTheme ? puzzleThemeLabel(draft.practiceTheme) : tr('admin.lessons.editor.practiceNone')}`}>
            <ThemePicker value={draft.practiceTheme} onChange={(practiceTheme) => patch({ practiceTheme })} allowNone />
          </Labeled>
          <Row gap="md" justify="space-between">
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="label">{tr('admin.lessons.editor.published')}</Text>
              <Text variant="caption" tone="muted">
                {tr('admin.lessons.editor.publishedHint')}
              </Text>
            </Stack>
            <Switch value={draft.published} onValueChange={(published) => patch({ published })} accessibilityLabel={tr('admin.lessons.editor.published')} />
          </Row>
          <Labeled label={tr('admin.lessons.editor.readMore')}>
            <Stack gap="sm">
              {draft.readMore.map((link, i) => (
                <Row key={i} gap="sm" wrap>
                  <View style={{ flex: 1, minWidth: 160 }}>
                    <TextField placeholder={tr('admin.lessons.editor.linkTitle')} value={link.title} onChangeText={(v) => patch({ readMore: draft.readMore.map((l, j) => (j === i ? { ...l, title: v } : l)) })} maxLength={80} />
                  </View>
                  <View style={{ flex: 2, minWidth: 200 }}>
                    <TextField placeholder={tr('admin.lessons.editor.linkUrl')} value={link.url} onChangeText={(v) => patch({ readMore: draft.readMore.map((l, j) => (j === i ? { ...l, url: v } : l)) })} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
                  </View>
                  <IconButton icon={<Glyph name="close" />} size={36} variant="ghost" accessibilityLabel={tr('admin.lessons.editor.remove')} onPress={() => patch({ readMore: draft.readMore.filter((_, j) => j !== i) })} />
                </Row>
              ))}
              {draft.readMore.length < 5 ? (
                <View style={{ alignItems: 'flex-start' }}>
                  <Button size="sm" variant="ghost" title={tr('admin.lessons.editor.addLink')} onPress={() => patch({ readMore: [...draft.readMore, { title: '', url: 'https://' }] })} />
                </View>
              ) : null}
            </Stack>
          </Labeled>
        </Stack>
      </Section>

      <Stack gap="md">
        <Text variant="overline" tone="muted">
          {tr('admin.lessons.editor.steps')}
        </Text>
        {draft.steps.map((s, i) => (
          <GlassView key={s.key} radius="lg" padding="lg" flat>
            <Stack gap="md">
              <Row gap="sm" justify="space-between">
                <Row gap="sm" style={{ flex: 1 }}>
                  <Badge label={`${i + 1}`} tone="solid" />
                  <Text variant="label">{s.kind === 'explain' ? tr('admin.lessons.editor.explain') : tr('admin.lessons.editor.puzzle')}</Text>
                </Row>
                <Row gap="xxs">
                  <IconButton icon={<Glyph name="arrow-up" />} size={32} variant="ghost" accessibilityLabel={tr('admin.lessons.moveUp')} disabled={i === 0} onPress={() => patch({ steps: moveItem(draft.steps, i, -1) })} />
                  <IconButton icon={<Glyph name="arrow-down" />} size={32} variant="ghost" accessibilityLabel={tr('admin.lessons.moveDown')} disabled={i === draft.steps.length - 1} onPress={() => patch({ steps: moveItem(draft.steps, i, 1) })} />
                  <IconButton icon={<Glyph name="trash-outline" />} size={32} variant="ghost" accessibilityLabel={tr('admin.lessons.editor.remove')} disabled={draft.steps.length === 1} onPress={() => patch({ steps: draft.steps.filter((x) => x.key !== s.key) })} />
                </Row>
              </Row>
              {s.kind === 'explain' ? <ExplainEditor step={s} problem={problems.get(s.key)} onChange={(p) => patchStep(s.key, p)} /> : <PuzzleEditor step={s} onChange={(p) => patchStep(s.key, p)} />}
            </Stack>
          </GlassView>
        ))}
        {draft.steps.length < 24 ? (
          <Row gap="sm" wrap>
            <Button
              size="sm"
              variant="secondary"
              title={tr('admin.lessons.editor.addExplain')}
              onPress={() => {
                // Start from the last position shown, which is usually where the next step continues.
                const last = [...draft.steps].reverse().find((x): x is ExplainDraft => x.kind === 'explain');
                patch({ steps: [...draft.steps, newExplainStep(last?.fen)] });
              }}
            />
            <Button size="sm" variant="secondary" title={tr('admin.lessons.editor.addPuzzle')} onPress={() => patch({ steps: [...draft.steps, newPuzzleStep()] })} />
          </Row>
        ) : null}
      </Stack>

      <ErrorLine message={error} />
      <Row gap="sm" wrap>
        <Button title={tr('admin.lessons.editor.save')} loading={busy} disabled={!draft.title.trim() || (isNew && !draft.id.trim())} onPress={() => void save()} />
        {!isNew ? <Button variant={armDelete ? 'danger' : 'ghost'} title={armDelete ? tr('admin.lessons.editor.deleteConfirm') : tr('admin.lessons.editor.delete')} disabled={busy} onPress={() => void remove()} /> : null}
      </Row>
    </AdminPage>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap="xs">
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

/** One row of theme chips that scrolls sideways (there are about sixty themes). */
function ThemePicker({ value, onChange, allowNone }: { value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  const tr = useT();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
      {allowNone ? <Chip label={tr('admin.lessons.editor.practiceNone')} selected={!value} onPress={() => onChange('')} /> : null}
      {ALL_THEMES.map((k) => (
        <Chip key={k} label={puzzleThemeLabel(k)} selected={value === k} onPress={() => onChange(k)} />
      ))}
    </ScrollView>
  );
}

function useBoardSize() {
  const { width } = useWindowDimensions();
  return Math.max(200, Math.min(320, width - 96));
}

function ExplainEditor({ step, problem, onChange }: { step: ExplainDraft; problem?: string; onChange: (p: Partial<ExplainDraft>) => void }) {
  const tr = useT();
  const { width } = useWindowDimensions();
  const size = useBoardSize();
  const fenError = useMemo(() => {
    try {
      checkLessonFen(step.fen, 'fen');
      return null;
    } catch {
      return tr('admin.lessons.editor.fenBad');
    }
  }, [step.fen, tr]);
  const preview = useMemo(() => previewStep(step), [step]);
  const arrows = useMemo(() => lessonArrows(preview.arrows), [preview.arrows]);
  const orientation = preview.orientation ?? (step.fen.trim().split(/\s+/)[1] === 'b' ? 'b' : 'w');
  const side = width >= 900;
  const many = (preview.highlights?.length ?? 0) > 6;
  return (
    <View style={{ flexDirection: side ? 'row' : 'column', gap: 16 }}>
      <View style={{ alignItems: 'center' }}>
        {fenError ? (
          <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Text tone="danger">{fenError}</Text>
          </View>
        ) : (
          <Board fen={step.fen.trim()} orientation={orientation} size={size} arrows={arrows} ringed={many ? undefined : preview.highlights} highlighted={many ? preview.highlights : undefined} sound={false} drawable={false} />
        )}
      </View>
      <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
        <TextField label={tr('admin.lessons.editor.stepTitle')} value={step.title} onChangeText={(title) => onChange({ title })} maxLength={80} />
        <TextField label={tr('admin.lessons.editor.body')} value={step.body} onChangeText={(body) => onChange({ body })} maxLength={1200} multiline numberOfLines={5} />
        <TextField label={tr('admin.lessons.editor.fen')} value={step.fen} onChangeText={(fen) => onChange({ fen })} autoCapitalize="none" autoCorrect={false} error={fenError ?? undefined} />
        <Labeled label={tr('admin.lessons.editor.orientation')}>
          <Segmented<ExplainDraft['orientation']>
            size="sm"
            value={step.orientation}
            onChange={(orientation) => onChange({ orientation })}
            options={[
              { value: 'auto', label: tr('admin.lessons.editor.auto') },
              { value: 'w', label: tr('admin.lessons.editor.white') },
              { value: 'b', label: tr('admin.lessons.editor.black') },
            ]}
          />
        </Labeled>
        <TextField label={tr('admin.lessons.editor.arrows')} value={step.arrows} onChangeText={(arrows) => onChange({ arrows })} autoCapitalize="none" autoCorrect={false} error={problem?.startsWith('arrows') ? problem : undefined} />
        <TextField label={tr('admin.lessons.editor.highlights')} value={step.highlights} onChangeText={(highlights) => onChange({ highlights })} autoCapitalize="none" autoCorrect={false} error={problem?.startsWith('squares') ? problem : undefined} />
      </Stack>
    </View>
  );
}

function PuzzleEditor({ step, onChange }: { step: PuzzleDraft; onChange: (p: Partial<PuzzleDraft>) => void }) {
  const tr = useT();
  const { api } = useAdmin();
  const size = useBoardSize();
  const [theme, setTheme] = useState(step.puzzle?.themes[0] && ALL_THEMES.includes(step.puzzle.themes[0]) ? step.puzzle.themes[0] : 'fork');
  const [rating, setRating] = useState('1200');
  const [found, setFound] = useState<PuzzleDto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const known = step.puzzle && step.puzzle.id === step.puzzleId.trim() ? step.puzzle : null;
  const fen = useMemo(() => (known ? puzzleFen(startPuzzle(known)) : null), [known]);

  const find = async (q: { theme?: string; rating?: number; id?: string }) => {
    setBusy(true);
    setErr(null);
    try {
      const list = await api.lessonPuzzles(q);
      if (q.id) {
        if (list[0]) onChange({ puzzle: list[0], puzzleId: list[0].id });
        else setErr(tr('admin.lessons.editor.puzzleUnknown'));
      } else setFound(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr('admin.common.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="md">
      <TextField label={tr('admin.lessons.editor.prompt')} value={step.prompt} onChangeText={(prompt) => onChange({ prompt })} maxLength={120} />
      <Row gap="sm" align="flex-end">
        <View style={{ flex: 1 }}>
          <TextField label={tr('admin.lessons.editor.puzzleId')} value={step.puzzleId} onChangeText={(puzzleId) => onChange({ puzzleId })} autoCapitalize="none" autoCorrect={false} maxLength={16} />
        </View>
        <Button size="sm" variant="secondary" title={tr('admin.lessons.editor.lookUp')} disabled={!step.puzzleId.trim() || busy} onPress={() => void find({ id: step.puzzleId.trim() })} />
      </Row>
      {known && fen ? (
        <Row gap="md" wrap align="flex-start">
          <Board fen={fen} orientation={fen.split(' ')[1] === 'w' ? 'w' : 'b'} size={Math.min(size, 220)} sound={false} drawable={false} hideCoordinates />
          <Stack gap="xs" style={{ flex: 1, minWidth: 160 }}>
            <Text variant="label">{`#${known.id} · ${known.rating}`}</Text>
            <Text variant="caption" tone="muted">
              {known.themes.map(puzzleThemeLabel).join(', ')}
            </Text>
          </Stack>
        </Row>
      ) : step.puzzleId.trim() ? (
        <Text variant="caption" tone="muted">
          {tr('admin.lessons.editor.puzzleUnknown')}
        </Text>
      ) : null}
      <Stack gap="sm">
        <Text variant="caption" tone="muted">
          {tr('admin.lessons.editor.findPuzzles')}
        </Text>
        <Text variant="caption">{`${tr('admin.lessons.editor.theme')}: ${puzzleThemeLabel(theme)}`}</Text>
        <ThemePicker value={theme} onChange={setTheme} />
        <Row gap="sm" align="flex-end">
          <View style={{ width: 140 }}>
            <TextField label={tr('admin.lessons.editor.rating')} value={rating} onChangeText={setRating} keyboardType="number-pad" maxLength={4} />
          </View>
          <Button size="sm" title={tr('admin.lessons.editor.findPuzzles')} loading={busy} onPress={() => void find({ theme, rating: Number(rating) || 1200 })} />
        </Row>
        {err ? (
          <Text variant="caption" tone="danger">
            {err}
          </Text>
        ) : null}
        {found && found.length === 0 ? (
          <Text variant="caption" tone="muted">
            {tr('admin.lessons.editor.noPuzzles')}
          </Text>
        ) : null}
        {found && found.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ gap: 12, paddingVertical: 4 }}>
            {found.map((p) => (
              <PuzzleChoice key={p.id} p={p} selected={p.id === step.puzzleId.trim()} onUse={() => onChange({ puzzle: p, puzzleId: p.id })} />
            ))}
          </ScrollView>
        ) : null}
      </Stack>
    </Stack>
  );
}

function PuzzleChoice({ p, selected, onUse }: { p: PuzzleDto; selected: boolean; onUse: () => void }) {
  const tr = useT();
  const c = useAppTheme().colors;
  const fen = useMemo(() => puzzleFen(startPuzzle(p)), [p]);
  return (
    <View style={{ width: 160, gap: 6, padding: 6, borderRadius: 12, borderWidth: selected ? 2 : 1, borderColor: selected ? c.text : c.border }}>
      <Board fen={fen} orientation={fen.split(' ')[1] === 'w' ? 'w' : 'b'} size={146} sound={false} drawable={false} hideCoordinates />
      <Text variant="caption" numberOfLines={1}>{`#${p.id} · ${p.rating}`}</Text>
      <Button size="sm" variant={selected ? 'primary' : 'secondary'} title={tr('admin.lessons.editor.use')} onPress={onUse} />
    </View>
  );
}

/** Icon for an IconButton, in the text colour of the current theme. */
function Glyph({ name }: { name: ComponentProps<typeof Ionicons>['name'] }) {
  return <Ionicons name={name} size={18} color={useAppTheme().colors.text} />;
}
