import { isChallengeId } from '@chessmate/core';
import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Invite link target. https://<web>/challenge/<id>, chessmate://challenge/<id>
 * and Expo Go's exp://.../--/challenge/<id> all land here and open the game
 * screen with the invite loaded.
 */
export default function ChallengeLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!isChallengeId(id)) return <Redirect href="/" />;
  return <Redirect href={{ pathname: '/play/online', params: { challenge: id } }} />;
}
