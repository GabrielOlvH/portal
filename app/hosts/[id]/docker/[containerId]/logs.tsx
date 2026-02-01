import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { WebView } from 'react-native-webview';
import { Copy, ArrowDown, Trash2, Clock, RefreshCw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { TerminalWebView } from '@/components/TerminalWebView';
import { useStore } from '@/lib/store';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { buildTerminalHtml, TERMINAL_HTML_VERSION, TerminalFontConfig } from '@/lib/terminal-html';
import { buildDockerLogsWsUrl } from '@/lib/ws-urls';

type SourceCacheEntry = {
  key: string;
  source: { html: string };
};

export default function DockerLogsScreen() {
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

  const [follow, setFollow] = useState(true);
  const [tail, setTail] = useState('200');
  const [timestamps, setTimestamps] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('connecting');

  const wsUrl = useMemo(
    () => (host && containerId ? buildDockerLogsWsUrl(host, containerId, { follow, tail, timestamps }) : ''),
    [host, containerId, follow, tail, timestamps]
  );

  const logTheme = useMemo(
    () => ({
      background: colors.terminalBackground,
      foreground: colors.terminalForeground,
      selection: colors.terminalSelection,
    }),
    [colors]
  );

  const sourceCache = useRef<SourceCacheEntry | null>(null);
  const source = useMemo(() => {
    if (!wsUrl) return undefined;
    const cacheKey = `${wsUrl}|${logTheme.background}|${logTheme.foreground}|${fontConfig.fontFamily}|${TERMINAL_HTML_VERSION}|logs`;
    if (!sourceCache.current || sourceCache.current.key !== cacheKey) {
      sourceCache.current = {
        key: cacheKey,
        source: { html: buildTerminalHtml('logs', wsUrl, logTheme, fontConfig) },
      };
    }
    return sourceCache.current.source;
  }, [wsUrl, logTheme.background, logTheme.foreground, fontConfig]);

  const webRef = useRef<WebView | null>(null);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const copyLogs = useCallback(() => {
    webRef.current?.injectJavaScript('window.__copyAll && window.__copyAll(); true;');
  }, []);

  const clearLogs = useCallback(() => {
    webRef.current?.injectJavaScript('window.__clearTerminal && window.__clearTerminal(); true;');
  }, []);

  const scrollToBottom = useCallback(() => {
    webRef.current?.injectJavaScript('window.__scrollToBottom && window.__scrollToBottom(); true;');
  }, []);

  const cycleTail = useCallback(() => {
    const options = ['100', '200', '500', '1000', 'all'];
    const currentIndex = options.indexOf(tail);
    const nextIndex = (currentIndex + 1) % options.length;
    setTail(options[nextIndex]);
  }, [tail]);

  const reconnect = useCallback(() => {
    setConnectionStatus('connecting');
    webRef.current?.injectJavaScript('window.__reconnect && window.__reconnect(); true;');
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
          <View style={styles.headerCenter}>
            <AppText variant="caps" style={styles.headerTitle}>Logs</AppText>
            <AppText variant="caps" style={styles.headerStatus}>
              {connectionStatus === 'connected' ? (follow ? 'streaming' : 'loaded') : connectionStatus}
            </AppText>
          </View>
          <Pressable
            style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTimestamps(!timestamps);
            }}
          >
            <Clock size={16} color={timestamps ? colors.accent : colors.terminalForeground} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              cycleTail();
            }}
          >
            <AppText variant="caps" style={styles.tailText}>{tail}</AppText>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              clearLogs();
            }}
          >
            <Trash2 size={16} color={colors.terminalForeground} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              copyLogs();
            }}
          >
            <Copy size={16} color={colors.terminalForeground} />
          </Pressable>
          {connectionStatus === 'disconnected' && (
            <Pressable
              style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                reconnect();
              }}
            >
              <RefreshCw size={16} color={colors.accent} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.terminal}>
        <TerminalWebView
          setRef={(ref) => { webRef.current = ref; }}
          source={source}
          style={styles.webview}
          keyboardEnabled={false}
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
              } else if (payload?.type === 'connected') {
                setConnectionStatus('connected');
              } else if (payload?.type === 'disconnected') {
                setConnectionStatus('disconnected');
              } else if (payload?.type === 'reconnecting') {
                setConnectionStatus('reconnecting');
              }
            } catch {}
          }}
        />
      </View>

      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          scrollToBottom();
        }}
      >
        <ArrowDown size={20} color={colors.terminalForeground} />
      </Pressable>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      paddingTop: 8,
      paddingHorizontal: 8,
    },
    headerFloating: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.terminalBackground + 'E0',
      borderRadius: 8,
      paddingHorizontal: 4,
      gap: 2,
    },
    headerButton: {
      padding: 10,
      borderRadius: 6,
    },
    headerButtonPressed: {
      backgroundColor: colors.terminalForeground + '20',
    },
    headerButtonText: {
      color: colors.terminalForeground,
      fontSize: 18,
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitle: {
      color: colors.terminalForeground,
      fontSize: 12,
    },
    headerStatus: {
      color: colors.terminalForeground + '80',
      fontSize: 10,
    },
    tailText: {
      color: colors.terminalForeground,
      fontSize: 10,
    },
    terminal: {
      flex: 1,
      paddingTop: 52,
    },
    webview: {
      flex: 1,
      backgroundColor: colors.terminalBackground,
    },
    fab: {
      position: 'absolute',
      bottom: 16,
      right: 16,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.terminalBackground + 'E0',
      borderWidth: 1,
      borderColor: colors.terminalForeground + '30',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fabPressed: {
      backgroundColor: colors.terminalForeground + '20',
    },
  });
}
