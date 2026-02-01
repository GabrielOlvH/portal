import React, { useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { WebView } from 'react-native-webview';
import { Copy, OctagonX } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { TerminalWebView } from '@/components/TerminalWebView';
import { useStore } from '@/lib/store';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { buildTerminalHtml, TERMINAL_HTML_VERSION, TerminalFontConfig } from '@/lib/terminal-html';
import { buildDockerExecWsUrl } from '@/lib/ws-urls';

type WebViewSource = { html: string };
type SourceCacheEntry = {
  key: string;
  source: WebViewSource;
};

export default function DockerTerminalScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id: string; containerId: string }>();
  const { hosts, preferences } = useStore();
  const host = hosts.find((item) => item.id === params.id);
  const containerId = params.containerId ? decodeURIComponent(params.containerId) : '';
  const fontConfig: TerminalFontConfig = useMemo(
    () => ({
      fontFamily: preferences.terminal.fontFamily,
      fontSize: preferences.terminal.fontSize,
    }),
    [preferences.terminal.fontFamily, preferences.terminal.fontSize]
  );

  const wsUrl = useMemo(() => (host && containerId ? buildDockerExecWsUrl(host, containerId) : ''), [host, containerId]);
  const terminalTheme = useMemo(
    () => ({
      background: colors.terminalBackground,
      foreground: colors.terminalForeground,
      cursor: colors.terminalForeground,
      selection: colors.terminalSelection,
    }),
    [colors]
  );
  const sourceCache = useRef<SourceCacheEntry | null>(null);
  const source = useMemo(() => {
    if (!wsUrl) return undefined;
    const cacheKey = `${wsUrl}|${terminalTheme.background}|${terminalTheme.foreground}|${terminalTheme.cursor}|${fontConfig.fontFamily}|${fontConfig.fontSize}|${TERMINAL_HTML_VERSION}|docker`;
    if (!sourceCache.current || sourceCache.current.key !== cacheKey) {
      sourceCache.current = {
        key: cacheKey,
        source: { html: buildTerminalHtml('docker', wsUrl, terminalTheme, fontConfig) },
      };
    }
    return sourceCache.current.source;
  }, [
    wsUrl,
    terminalTheme.background,
    terminalTheme.foreground,
    terminalTheme.cursor,
    fontConfig,
  ]);
  const webRef = useRef<WebView | null>(null);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const sendToTerminal = useCallback((data: string) => {
    const payload = JSON.stringify(data);
    webRef.current?.injectJavaScript(
      `window.__sendToTerminal && window.__sendToTerminal(${payload}); true;`
    );
  }, []);

  const copyFromTerminal = useCallback(() => {
    webRef.current?.injectJavaScript('window.__copySelection && window.__copySelection(); true;');
  }, []);

  if (!host || !containerId || !wsUrl) {
    return (
      <Screen>
        <AppText variant="title">Container not found</AppText>
      </Screen>
    );
  }

  return (
    <Screen variant="terminal">
      <View style={styles.header}>
        <View style={styles.headerFloating}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
          >
            <AppText variant="caps" style={styles.headerButtonText}>←</AppText>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              copyFromTerminal();
            }}
          >
            <Copy size={16} color={colors.terminalForeground} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              sendToTerminal('\u0003');
            }}
          >
            <OctagonX size={16} color={colors.red} />
          </Pressable>
        </View>
      </View>

      <View style={styles.terminal}>
        <TerminalWebView
          setRef={(ref) => { webRef.current = ref; }}
          source={source}
          style={styles.webview}
          autoFit
          onLoadEnd={() => {
            webRef.current?.injectJavaScript('window.__fitTerminal && window.__fitTerminal(); true;');
          }}
          onMessage={async (event) => {
            try {
              const payload = JSON.parse(event.nativeEvent.data);
              if (payload?.type === 'copy' && typeof payload.text === 'string') {
                if (!payload.text) return;
                await Clipboard.setStringAsync(payload.text);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } else if (payload?.type === 'haptic') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }
            } catch {}
          }}
        />
      </View>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  headerFloating: {
    flexDirection: 'row',
    backgroundColor: colors.terminalBackground,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    padding: 4,
    gap: 4,
  },
  headerButton: {
    padding: 6,
    borderRadius: 6,
  },
  headerButtonPressed: {
    backgroundColor: colors.terminalPressed,
  },
  headerButtonText: {
    color: colors.terminalMuted,
    fontSize: 16,
  },
  terminal: {
    flex: 1,
    backgroundColor: colors.terminalBackground,
    paddingTop: 4,
  },
  webview: {
    flex: 1,
    backgroundColor: colors.terminalBackground,
  },
});
