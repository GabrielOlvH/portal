import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextStyle,
  useWindowDimensions,
  ViewStyle,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  OctagonX,
  ClipboardPaste,
  Copy,
  ImageIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/useTheme';
import { useHostLive } from '@/lib/live';
import { uploadImage } from '@/lib/api';
import type { ThemeColors } from '@/lib/useTheme';

type HelperKeyIcon = React.ComponentType<{ size: number; color: string }>;
type HelperKey = {
  label: string;
  data: string;
  icon?: HelperKeyIcon;
};
type WebViewSource = { html: string };
type TerminalStyles = {
  header: ViewStyle;
  headerFloating: ViewStyle;
  headerButton: ViewStyle;
  headerButtonPressed: ViewStyle;
  headerButtonText: TextStyle;
  pager: ViewStyle;
  page: ViewStyle;
  pageLabel: ViewStyle;
  pageLabelText: TextStyle;
  terminal: ViewStyle;
  webview: ViewStyle;
  helperOverlay: ViewStyle;
  helperBar: ViewStyle;
  helperContent: ViewStyle;
  helperKey: ViewStyle;
  helperText: TextStyle;
  doneKey: ViewStyle;
  keyPressed: ViewStyle;
};

const helperKeys: HelperKey[] = [
  { label: 'Esc', data: '\u001b' },
  { label: 'Tab', data: '\t' },
  { label: 'Up', data: '\u001b[A', icon: ChevronUp },
  { label: 'Down', data: '\u001b[B', icon: ChevronDown },
  { label: 'Left', data: '\u001b[D', icon: ChevronLeft },
  { label: 'Right', data: '\u001b[C', icon: ChevronRight },
  { label: 'PgUp', data: '\u001b[5~' },
  { label: 'PgDn', data: '\u001b[6~' },
];

function buildWsUrl(host: { baseUrl: string; authToken?: string }, sessionName: string): string {
  try {
    const base = new URL(host.baseUrl);
    const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = host.authToken ? `&token=${encodeURIComponent(host.authToken)}` : '';
    return `${protocol}//${base.host}/ws?session=${encodeURIComponent(sessionName)}&cols=80&rows=24${token}`;
  } catch {
    return '';
  }
}

function buildTerminalHtml(
  wsUrl: string,
  theme: { background: string; foreground: string; cursor: string }
): string {
  const { background, foreground, cursor } = theme;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://unpkg.com/xterm/css/xterm.css" />
    <style>
      html, body { height: 100%; margin: 0; background: ${background}; overflow: hidden; }
      #terminal { height: 100%; width: 100%; padding-left: 4px; }
    </style>
  </head>
  <body>
    <div id="terminal"></div>
    <script src="https://unpkg.com/xterm/lib/xterm.js"></script>
    <script src="https://unpkg.com/xterm-addon-fit/lib/xterm-addon-fit.js"></script>
    <script src="https://unpkg.com/xterm-addon-webgl/lib/xterm-addon-webgl.js"></script>
    <script>
      const term = new Terminal({
        cursorBlink: true,
        fontFamily: 'JetBrainsMono, Menlo, monospace',
        fontSize: 12,
        allowProposedApi: true,
        theme: { background: '${background}', foreground: '${foreground}', cursor: '${cursor}' },
      });
      const fitAddon = new FitAddon.FitAddon();
      const webglAddon = new WebglAddon.WebglAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(webglAddon);
      term.open(document.getElementById('terminal'));

      let socket = null;
      let reconnectTimer = null;

      function sendToRN(payload) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      }

      function connect() {
        socket = new WebSocket('${wsUrl}');
        socket.onopen = () => {
          sendToRN({ type: 'status', state: 'connected' });
          setTimeout(() => { fitAddon.fit(); sendResize(); }, 50);
        };
        socket.onmessage = (event) => term.write(event.data);
        socket.onclose = () => {
          sendToRN({ type: 'status', state: 'disconnected' });
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, 1000);
        };
        socket.onerror = () => sendToRN({ type: 'status', state: 'error' });
      }

      function sendResize() {
        if (socket?.readyState === 1) {
          socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      }

      term.onData((data) => {
        if (socket?.readyState === 1) {
          socket.send(JSON.stringify({ type: 'input', data }));
        }
      });

      window.__sendToTerminal = (data) => {
        if (socket?.readyState === 1) {
          socket.send(JSON.stringify({ type: 'input', data }));
        }
      };
      window.__focusTerminal = () => term.focus();
      window.__blurTerminal = () => term.blur();
      window.__fitTerminal = () => { fitAddon.fit(); sendResize(); };
      window.__copySelection = () => {
        const text = term.getSelection();
        if (text && text.trim().length > 0) {
          sendToRN({ type: 'copy', text });
          return;
        }
        const buffer = term.buffer.active;
        const start = buffer.viewportY;
        const lines = [];
        for (let i = start; i < Math.min(buffer.length, start + term.rows); i += 1) {
          const line = buffer.getLine(i);
          if (line) lines.push(line.translateToString(true));
        }
        sendToRN({ type: 'copy', text: lines.join('\\n') });
      };

      // Mouse wheel scroll for tmux (SGR protocol)
      function sendScroll(deltaY, clientX, clientY) {
        if (socket?.readyState !== 1) return;
        const rect = document.getElementById('terminal').getBoundingClientRect();
        const col = Math.floor((clientX - rect.left) / 7) + 1;
        const row = Math.floor((clientY - rect.top) / 14) + 1;
        const btn = deltaY < 0 ? 64 : 65;
        const esc = String.fromCharCode(27);
        socket.send(JSON.stringify({ type: 'input', data: esc + '[<' + btn + ';' + col + ';' + row + 'M' }));
      }

      document.addEventListener('wheel', (e) => {
        e.preventDefault();
        const lines = Math.max(1, Math.ceil(Math.abs(e.deltaY) / 40));
        for (let i = 0; i < lines; i++) sendScroll(e.deltaY, e.clientX, e.clientY);
      }, { passive: false });

      // Touch handling: long-press for selection, quick swipe for scroll
      let touchStartX = 0;
      let touchStartY = 0;
      let lastScrollY = 0;
      let touchStartTime = 0;
      let isSelectionMode = false;
      let isVerticalScroll = null;
      let selectionStartCol = 0;
      let selectionStartRow = 0;
      const LONG_PRESS_DURATION = 400;
      const MOVE_THRESHOLD = 10;

      // Get cell dimensions from xterm
      function getCellSize() {
        const core = term._core;
        return {
          width: core._renderService.dimensions.css.cell.width,
          height: core._renderService.dimensions.css.cell.height
        };
      }

      // Convert touch position to terminal cell
      function touchToCell(clientX, clientY) {
        const rect = document.getElementById('terminal').getBoundingClientRect();
        const cell = getCellSize();
        const col = Math.floor((clientX - rect.left) / cell.width);
        const row = Math.floor((clientY - rect.top) / cell.height);
        return { col: Math.max(0, col), row: Math.max(0, row) };
      }

      document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          lastScrollY = touchStartY;
          touchStartTime = Date.now();
          if (isSelectionMode) {
            sendToRN({ type: 'selectionEnd' });
          }
          isSelectionMode = false;
          isVerticalScroll = null;
          term.clearSelection();
        }
      }, { passive: true });

      document.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
          const x = e.touches[0].clientX;
          const y = e.touches[0].clientY;
          const dx = x - touchStartX;
          const dy = y - touchStartY;
          const elapsed = Date.now() - touchStartTime;
          const moved = Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD;

          // Long-press without initial movement = start selection mode
          if (!isSelectionMode && !moved && elapsed > LONG_PRESS_DURATION) {
            isSelectionMode = true;
            const start = touchToCell(touchStartX, touchStartY);
            selectionStartCol = start.col;
            selectionStartRow = start.row;
            term.select(selectionStartCol, selectionStartRow + term.buffer.active.viewportY, 1);
            sendToRN({ type: 'selectionStart' });
            sendToRN({ type: 'haptic' });
            return;
          }

          // In selection mode, extend selection
          if (isSelectionMode) {
            const end = touchToCell(x, y);
            const startRow = selectionStartRow + term.buffer.active.viewportY;
            const endRow = end.row + term.buffer.active.viewportY;
            if (endRow === startRow) {
              const length = Math.abs(end.col - selectionStartCol) + 1;
              const startCol = Math.min(selectionStartCol, end.col);
              term.select(startCol, startRow, length);
            } else if (endRow > startRow) {
              term.select(selectionStartCol, startRow, (term.cols - selectionStartCol) + (endRow - startRow - 1) * term.cols + end.col + 1);
            } else {
              term.select(end.col, endRow, (term.cols - end.col) + (startRow - endRow - 1) * term.cols + selectionStartCol + 1);
            }
            return;
          }

          // Otherwise handle scroll
          if (isVerticalScroll === null) {
            if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) + 4) {
              isVerticalScroll = true;
            } else if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) + 4) {
              isVerticalScroll = false;
            } else {
              return;
            }
          }
          if (!isVerticalScroll) return;
          const delta = lastScrollY - y;
          if (Math.abs(delta) > 14) {
            sendScroll(delta, x, y);
            lastScrollY = y;
          }
        }
      }, { passive: true });

      window.addEventListener('resize', () => { fitAddon.fit(); sendResize(); });
      connect();
    </script>
  </body>
</html>`;
}

export default function SessionTerminalScreen(): React.ReactElement {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ hostId: string; name: string }>();
  const initialSessionName = decodeURIComponent(params.name ?? '');
  const { hosts } = useStore();
  const host = hosts.find((item) => item.id === params.hostId);
  const { width: screenWidth } = useWindowDimensions();

  const [currentSessionName, setCurrentSessionName] = useState(initialSessionName);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [helperHeight, setHelperHeight] = useState(0);
  const [isSelecting, setIsSelecting] = useState(false);
  const webRefs = useRef<Record<string, WebView | null>>({});
  const sourceCache = useRef<Record<string, WebViewSource>>({});
  const styles = useMemo(() => createStyles(colors), [colors]);
  const terminalTheme = useMemo(
    () => ({
      background: colors.terminalBackground,
      foreground: colors.terminalForeground,
      cursor: colors.terminalForeground,
    }),
    [colors]
  );
  const previousSessionRef = useRef<string | null>(null);

  const { state, refresh } = useHostLive(host, { sessions: true });
  const sessions = state?.sessions ?? [];
  const sessionCount = sessions.length;
  const initialIndex = sessions.findIndex((session) => session.name === initialSessionName);

  // Precompute stable source objects
  useMemo(() => {
    if (!host) return;
    sessions.forEach((s) => {
      const url = buildWsUrl(host, s.name);
      if (url) sourceCache.current[s.name] = { html: buildTerminalHtml(url, terminalTheme) };
    });
  }, [sessions, host, terminalTheme]);

  // Keyboard handling
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setKeyboardOffset(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardOffset(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Terminal helpers
  const sendToTerminal = useCallback((data: string) => {
    const payload = JSON.stringify(data);
    webRefs.current[currentSessionName]?.injectJavaScript(
      `window.__sendToTerminal && window.__sendToTerminal(${payload}); true;`
    );
  }, [currentSessionName]);

  const blurTerminal = useCallback(() => {
    webRefs.current[currentSessionName]?.injectJavaScript(
      'window.__blurTerminal && window.__blurTerminal(); true;'
    );
  }, [currentSessionName]);

  const copyFromTerminal = useCallback(() => {
    webRefs.current[currentSessionName]?.injectJavaScript(
      'window.__copySelection && window.__copySelection(); true;'
    );
  }, [currentSessionName]);

  const focusTerminal = useCallback((sessionName: string) => {
    webRefs.current[sessionName]?.injectJavaScript(
      'window.__focusTerminal && window.__focusTerminal(); true;'
    );
  }, []);

  // Animation state - cumulative offset, never resets
  const offsetX = useSharedValue(initialIndex >= 0 ? -initialIndex * screenWidth : 0);
  const currentIndexShared = useSharedValue(initialIndex >= 0 ? initialIndex : 0);

  const updateCurrentSession = useCallback((index: number) => {
    const session = sessions[index];
    if (!session) return;
    setCurrentSessionName(session.name);
  }, [sessions]);

  useEffect(() => {
    if (sessions.length === 0) return;
    if (currentSessionName && sessions.some((session) => session.name === currentSessionName)) return;
    setCurrentSessionName(sessions[0].name);
  }, [sessions, currentSessionName]);

  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .enabled(!isSelecting)
      .maxPointers(1)
      .activeOffsetX([-15, 15])
      .failOffsetY([-10, 10])
      .onUpdate((e) => {
        const currentIdx = currentIndexShared.value;
        let tx = e.translationX;
        // Rubber band at edges
        if (tx > 0 && currentIdx === 0) tx *= 0.3;
        if (tx < 0 && currentIdx === sessionCount - 1) tx *= 0.3;
        offsetX.value = -currentIdx * screenWidth + tx;
      })
      .onEnd((e) => {
        const currentIdx = currentIndexShared.value;
        const threshold = screenWidth * 0.3;
        const shouldSwitch = Math.abs(e.translationX) > threshold || Math.abs(e.velocityX) > 500;

        let newIndex = currentIdx;
        if (shouldSwitch && e.translationX > 0 && currentIdx > 0) {
          newIndex = currentIdx - 1;
          runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
        } else if (shouldSwitch && e.translationX < 0 && currentIdx < sessionCount - 1) {
          newIndex = currentIdx + 1;
          runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
        }

        currentIndexShared.value = newIndex;
        offsetX.value = withTiming(-newIndex * screenWidth, { duration: 200 }, () => {
          runOnJS(updateCurrentSession)(newIndex);
        });
      });
  }, [screenWidth, sessionCount, offsetX, currentIndexShared, updateCurrentSession, isSelecting]);

  const pagerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }],
  }));

  const keyboardInset = Math.max(0, keyboardOffset);

  useEffect(() => {
    if (!currentSessionName || sessions.length === 0) return;
    const index = sessions.findIndex((session) => session.name === currentSessionName);
    if (index < 0) return;
    if (currentIndexShared.value !== index || offsetX.value !== -index * screenWidth) {
      currentIndexShared.value = index;
      offsetX.value = -index * screenWidth;
    }
  }, [currentSessionName, sessions, screenWidth, offsetX, currentIndexShared]);

  useEffect(() => {
    if (!currentSessionName) return;
    const previousSession = previousSessionRef.current;
    if (previousSession && previousSession !== currentSessionName) {
      webRefs.current[previousSession]?.injectJavaScript(
        'window.__blurTerminal && window.__blurTerminal(); true;'
      );
    }
    if (keyboardInset > 0) {
      focusTerminal(currentSessionName);
    }
    previousSessionRef.current = currentSessionName;
  }, [currentSessionName, focusTerminal, keyboardInset]);

  if (!host) {
    return (
      <Screen>
        <AppText variant="title">Session not found</AppText>
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

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.pager, pagerStyle]}>
          {sessions.map((session, index) => {
            const isCurrent = session.name === currentSessionName;
            return (
              <View key={session.name} style={[styles.page, { left: index * screenWidth }]}>
                {!isCurrent && (
                  <View style={styles.pageLabel}>
                    <AppText variant="caps" style={styles.pageLabelText}>{session.name}</AppText>
                  </View>
                )}
                <View style={[styles.terminal, keyboardInset > 0 && isCurrent && { paddingBottom: keyboardInset + helperHeight }]}>
                  <WebView
                    ref={(ref) => { webRefs.current[session.name] = ref; }}
                    source={sourceCache.current[session.name]}
                    originWhitelist={['*']}
                    scrollEnabled={false}
                    overScrollMode="never"
                    nestedScrollEnabled={true}
                    keyboardDisplayRequiresUserAction={false}
                    hideKeyboardAccessoryView
                    style={styles.webview}
                    javaScriptEnabled
                    domStorageEnabled
                    onLoadEnd={() => {
                      webRefs.current[session.name]?.injectJavaScript('window.__fitTerminal && window.__fitTerminal(); true;');
                    }}
                    onMessage={async (event) => {
                      try {
                        const payload = JSON.parse(event.nativeEvent.data) as {
                          type?: string;
                          text?: unknown;
                          state?: string;
                        };
                        if (!payload || typeof payload !== 'object') return;
                        switch (payload.type) {
                          case 'copy': {
                            if (typeof payload.text !== 'string' || !payload.text) return;
                            await Clipboard.setStringAsync(payload.text);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            return;
                          }
                          case 'haptic':
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            return;
                          case 'selectionStart':
                            setIsSelecting(true);
                            return;
                          case 'selectionEnd':
                            setIsSelecting(false);
                            return;
                          case 'status':
                            if (payload.state === 'connected' || payload.state === 'disconnected') {
                              refresh();
                            }
                            return;
                          default:
                            return;
                        }
                      } catch {}
                    }}
                  />
                </View>
              </View>
            );
          })}
        </Animated.View>
      </GestureDetector>

      {keyboardInset > 0 && (
        <View style={[styles.helperOverlay, { bottom: keyboardInset }]}>
          <View style={styles.helperBar} onLayout={(e) => setHelperHeight(e.nativeEvent.layout.height)}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.helperContent}>
              <Pressable
                style={({ pressed }) => [styles.doneKey, pressed && styles.keyPressed]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); blurTerminal(); }}
              >
                <ChevronDown size={16} color={colors.terminalForeground} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.helperKey, pressed && styles.keyPressed]}
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const text = await Clipboard.getStringAsync();
                  if (text) sendToTerminal(text);
                }}
              >
                <ClipboardPaste size={16} color={colors.terminalForeground} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.helperKey, pressed && styles.keyPressed]}
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    base64: true,
                    quality: 0.8,
                  });
                  const asset = result.assets?.[0];
                  const base64 = asset?.base64;
                  if (!result.canceled && base64 && host) {
                    try {
                      const mimeType = asset.mimeType ?? 'image/jpeg';
                      const { path } = await uploadImage(host, base64, mimeType);
                      sendToTerminal(path + ' ');
                    } catch (err) {
                      console.error('Upload failed:', err);
                    }
                  }
                }}
              >
                <ImageIcon size={16} color={colors.terminalForeground} />
              </Pressable>
              {helperKeys.map((item) => (
                <Pressable
                  key={item.label}
                  style={({ pressed }) => [styles.helperKey, pressed && styles.keyPressed]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); sendToTerminal(item.data); }}
                >
                  {item.icon ? <item.icon size={16} color={colors.terminalForeground} /> : <AppText variant="caps" style={styles.helperText}>{item.label}</AppText>}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </Screen>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createStyles(colors: ThemeColors): TerminalStyles {
  return StyleSheet.create<TerminalStyles>({
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
    pager: {
      flex: 1,
      paddingTop: 4,
    },
    page: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: '100%',
      backgroundColor: colors.terminalBackground,
    },
    pageLabel: {
      position: 'absolute',
      top: 8,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 5,
    },
    pageLabelText: {
      color: colors.terminalMuted,
      backgroundColor: withAlpha(colors.terminalBackground, 0.8),
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      overflow: 'hidden',
    },
    terminal: {
      flex: 1,
      backgroundColor: colors.terminalBackground,
    },
    webview: {
      flex: 1,
      backgroundColor: colors.terminalBackground,
    },
    helperOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
    },
    helperBar: {
      backgroundColor: colors.terminalBackground,
      borderTopWidth: 1,
      borderTopColor: colors.terminalBorder,
      paddingVertical: 8,
    },
    helperContent: {
      paddingHorizontal: 12,
      gap: 8,
    },
    helperKey: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: colors.terminalPressed,
      borderWidth: 1,
      borderColor: colors.terminalBorder,
    },
    helperText: {
      color: colors.terminalForeground,
    },
    doneKey: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: colors.terminalBorder,
    },
    keyPressed: {
      backgroundColor: colors.cardPressed,
    },
  });
}
