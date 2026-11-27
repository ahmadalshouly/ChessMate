import { useEffect, useRef, type ComponentType, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';

import { ENGINE_HOST_HTML } from './hostHtml';
import { hostMessage, setHostSender, useEngineHost } from './transport.native';

/** What this host uses. react-native-webview's own prop types merge to `never` under React Native 0.88's types. */
interface HostHandle {
  postMessage(msg: string): void;
}
const WebView = RNWebView as unknown as ComponentType<{
  ref?: Ref<HostHandle>;
  source: { html: string; baseUrl?: string };
  originWhitelist?: string[];
  javaScriptEnabled?: boolean;
  onMessage?: (e: { nativeEvent: { data: string } }) => void;
  onContentProcessDidTerminate?: () => void;
  onRenderProcessGone?: () => void;
}>;

/**
 * Invisible WebView where the on-device engines run while a review needs them.
 * Mounted once at the root; it renders nothing until an engine is asked for and
 * unmounts (freeing the engines) once they have been idle for a while.
 */
export function EngineHost() {
  const { session, payload } = useEngineHost();
  const ref = useRef<HostHandle>(null);
  useEffect(() => {
    if (!payload) return;
    setHostSender((msg) => ref.current?.postMessage(msg));
    return () => setHostSender(null);
  }, [payload, session]);
  if (!payload) return null;
  return (
    <View pointerEvents="none" style={styles.hidden} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <WebView
        key={session}
        ref={ref}
        source={{ html: ENGINE_HOST_HTML, baseUrl: 'https://engine.chessmate.local/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        onMessage={(e) => hostMessage(e.nativeEvent.data)}
        // A crashed WebView process takes the engines with it; the review falls back to the server.
        onContentProcessDidTerminate={() => hostMessage(JSON.stringify({ t: 'error', message: 'Engine stopped' }))}
        onRenderProcessGone={() => hostMessage(JSON.stringify({ t: 'error', message: 'Engine stopped' }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10 },
});
