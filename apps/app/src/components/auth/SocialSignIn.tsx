import { AntDesign } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { Divider, FormMessage } from '@/components/auth/AuthShell';
import { ApiError, authApi, useAuth, type OAuthProvider } from '@/lib/auth';
import { Button, useAppTheme } from '@/ui';

// Closes the Google pop-up on web once it lands back on the app.
WebBrowser.maybeCompleteAuthSession();

const GOOGLE = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
};

/** Expo Go can't receive Google's redirect (it needs the app's own URL scheme), so Google needs web or an installed build. */
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

function googleClientIdForPlatform(): string | undefined {
  if (Platform.OS === 'web') return GOOGLE.webClientId;
  if (Platform.OS === 'ios') return GOOGLE.iosClientId;
  if (Platform.OS === 'android') return GOOGLE.androidClientId;
  return undefined;
}

function messageFor(provider: OAuthProvider, e: unknown): string {
  const name = provider === 'google' ? 'Google' : 'Apple';
  if (e instanceof ApiError) {
    if (e.code === 'network') return e.message;
    if (e.code === 'not_configured') return `${name} sign-in isn't set up on the server yet.`;
    if (e.code === 'rate_limited') return 'Too many attempts. Wait a minute and try again.';
  }
  return `${name} sign-in didn't work. Please try again.`;
}

/**
 * "Continue with Google" and "Sign in with Apple", shown under the email form.
 * Each button only appears where it can work: the server has it turned on, and
 * the platform has what it needs (Apple: iOS; Google: a client ID for this platform).
 */
export function SocialSignIn({ onSignedIn, divider = true }: { onSignedIn: () => void; divider?: boolean }) {
  const [server, setServer] = useState<Record<OAuthProvider, boolean> | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    authApi
      .providers()
      .then((r) => live && setServer(r.providers))
      .catch(() => live && setServer({ google: false, apple: false }));
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync()
        .then((ok) => live && setAppleAvailable(ok))
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, []);

  const showGoogle = !!server?.google && (!!googleClientIdForPlatform() || (inExpoGo && Platform.OS !== 'web'));
  const showApple = !!server?.apple && appleAvailable;
  if (!showGoogle && !showApple) return null;

  return (
    <View style={{ gap: 12 }}>
      {divider ? <Divider label="or" /> : null}
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}
      {showApple ? <AppleButton onError={setError} onSignedIn={onSignedIn} /> : null}
      {showGoogle ? (
        inExpoGo && Platform.OS !== 'web' ? (
          <Button
            title="Continue with Google"
            variant="secondary"
            fullWidth
            leftIcon={<GoogleIcon />}
            onPress={() => setError("Google sign-in can't run inside Expo Go. Try it on the web version (press w in Expo) or in an installed build.")}
          />
        ) : (
          <GoogleButton onError={setError} onSignedIn={onSignedIn} />
        )
      ) : null}
    </View>
  );
}

function GoogleIcon() {
  const { colors } = useAppTheme();
  return <AntDesign name="google" size={18} color={colors.text} />;
}

function GoogleButton({ onError, onSignedIn }: { onError: (m: string | null) => void; onSignedIn: () => void }) {
  const { signInWithProvider } = useAuth();
  const [busy, setBusy] = useState(false);
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    ...GOOGLE,
    selectAccount: true,
    // On web, return to the site root (add exactly this URL as an authorized redirect URI in Google Cloud).
    ...(Platform.OS === 'web' && typeof window !== 'undefined' ? { redirectUri: window.location.origin } : null),
  });

  async function signIn() {
    onError(null);
    setBusy(true);
    try {
      const result = await promptAsync();
      if (result.type !== 'success') {
        setBusy(false);
        if (result.type === 'error') onError(messageFor('google', result.error));
        return;
      }
      const idToken = result.params.id_token ?? result.authentication?.idToken;
      if (!idToken) throw new Error('No ID token');
      await signInWithProvider('google', idToken);
      onSignedIn();
    } catch (e) {
      setBusy(false);
      onError(messageFor('google', e));
    }
  }

  return (
    <Button
      title="Continue with Google"
      variant="secondary"
      fullWidth
      loading={busy}
      disabled={!request}
      leftIcon={<GoogleIcon />}
      onPress={signIn}
    />
  );
}

function AppleButton({ onError, onSignedIn }: { onError: (m: string | null) => void; onSignedIn: () => void }) {
  const { signInWithProvider } = useAuth();
  const { scheme } = useAppTheme();
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (busy) return;
    onError(null);
    setBusy(true);
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (!cred.identityToken) throw new Error('No identity token');
      // Apple sends the name only the first time; the server uses it for the username.
      const fullName = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ') || undefined;
      await signInWithProvider('apple', cred.identityToken, fullName);
      onSignedIn();
    } catch (e) {
      setBusy(false);
      if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return;
      onError(messageFor('apple', e));
    }
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      // Monochrome brand: white button on dark, black on light.
      buttonStyle={scheme === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={14}
      style={{ height: 44, alignSelf: 'stretch', opacity: busy ? 0.6 : 1 }}
      onPress={signIn}
    />
  );
}
