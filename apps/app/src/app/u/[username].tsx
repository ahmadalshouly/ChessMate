import { Redirect, useLocalSearchParams } from 'expo-router';

/** Shareable profile link (what a profile QR code opens): /u/<username> goes to the profile. */
export default function ProfileLink() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <Redirect href={{ pathname: '/profile/[username]', params: { username: username ?? '' } }} />;
}
