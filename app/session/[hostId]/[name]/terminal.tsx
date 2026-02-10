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
  TextInput,
  TextStyle,
  useWindowDimensions,
  ViewStyle,
  View,
  PixelRatio,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
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
  Send,
  Type,
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
import { useDeviceType } from '@/lib/useDeviceType';
import { useHostLive } from '@/lib/live';
import { uploadImage } from '@/lib/api';
import { buildTerminalHtml, TERMINAL_HTML_VERSION, TerminalFontConfig } from '@/lib/terminal-html';
import { buildSessionWsUrl } from '@/lib/ws-urls';
import type { ThemeColors } from '@/lib/useTheme';
import { withAlpha } from '@/lib/colors';

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
  pageLabelContent: ViewStyle;
  pageLabelTitle: TextStyle;
  pageLabelMeta: TextStyle;
  pageLabelStatus: ViewStyle;
  pageLabelStatusDot: ViewStyle;
  pageLabelStatusText: TextStyle;
  terminal: ViewStyle;
  webview: ViewStyle;
  helperOverlay: ViewStyle;
  helperBar: ViewStyle;
  helperRow: ViewStyle;
  helperScroll: ViewStyle;
  expandedRow: ViewStyle;
  expandedInputRow: ViewStyle;
  helperContent: ViewStyle;
  helperKey: ViewStyle;
  helperText: TextStyle;
  doneKey: ViewStyle;
  expandKey: ViewStyle;
  keyPressed: ViewStyle;
  dictationInput: TextStyle;
  sendButton: ViewStyle;
  sendButtonDisabled: ViewStyle;
  sessionBar: ViewStyle;
  sessionBarContent: ViewStyle;
  sessionPill: ViewStyle;
  sessionPillActive: ViewStyle;
  sessionPillText: TextStyle;
  sessionPillTextActive: TextStyle;
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
  const { isTablet } = useDeviceType();

  // Use the ScrollView viewport's measured size; that's what `pagingEnabled` snaps to.
  const [pagerViewport, setPagerViewport] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const pageWidth = pagerViewport.width > 0 ? pagerViewport.width : screenWidth;
  const pageHeight = pagerViewport.height > 0 ? pagerViewport.height : screenHeight;

  const [currentSessionName, setCurrentSessionName] = useState(initialSessionName);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [helperHeight, setHelperHeight] = useState(0);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isAccessoryExpanded, setIsAccessoryExpanded] = useState(false);
  const [focusedSessionName, setFocusedSessionName] = useState<string | null>(null);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [inputText, setInputText] = useState('');
  const [isTextInputMode, setIsTextInputMode] = useState(false);
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

  const { state, refresh } = useHostLive(host, { sessions: true, insights: true, enabled: isFocused });

  // Apply manual ordering to sessions
  const sessions = useMemo(() => {
    const rawSessions = state?.sessions ?? [];
    const order = preferences.sessionOrders.find((o) => o.hostId === host?.id);
    if (!order || order.sessionNames.length === 0) return rawSessions;

    const orderMap = new Map(order.sessionNames.map((name, index) => [name, index]));
    return [...rawSessions].sort((a, b) => {
      const aIndex = orderMap.get(a.name) ?? Infinity;
      const bIndex = orderMap.get(b.name) ?? Infinity;
      return aIndex - bIndex;
    });
  }, [state?.sessions, preferences.sessionOrders, host?.id]);
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
      const wsUrl = buildSessionWsUrl(host, sessionName);
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
        if (!isTextInputMode) setIsAccessoryExpanded(false);
      }
    }, 120);
    return () => clearTimeout(timeout);
  }, [appState, isFocused, isTextInputMode, keyboardOffset]);

  useEffect(() => {
    if (!isFocused || appState !== 'active') return;
    const height = Keyboard.metrics()?.height ?? 0;
    if (Keyboard.isVisible() && height > 0) return;
    if (keyboardOffset === 0) return;
    keyboardVisibleRef.current = false;
    setKeyboardOffset(0);
    if (!isTextInputMode) setIsAccessoryExpanded(false);
  }, [appState, currentSessionName, isFocused, isTextInputMode, keyboardOffset]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!isFocused) {
      keyboardVisibleRef.current = false;
      setKeyboardOffset(0);
      setIsAccessoryExpanded(false);
      setIsTextInputMode(false);
      setFocusedSessionName(null);
    }
  }, [isFocused]);

  useEffect(() => {
    if (appState === 'active') return;
    keyboardVisibleRef.current = false;
    setKeyboardOffset(0);
    setIsAccessoryExpanded(false);
    setIsTextInputMode(false);
    setFocusedSessionName(null);
  }, [appState]);

  useEffect(() => {
    if (appState !== 'active' || !currentSessionName) return;
    if (!isTextInputMode) setIsAccessoryExpanded(false);
    const ref = webRefs.current[currentSessionName];
    if (!ref) return;
    // Multiple delayed fit attempts for layout stabilization after app restore
    const delays = [60, 200, 500];
    const timeouts = delays.map(delay => setTimeout(() => {
      ref.injectJavaScript(fitScript);
      if (keyboardOffset > 0 && !isTextInputMode) {
        ref.injectJavaScript('window.__focusTerminal && window.__focusTerminal(); true;');
      }
    }, delay));
    return () => timeouts.forEach(clearTimeout);
  }, [appState, currentSessionName, isTextInputMode, keyboardOffset]);

  // Terminal helpers
  const sendToTerminal = useCallback((data: string) => {
    const payload = JSON.stringify(data);
    webRefs.current[currentSessionName]?.injectJavaScript(
      `window.__sendToTerminal && window.__sendToTerminal(${payload}); true;`
    );
  }, [currentSessionName]);

  const handleSendInput = useCallback(() => {
    if (!inputText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendToTerminal(inputText);
    setInputText('');
    setIsTextInputMode(false);
  }, [inputText, sendToTerminal]);

  const textInputRef = useRef<React.ElementRef<typeof TextInput>>(null);

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
  const prevPageWidthRef = useRef(pageWidth);

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


  const lastSnappedIndexRef = useRef<number | null>(null);

  const handlePagerScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0) return;
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    if (!Number.isFinite(nextIndex)) return;
    if (lastSnappedIndexRef.current !== null && nextIndex !== lastSnappedIndexRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    lastSnappedIndexRef.current = nextIndex;
  }, [pageWidth]);

  const handlePagerMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0) return;
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    if (!Number.isFinite(nextIndex)) return;
    updateCurrentSession(nextIndex);
  }, [pageWidth, updateCurrentSession]);

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
  }, [currentSessionName, isFocused, pageWidth, pageHeight, keyboardInset, helperHeight]);


  // Track the previous session name to detect actual changes
  const prevCurrentSessionNameRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentSessionName || sessions.length === 0) return;
    
    // Only scroll programmatically when currentSessionName actually changes,
    // not when sessions array updates from live polling (which would snap back mid-scroll)
    if (prevCurrentSessionNameRef.current === currentSessionName) return;
    prevCurrentSessionNameRef.current = currentSessionName;
    
    const index = sessions.findIndex((session) => session.name === currentSessionName);
    if (index < 0) return;
    if (pageWidth <= 0) return;
    const x = index * pageWidth;
    // Use requestAnimationFrame to ensure layout is complete before scrolling
    requestAnimationFrame(() => {
      pagerRef.current?.scrollTo({ x, animated: false });
    });
  }, [currentSessionName, sessions, pageWidth]);

  // Keep the pager snapped correctly when the window width changes (rotation, iPad split view, etc).
  // Without this, the ScrollView can end up "between pages", leaving blank space and making the
  // terminal look like it isn't filling the screen.
  useEffect(() => {
    if (!currentSessionName) return;
    if (pageWidth <= 0) return;
    if (prevPageWidthRef.current === pageWidth) return;
    prevPageWidthRef.current = pageWidth;
    const index = sessions.findIndex((session) => session.name === currentSessionName);
    if (index < 0) return;
    requestAnimationFrame(() => {
      pagerRef.current?.scrollTo({ x: index * pageWidth, animated: false });
    });
  }, [currentSessionName, pageWidth, sessions]);

  useEffect(() => {
    if (!currentSessionName) return;
    const previousSession = previousSessionRef.current;
    if (previousSession && previousSession !== currentSessionName) {
      webRefs.current[previousSession]?.injectJavaScript(
        'window.__blurTerminal && window.__blurTerminal(); true;'
      );
      setFocusedSessionName((prev) => (prev === previousSession ? null : prev));
    }
    if (keyboardInset > 0 && !isTextInputMode) {
      focusTerminal(currentSessionName);
    }
    previousSessionRef.current = currentSessionName;
  }, [currentSessionName, focusTerminal, isTextInputMode, keyboardInset]);


  if (!host) {
    return (
      <Screen>
        <AppText variant="title">Session not found</AppText>
      </Screen>
    );
  }

  return (
    <Screen variant="terminal">
      <Stack.Screen options={{ contentStyle: { backgroundColor: colors.terminalBackground } }} />
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

      <View
        style={styles.pagerFrame}
      >
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={!isSelecting}
          contentInsetAdjustmentBehavior="never"
          onScroll={handlePagerScroll}
          onMomentumScrollEnd={handlePagerMomentumEnd}
          scrollEventThrottle={16}
          style={styles.pager}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width <= 0 || height <= 0) return;
            // Round up to the nearest physical pixel. Rounding down is how you get
            // a 1px "gap" on the right/bottom where the previous screen shows through.
            const scale = PixelRatio.get();
            const w = Math.ceil(width * scale) / scale;
            const h = Math.ceil(height * scale) / scale;
            setPagerViewport((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
          }}
          contentContainerStyle={[
            styles.pagerContent,
            (() => {
              const count = Math.max(1, sessionCount);
              const scale = PixelRatio.get();
              const contentWidth = Math.ceil((pageWidth * count) * scale) / scale;
              const contentHeight = Math.ceil(pageHeight * scale) / scale;
              return { height: contentHeight, width: contentWidth };
            })(),
          ]}
        >
          {sessions.map((session) => {
            const isCurrent = session.name === currentSessionName;
            const agentState = session.insights?.meta?.agentState ?? 'stopped';
            const cwd = session.insights?.meta?.cwd;
            const projectName = cwd?.split('/').filter(Boolean).pop();
            const command = session.insights?.meta?.agentCommand;
            const isRunning = agentState === 'running';
            const isIdle = agentState === 'idle';
            const statusColor = isRunning ? colors.green : isIdle ? colors.orange : colors.textMuted;

            return (
              <View key={session.name} style={[styles.page, { width: pageWidth, height: pageHeight }]}>
                {!isCurrent && (
                  <View style={styles.pageLabel}>
                    <View style={styles.pageLabelContent}>
                      <AppText variant="body" style={styles.pageLabelTitle} numberOfLines={2}>{session.title || session.name}</AppText>
                      {projectName && (
                        <AppText variant="mono" style={styles.pageLabelMeta}>{projectName}</AppText>
                      )}
                      {command && (
                        <AppText variant="mono" style={[styles.pageLabelMeta, { fontSize: 11 }]} numberOfLines={1}>
                          {command}
                        </AppText>
                      )}
                      <View style={styles.pageLabelStatus}>
                        <View style={[styles.pageLabelStatusDot, { backgroundColor: statusColor }]} />
                        <AppText variant="label" style={styles.pageLabelStatusText}>{agentState}</AppText>
                      </View>
                    </View>
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
                          case 'hapticLight':
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                            // Don't reset keyboard state if we're in text input mode
                            if (isTextInputMode) return;
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
        <View style={styles.helperBar} onLayout={(e) => {
          const height = e.nativeEvent.layout.height;
          setHelperHeight(height);
        }}>
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
              isTextInputMode ? (
                <View style={styles.expandedInputRow}>
                  <Pressable
                    style={({ pressed }) => [styles.helperKey, pressed && styles.keyPressed]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setIsTextInputMode(false);
                      setInputText('');
                    }}
                  >
                    <X size={16} color={colors.terminalForeground} />
                  </Pressable>
                  <TextInput
                    ref={textInputRef}
                    style={styles.dictationInput}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="Type or dictate..."
                    placeholderTextColor={colors.terminalMuted}
                    onSubmitEditing={handleSendInput}
                    returnKeyType="send"
                    autoCapitalize="none"
                    autoCorrect={false}
                    blurOnSubmit={false}
                  />
                  <Pressable
                    style={({ pressed }) => [
                      styles.sendButton,
                      !inputText.trim() && styles.sendButtonDisabled,
                      pressed && inputText.trim() && styles.keyPressed,
                    ]}
                    onPress={handleSendInput}
                    disabled={!inputText.trim()}
                  >
                    <Send size={16} color={inputText.trim() ? colors.terminalForeground : colors.terminalMuted} />
                  </Pressable>
                </View>
              ) : (
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
                  <Pressable
                    style={({ pressed }) => [styles.helperKey, pressed && styles.keyPressed]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setIsTextInputMode(true);
                      setTimeout(() => textInputRef.current?.focus(), 100);
                    }}
                  >
                    <Type size={16} color={colors.terminalForeground} />
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
              )
            )}
          </View>
        </View>
      )}
    </Screen>
  );
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
      backgroundColor: colors.terminalBackground,
      width: '100%',
    },
    pagerFrame: {
      flex: 1,
      backgroundColor: colors.terminalBackground,
      width: '100%',
    },
    pagerContent: {
      height: '100%',
      alignItems: 'stretch',
    },
    page: {
      flex: 1,
      height: '100%',
      backgroundColor: colors.terminalBackground,
      width: '100%',
    },
    pageLabel: {
      position: 'absolute',
      top: '50%',
      left: 0,
      right: 0,
      alignItems: 'center',
      justifyContent: 'center',
      transform: [{ translateY: -40 }],
      zIndex: 5,
    },
    pageLabelContent: {
      alignItems: 'center',
      backgroundColor: withAlpha(colors.terminalBackground, 0.95),
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.terminalBorder,
      gap: 8,
    },
    pageLabelTitle: {
      color: colors.terminalForeground,
      fontSize: 18,
      fontWeight: '600',
    },
    pageLabelMeta: {
      color: colors.terminalMuted,
      fontSize: 13,
    },
    pageLabelStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
    },
    pageLabelStatusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    pageLabelStatusText: {
      color: colors.terminalMuted,
      fontSize: 12,
      textTransform: 'capitalize',
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
      bottom: 0,
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
    expandedInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      gap: 8,
      marginTop: 8,
    },
    dictationInput: {
      flex: 1,
      backgroundColor: colors.terminalPressed,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.terminalBorder,
      paddingHorizontal: 10,
      paddingVertical: 6,
      color: colors.terminalForeground,
      fontSize: 14,
    },
    sendButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: colors.terminalPressed,
      borderWidth: 1,
      borderColor: colors.terminalBorder,
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    sessionBar: {
      backgroundColor: colors.terminalBackground,
      borderTopWidth: 1,
      borderTopColor: colors.terminalBorder,
      paddingVertical: 8,
    },
    sessionBarContent: {
      paddingHorizontal: 12,
      gap: 8,
    },
    sessionPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.terminalPressed,
      borderWidth: 1,
      borderColor: colors.terminalBorder,
    },
    sessionPillActive: {
      backgroundColor: colors.blue,
      borderColor: colors.blue,
    },
    sessionPillText: {
      color: colors.terminalForeground,
      fontSize: 13,
    },
    sessionPillTextActive: {
      color: '#fff',
    },
  });
}
