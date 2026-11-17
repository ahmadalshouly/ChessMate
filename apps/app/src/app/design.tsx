import { START_FEN } from '@chessmate/core';
import { useState } from 'react';

import { Board } from '@/components/Board';
import {
  Avatar,
  Badge,
  BoardThemePicker,
  Button,
  Card,
  Chip,
  IconButton,
  ListGroup,
  ListRow,
  Modal,
  Row,
  Screen,
  SectionHeader,
  Skeleton,
  SkeletonRow,
  SkeletonText,
  Stack,
  Switch,
  Tabs,
  Text,
  TextField,
  useThemePreference,
  useToast,
  type ThemePreference,
} from '@/ui';

const SAMPLE_FEN = START_FEN;

/** Living gallery of the design system. Open /design in the app. */
export default function DesignSystem() {
  const { preference, setPreference } = useThemePreference();
  const toast = useToast();
  const [modal, setModal] = useState<null | 'dialog' | 'sheet'>(null);
  const [tab, setTab] = useState<'games' | 'stats' | 'friends'>('games');
  const [section, setSection] = useState<'overview' | 'openings' | 'history'>('overview');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tc, setTc] = useState('5+0');
  const [sounds, setSounds] = useState(true);
  const [loading, setLoading] = useState(false);

  return (
    <Screen scroll>
      <Stack gap="xs">
        <Text variant="overline" tone="muted">
          ChessMate UI
        </Text>
        <Text variant="display">Design system</Text>
        <Text tone="muted">Monochrome, frosted glass, calm. Colour only where it means something.</Text>
      </Stack>

      <SectionHeader title="Appearance" />
      <Tabs<ThemePreference>
        items={[
          { key: 'system', label: 'System' },
          { key: 'light', label: 'Light' },
          { key: 'dark', label: 'Dark' },
        ]}
        value={preference}
        onChange={setPreference}
      />

      <SectionHeader title="Typography" />
      <Card>
        <Text variant="display">Display 34</Text>
        <Text variant="title">Title 28</Text>
        <Text variant="heading">Heading 20</Text>
        <Text variant="subheading">Subheading 17</Text>
        <Text>Body 15. Real-time games against players worldwide.</Text>
        <Text variant="bodyStrong">Body strong 15</Text>
        <Text variant="label" tone="muted">
          Label 13
        </Text>
        <Text variant="caption" tone="muted">
          Caption 12
        </Text>
        <Text variant="overline" tone="muted">
          Overline 11
        </Text>
        <Row gap="lg">
          <Text variant="clock">04:59.8</Text>
          <Text variant="numeric">1520 (+8)</Text>
          <Text variant="mono">e2e4 e7e5</Text>
        </Row>
      </Card>

      <SectionHeader title="Buttons" />
      <Card>
        <Row wrap>
          <Button title="Play" onPress={() => {}} />
          <Button title="Analyse" variant="secondary" onPress={() => {}} />
          <Button title="Cancel" variant="ghost" onPress={() => {}} />
          <Button title="Resign" variant="danger" onPress={() => {}} />
        </Row>
        <Row wrap>
          <Button title="Small" size="sm" variant="secondary" />
          <Button title="Large" size="lg" />
          <Button title="Disabled" disabled />
          <Button title="Loading" loading />
        </Row>
        <Button title="Full width" fullWidth variant="secondary" />
        <Row>
          <IconButton accessibilityLabel="Flip board" icon={<Text variant="subheading">⇅</Text>} />
          <IconButton accessibilityLabel="Settings" variant="ghost" icon={<Text variant="subheading">⚙︎</Text>} />
          <IconButton accessibilityLabel="Add" variant="solid" icon={<Text variant="subheading" tone="inverse">+</Text>} />
        </Row>
      </Card>

      <SectionHeader title="Inputs" />
      <Card>
        <TextField label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextField
          label="Password"
          password
          value={password}
          onChangeText={setPassword}
          helper="At least 8 characters"
          error={password.length > 0 && password.length < 8 ? 'Too short' : null}
        />
        <Row wrap>
          {['1+0', '3+2', '5+0', '10+0', '15+10'].map((k) => (
            <Chip key={k} label={k} selected={tc === k} onPress={() => setTc(k)} />
          ))}
        </Row>
      </Card>

      <SectionHeader title="Badges and avatars" />
      <Card>
        <Row wrap>
          <Badge label="1520" />
          <Badge label="Rated" tone="outline" />
          <Badge label="GM" tone="solid" />
          <Badge label="Live" tone="live" />
          <Badge label="+12" tone="success" />
          <Badge label="Inaccuracy" tone="warning" />
          <Badge label={3} tone="danger" />
          <Badge label="Medium" size="md" />
        </Row>
        <Row gap="md">
          <Avatar name="Ahmad Shouly" status="online" />
          <Avatar name="Nora" status="playing" size={48} />
          <Avatar name="Leo Park" status="away" size={32} />
          <Avatar name="Club Knights" square size={44} />
          <Avatar name="Guest" status="offline" size={56} />
        </Row>
      </Card>

      <SectionHeader title="Tabs" />
      <Tabs
        items={[
          { key: 'games', label: 'Games', count: 128 },
          { key: 'stats', label: 'Stats' },
          { key: 'friends', label: 'Friends', count: 12 },
        ]}
        value={tab}
        onChange={setTab}
      />
      <Tabs
        variant="underline"
        items={[
          { key: 'overview', label: 'Overview' },
          { key: 'openings', label: 'Openings' },
          { key: 'history', label: 'History' },
        ]}
        value={section}
        onChange={setSection}
      />

      <SectionHeader title="Lists" action={<Button title="See all" size="sm" variant="ghost" />} />
      <ListGroup>
        <ListRow left={<Avatar name="Nora Lind" status="online" />} title="Nora Lind" subtitle="Blitz 1874 · online" right={<Button title="Challenge" size="sm" variant="secondary" />} />
        <ListRow left={<Avatar name="Leo Park" status="playing" />} title="Leo Park" subtitle="Playing 3+2" right={<Badge tone="live" label="Live" />} onPress={() => {}} />
        <ListRow title="Move sounds" right={<Switch value={sounds} onValueChange={setSounds} />} />
        <ListRow title="Language" right="English" chevron onPress={() => {}} />
        <ListRow title="Sign out" destructive onPress={() => {}} />
      </ListGroup>

      <SectionHeader title="Loading" action={<Switch value={loading} onValueChange={setLoading} />} />
      <Card>
        {loading ? (
          <>
            <SkeletonRow />
            <SkeletonText />
            <Skeleton height={120} radius="md" />
          </>
        ) : (
          <Text tone="muted">Turn the switch on to see skeleton placeholders.</Text>
        )}
      </Card>

      <SectionHeader title="Overlays" />
      <Card>
        <Row wrap>
          <Button title="Dialog" variant="secondary" onPress={() => setModal('dialog')} />
          <Button title="Sheet" variant="secondary" onPress={() => setModal('sheet')} />
          <Button title="Toast" variant="secondary" onPress={() => toast.show({ title: 'Game saved', message: 'Find it under Profile > Games.', tone: 'success' })} />
          <Button
            title="Error toast"
            variant="secondary"
            onPress={() => toast.show({ title: 'Connection lost', message: 'Reconnecting…', tone: 'danger', action: { label: 'Retry', onPress: () => {} } })}
          />
        </Row>
      </Card>

      <SectionHeader title="Board themes" />
      <Card>
        <BoardThemePicker />
        <Board fen={SAMPLE_FEN} orientation="w" size={280} />
      </Card>

      <Modal
        visible={modal !== null}
        presentation={modal ?? 'dialog'}
        onClose={() => setModal(null)}
        title="Resign this game?"
        description="Your opponent will be awarded the win and your rating will update."
        actions={
          <>
            <Button title="Keep playing" variant="ghost" onPress={() => setModal(null)} />
            <Button title="Resign" variant="danger" onPress={() => setModal(null)} />
          </>
        }
      />
    </Screen>
  );
}
