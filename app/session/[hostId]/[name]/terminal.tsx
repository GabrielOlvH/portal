import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  AppState,
  type AppStateStatus,
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
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WebView } from 'react-native-webview';
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  OctagonX,
  ClipboardPaste,
  Copy,
  ImageIcon,
  MoreHorizontal,
  X,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { TerminalWebView } from '@/components/TerminalWebView';
import { useStore } from '@/lib/store';
import { useSnippets } from '@/lib/snippets-store';
import { useTheme } from '@/lib/useTheme';
import { useHostLive } from '@/lib/live';
import { uploadImage } from '@/lib/api';
import { buildTerminalHtml, TERMINAL_HTML_VERSION, TerminalFontConfig } from '@/lib/terminal-html';
import type { ThemeColors } from '@/lib/useTheme';

type HelperKeyIcon = React.ComponentType<{ size: number; color: string }>;
type HelperKey = {
  label: string;
  data: string;
  icon?: HelperKeyIcon;
};
type WebViewSource = { html: string };
type SourceCacheEntry = {
  key: string;
  source: WebViewSource;
};
type TerminalStyles = {
  header: ViewStyle;
  headerFloating: ViewStyle;
  headerButton: ViewStyle;
  headerButtonPressed: ViewStyle;
  headerButtonText: TextStyle;
  pager: ViewStyle;
  pagerFrame: ViewStyle;
  pagerContent: ViewStyle;
  page: ViewStyle;
  pageLabel: ViewStyle;
  pageLabelText: TextStyle;
  terminal: ViewStyle;
  webview: ViewStyle;
  helperOverlay: ViewStyle;
  helperBar: ViewStyle;
  helperRow: ViewStyle;
  helperScroll: ViewStyle;
  expandedRow: ViewStyle;
  helperContent: ViewStyle;
  helperKey: ViewStyle;
  helperText: TextStyle;
  doneKey: ViewStyle;
  expandKey: ViewStyle;
  keyPressed: ViewStyle;
};

const mainHelperKeys: HelperKey[] = [
  { label: 'Esc', data: '\u001b' },
  { label: 'Tab', data: '\t' },
  { label: 'Up', data: '\u001b[A', icon: ChevronUp },
  { label: 'Down', data: '\u001b[B', icon: ChevronDown },
  { label: 'Left', data: '\u001b[D', icon: ChevronLeft },
  { label: 'Right', data: '\u001b[C', icon: ChevronRight },
];

const expandedHelperKeys: HelperKey[] = [
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

export default function SessionTerminalScreen(): React.ReactElement {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ hostId: string; name: string }>();
  const initialSessionName = decodeURIComponent(params.name ?? '');
  const { hosts, preferences } = useStore();
  const { snippets } = useSnippets();
  const host = hosts.find((item) => item.id === params.hostId);
  const fontConfig: TerminalFontConfig = useMemo(
    () => ({
      fontFamily: preferences.terminal.fontFamily,
      fontSize: preferences.terminal.fontSize,
    }),
    [preferences.terminal.fontFamily, preferences.terminal.fontSize]
  );
  const isFocused = useIsFocused();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Calculate pager height directly - no need to wait for onLayout
  const pagerHeight = screenHeight - insets.top;

  const [currentSessionName, setCurrentSessionName] = useState(initialSessionName);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [helperHeight, setHelperHeight] = useState(0);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isAccessoryExpanded, setIsAccessoryExpanded] = useState(false);
  const [focusedSessionName, setFocusedSessionName] = useState<string | null>(null);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const keyboardVisibleRef = useRef(false);
  const webRefs = useRef<Record<string, WebView | null>>({});
  const sourceCache = useRef<Record<string, SourceCacheEntry>>({});
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fitScript = 'window.__fitTerminal && window.__fitTerminal(); true;';
  const terminalTheme = useMemo(
    () => ({
      background: colors.terminalBackground,
      foreground: colors.terminalForeground,
      cursor: colors.terminalForeground,
      selection: colors.terminalSelection,
    }),
    [colors]
  );
  const previousSessionRef = useRef<string | null>(null);

  const { state, refresh } = useHostLive(host, { sessions: true, enabled: isFocused });
  const sessions = state?.sessions ?? [];
  const sessionCount = sessions.length;
  const initialIndex = sessions.findIndex((session) => session.name === initialSessionName);

  const themeKey = useMemo(
    () => `${terminalTheme.background}|${terminalTheme.foreground}|${terminalTheme.cursor}`,
    [terminalTheme.background, terminalTheme.foreground, terminalTheme.cursor]
  );
  const fontKey = `${fontConfig.fontFamily}|${fontConfig.fontSize}`;

  const getSourceForSession = useCallback(
    (sessionName: string) => {
      if (!host) return undefined;
      const wsUrl = buildWsUrl(host, sessionName);
      if (!wsUrl) return undefined;
      const cacheKey = `${wsUrl}|${themeKey}|${fontKey}|${TERMINAL_HTML_VERSION}|session`;
      const cached = sourceCache.current[sessionName];
      if (!cached || cached.key !== cacheKey) {
        sourceCache.current[sessionName] = {
          key: cacheKey,
          source: { html: buildTerminalHtml('session', wsUrl, terminalTheme, fontConfig) },
        };
      }
      return sourceCache.current[sessionName]?.source;
    },
    [host, terminalTheme, themeKey, fontConfig, fontKey]
  );

  useEffect(() => {
    const active = new Set(sessions.map((session) => session.name));
    Object.keys(sourceCache.current).forEach((name) => {
      if (!active.has(name)) {
        delete sourceCache.current[name];
      }
    });
  }, [sessions]);

  // Request fresh state on mount to sync newly created sessions
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Keyboard handling
  useEffect(() => {
    const updateKeyboardOffset = (height: number) => {
      if (!isFocused || appState !== 'active') return;
      const nextHeight = Math.max(0, height);
      keyboardVisibleRef.current = nextHeight > 0;
      setKeyboardOffset(nextHeight);
    };
    const show = Keyboard.addListener('keyboardDidShow', (e) => updateKeyboardOffset(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      updateKeyboardOffset(0);
      if (currentSessionName) {
        webRefs.current[currentSessionName]?.injectJavaScript(
          'window.__blurTerminal && window.__blurTerminal(); true;'
        );
      }
    });
    const changeFrame = Keyboard.addListener('keyboardDidChangeFrame', (e) => updateKeyboardOffset(e.endCoordinates.height));
    return () => { show.remove(); hide.remove(); changeFrame.remove(); };
  }, [appState, currentSessionName, isFocused]);

  useEffect(() => {
    if (!isFocused || appState !== 'active') return;
    const height = Keyboard.metrics()?.height ?? 0;
    const isVisible = Keyboard.isVisible();
    if (!isVisible || height <= 0) {
      keyboardVisibleRef.current = false;
      setKeyboardOffset(0);
      return;
    }
    keyboardVisibleRef.current = true;
    setKeyboardOffset(height);
  }, [isFocused, appState]);

  useEffect(() => {
    if (!isFocused || appState !== 'active') return;
    if (keyboardOffset === 0) return;
    const timeout = setTimeout(() => {
      const height = Keyboard.metrics()?.height ?? 0;
      if (!Keyboard.isVisible() || height <= 0) {
        keyboardVisibleRef.current = false;
        setKeyboardOffset(0);
        setIsAccessoryExpanded(false);
      }
    }, 120);
    return () => clearTimeout(timeout);
  }, [appState, isFocused, keyboardOffset]);

  useEffect(() => {
    if (!isFocused || appState !== 'active') return;
    const height = Keyboard.metrics()?.height ?? 0;
    if (Keyboard.isVisible() && height > 0) return;
    if (keyboardOffset === 0) return;
    keyboardVisibleRef.current = false;
    setKeyboardOffset(0);
    setIsAccessoryExpanded(false);
  }, [appState, currentSessionName, isFocused, keyboardOffset]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!isFocused) {
      keyboardVisibleRef.current = false;
      setKeyboardOffset(0);
      setIsAccessoryExpanded(false);
      setFocusedSessionName(null);
    }
  }, [isFocused]);

  useEffect(() => {
    if (appState === 'active') return;
    keyboardVisibleRef.current = false;
    setKeyboardOffset(0);
    setIsAccessoryExpanded(false);
    setFocusedSessionName(null);
  }, [appState]);

  useEffect(() => {
    if (appState !== 'active' || !currentSessionName) return;
    setIsAccessoryExpanded(false);
    const ref = webRefs.current[currentSessionName];
    if (!ref) return;
    const timeout = setTimeout(() => {
      ref.injectJavaScript(fitScript);
      if (keyboardOffset > 0) {
        ref.injectJavaScript('window.__focusTerminal && window.__focusTerminal(); true;');
      }
    }, 60);
    return () => clearTimeout(timeout);
  }, [appState, currentSessionName, keyboardOffset]);

  // Terminal helpers
  const sendToTerminal = useCallback((data: string) => {
    const payload = JSON.stringify(data);
    webRefs.current[currentSessionName]?.injectJavaScript(
      `window.__sendToTerminal && window.__sendToTerminal(${payload}); true;`
    );
  }, [currentSessionName]);

  const blurTerminal = useCallback(() => {
    keyboardVisibleRef.current = false;
    setKeyboardOffset(0);
    setIsAccessoryExpanded(false);
    setFocusedSessionName(null);
    webRefs.current[currentSessionName]?.injectJavaScript(
      'window.__blurTerminal && window.__blurTerminal(); true;'
    );
  }, [currentSessionName]);

  const copyFromTerminal = useCallback(() => {
    webRefs.current[currentSessionName]?.injectJavaScript(
      'window.__copySelection && window.__copySelection(); true;'
    );
  }, [currentSessionName]);

  const uploadPickedImage = useCallback(
    async (result: ImagePicker.ImagePickerResult) => {
      const asset = result.assets?.[0];
      const base64 = asset?.base64;
      if (result.canceled || !base64 || !host) return;
      try {
        const mimeType = asset.mimeType ?? 'image/jpeg';
        const { path } = await uploadImage(host, base64, mimeType);
        sendToTerminal(path + ' ');
      } catch (err) {
        console.error('Upload failed:', err);
      }
    },
    [host, sendToTerminal]
  );

  const pickFromLibrary = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.8,
    });
    await uploadPickedImage(result);
  }, [uploadPickedImage]);

  const takePhoto = useCallback(async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.8,
    });
    await uploadPickedImage(result);
  }, [uploadPickedImage]);

  const handleInsertImage = useCallback(() => {
    const openCamera = () => {
      void takePhoto();
    };
    const openLibrary = () => {
      void pickFromLibrary();
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Take Photo', 'Choose Photo', 'Cancel'],
          cancelButtonIndex: 2,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) openCamera();
          if (buttonIndex === 1) openLibrary();
        }
      );
      return;
    }

    Alert.alert('Insert Image', 'Select a source', [
      { text: 'Take Photo', onPress: openCamera },
      { text: 'Choose Photo', onPress: openLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [pickFromLibrary, takePhoto]);

  const focusTerminal = useCallback((sessionName: string) => {
    webRefs.current[sessionName]?.injectJavaScript(
      'window.__focusTerminal && window.__focusTerminal(); true;'
    );
  }, []);


  const pagerRef = useRef<ScrollView | null>(null);

  const updateCurrentSession = useCallback((index: number) => {
    const session = sessions[index];
    if (!session) return;
    setCurrentSessionName(session.name);
  }, [sessions]);

  const hadSessionsRef = useRef(false);

  useEffect(() => {
    if (sessions.length > 0) {
      hadSessionsRef.current = true;
    }
    // Navigate back if all sessions were killed
    if (sessions.length === 0 && hadSessionsRef.current) {
      router.back();
      return;
    }
    if (sessions.length === 0) return;
    // If current session exists in list, keep it
    if (currentSessionName && sessions.some((session) => session.name === currentSessionName)) return;
    // If initial session exists in list, use it (handles race condition on mount)
    if (initialSessionName && sessions.some((session) => session.name === initialSessionName)) {
      setCurrentSessionName(initialSessionName);
      return;
    }
    // Only fall back to first session if neither current nor initial is found
    // and we've had sessions before (avoids wrong session during initial load)
    if (hadSessionsRef.current) {
      setCurrentSessionName(sessions[0].name);
    }
  }, [sessions, currentSessionName, initialSessionName, router]);


  const handlePagerMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
    if (!Number.isFinite(nextIndex)) return;
    updateCurrentSession(nextIndex);
  }, [screenWidth, updateCurrentSession]);

  const keyboardInset = focusedSessionName === currentSessionName ? Math.max(0, keyboardOffset) : 0;

  // Trigger dimension sync when layout-affecting values change
  useEffect(() => {
    if (!currentSessionName || !isFocused) return;
    const ref = webRefs.current[currentSessionName];
    if (!ref) return;
    // Small delay to let React finish rendering
    const timeout = setTimeout(() => {
      ref.injectJavaScript(fitScript);
    }, 50);
    return () => clearTimeout(timeout);
  }, [currentSessionName, isFocused, pagerHeight, keyboardInset, helperHeight]);


  useEffect(() => {
    if (!currentSessionName || sessions.length === 0) return;
    const index = sessions.findIndex((session) => session.name === currentSessionName);
    if (index < 0) return;
    const x = index * screenWidth;
    // Use requestAnimationFrame to ensure layout is complete before scrolling
    requestAnimationFrame(() => {
      pagerRef.current?.scrollTo({ x, animated: false });
    });
  }, [currentSessionName, sessions, screenWidth]);

  useEffect(() => {
    if (!currentSessionName) return;
    const previousSession = previousSessionRef.current;
    if (previousSession && previousSession !== currentSessionName) {
      webRefs.current[previousSession]?.injectJavaScript(
        'window.__blurTerminal && window.__blurTerminal(); true;'
      );
      setFocusedSessionName((prev) => (prev === previousSession ? null : prev));
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

      <View style={styles.pagerFrame}>
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={!isSelecting}
          onMomentumScrollEnd={handlePagerMomentumEnd}
          scrollEventThrottle={16}
          style={styles.pager}
          contentContainerStyle={[
            styles.pagerContent,
            { height: pagerHeight, width: screenWidth * Math.max(1, sessionCount) },
          ]}
        >
          {sessions.map((session) => {
            const isCurrent = session.name === currentSessionName;
            return (
              <View key={session.name} style={[styles.page, { width: screenWidth, height: pagerHeight }]}>
                {!isCurrent && (
                  <View style={styles.pageLabel}>
                    <AppText variant="caps" style={styles.pageLabelText}>{session.title || session.name}</AppText>
                  </View>
                )}
                <View
                  style={[styles.terminal, keyboardInset > 0 && isCurrent && { paddingBottom: keyboardInset + helperHeight }]}
                >
                  <TerminalWebView
                    setRef={(ref) => { webRefs.current[session.name] = ref; }}
                    source={getSourceForSession(session.name)}
                    style={styles.webview}
                    autoFit
                    onMessage={async (event) => {
                      try {
                        const payload = JSON.parse(event.nativeEvent.data) as {
                          type?: string;
                          text?: unknown;
                          state?: string;
                          focused?: boolean;
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
                          case 'focus':
                            if (payload.focused) {
                              setFocusedSessionName(session.name);
                              return;
                            }
                            setFocusedSessionName((prev) => (prev === session.name ? null : prev));
                            setKeyboardOffset(0);
                            setIsAccessoryExpanded(false);
                            return;
                          case 'sessionEnded':
                            router.back();
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
        </ScrollView>
      </View>

      {keyboardInset > 0 && (
        <View style={[styles.helperOverlay, { bottom: keyboardInset }]}>
          <View style={styles.helperBar} onLayout={(e) => setHelperHeight(e.nativeEvent.layout.height)}>
            <ScrollView
              horizontal
              directionalLockEnabled
              alwaysBounceVertical={false}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.helperContent}
            >
              <Pressable
                style={({ pressed }) => [styles.doneKey, pressed && styles.keyPressed]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); blurTerminal(); }}
              >
                <ChevronDown size={16} color={colors.terminalForeground} />
              </Pressable>
              {mainHelperKeys.map((item) => (
                <Pressable
                  key={item.label}
                  style={({ pressed }) => [styles.helperKey, pressed && styles.keyPressed]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); sendToTerminal(item.data); }}
                >
                  {item.icon ? <item.icon size={16} color={colors.terminalForeground} /> : <AppText variant="caps" style={styles.helperText}>{item.label}</AppText>}
                </Pressable>
              ))}
              <Pressable
                style={({ pressed }) => [isAccessoryExpanded ? styles.doneKey : styles.helperKey, pressed && styles.keyPressed]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsAccessoryExpanded(!isAccessoryExpanded); }}
              >
                {isAccessoryExpanded ? <X size={16} color={colors.terminalForeground} /> : <MoreHorizontal size={16} color={colors.terminalForeground} />}
              </Pressable>
            </ScrollView>
            {isAccessoryExpanded && (
              <ScrollView
                horizontal
                directionalLockEnabled
                alwaysBounceVertical={false}
                showsHorizontalScrollIndicator={false}
                style={styles.expandedRow}
                contentContainerStyle={styles.helperContent}
              >
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
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleInsertImage();
                  }}
                >
                  <ImageIcon size={16} color={colors.terminalForeground} />
                </Pressable>
                {expandedHelperKeys.map((item) => (
                  <Pressable
                    key={item.label}
                    style={({ pressed }) => [styles.helperKey, pressed && styles.keyPressed]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); sendToTerminal(item.data); }}
                  >
                    {item.icon ? <item.icon size={16} color={colors.terminalForeground} /> : <AppText variant="caps" style={styles.helperText}>{item.label}</AppText>}
                  </Pressable>
                ))}
                {snippets.map((snippet) => (
                  <Pressable
                    key={snippet.id}
                    style={({ pressed }) => [styles.helperKey, pressed && styles.keyPressed]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); sendToTerminal(snippet.command); }}
                  >
                    <AppText variant="caps" style={styles.helperText}>{snippet.label}</AppText>
                  </Pressable>
                ))}
              </ScrollView>
            )}
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
    pagerFrame: {
      flex: 1,
    },
    pagerContent: {
      height: '100%',
      alignItems: 'stretch',
    },
    page: {
      flex: 1,
      height: '100%',
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
    helperRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    helperScroll: {
      flex: 1,
    },
    expandedRow: {
      marginTop: 8,
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
    expandKey: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: colors.terminalBorder,
      marginRight: 12,
    },
    keyPressed: {
      backgroundColor: colors.cardPressed,
    },
  });
}
