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
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { WebView } from 'react-native-webview';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardPaste,
  ImageIcon,
  MoreHorizontal,
  Send,
  Type,
  X,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';

import { AppText } from '@/components/AppText';
import { TerminalWebView } from '@/components/TerminalWebView';
import { buildTerminalHtml, TERMINAL_HTML_VERSION, type TerminalFontConfig } from '@/lib/terminal-html';
import { buildSessionWsUrl } from '@/lib/ws-urls';
import { uploadImage } from '@/lib/api';
import { useStore } from '@/lib/store';
import { useSnippets } from '@/lib/snippets-store';
import { useTheme, type ThemeColors } from '@/lib/useTheme';
import type { SessionWithHost } from '@/lib/workspace-types';

// ─── Helper Keys ─────────────────────────────────────────────────────────────

type HelperKeyIcon = React.ComponentType<{ size: number; color: string }>;
type HelperKey = {
  label: string;
  data: string;
  icon?: HelperKeyIcon;
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

// ─── Types ───────────────────────────────────────────────────────────────────

type WebViewSource = { html: string };
type SourceCacheEntry = { key: string; source: WebViewSource };

export type SessionTerminalPageProps = {
  session: SessionWithHost;
  isActive: boolean;
  onSelectingChange?: (selecting: boolean) => void;
};

// ─── Component ───────────────────────────────────────────────────────────────

export function SessionTerminalPage({
  session,
  isActive,
  onSelectingChange,
}: SessionTerminalPageProps) {
  const { colors } = useTheme();
  const { preferences } = useStore();
  const { snippets } = useSnippets();
  const isFocused = useIsFocused();

  const wasEverActive = useRef(false);
  const webRef = useRef<WebView | null>(null);

  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [helperHeight, setHelperHeight] = useState(0);
  const [isAccessoryExpanded, setIsAccessoryExpanded] = useState(false);
  const [isFocusedOnTerminal, setIsFocusedOnTerminal] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [inputText, setInputText] = useState('');
  const [isTextInputMode, setIsTextInputMode] = useState(false);

  const keyboardVisibleRef = useRef(false);
  const textInputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const sourceCache = useRef<SourceCacheEntry | null>(null);

  const fontConfig: TerminalFontConfig = useMemo(
    () => ({
      fontFamily: preferences.terminal.fontFamily,
      fontSize: preferences.terminal.fontSize,
    }),
    [preferences.terminal.fontFamily, preferences.terminal.fontSize]
  );

  const terminalTheme = useMemo(
    () => ({
      background: colors.terminalBackground,
      foreground: colors.terminalForeground,
      cursor: colors.terminalForeground,
      selection: colors.terminalSelection,
    }),
    [colors]
  );

  const themeKey = `${terminalTheme.background}|${terminalTheme.foreground}`;
  const fontKey = `${fontConfig.fontFamily}|${fontConfig.fontSize}`;

  const terminalSource = useMemo(() => {
    const wsUrl = buildSessionWsUrl(session.host, session.name);
    if (!wsUrl) return undefined;
    const cacheKey = `${wsUrl}|${themeKey}|${fontKey}|${TERMINAL_HTML_VERSION}|session`;
    if (!sourceCache.current || sourceCache.current.key !== cacheKey) {
      sourceCache.current = {
        key: cacheKey,
        source: { html: buildTerminalHtml('session', wsUrl, terminalTheme, fontConfig) },
      };
    }
    return sourceCache.current.source;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.host, session.name, themeKey, fontKey]);

  useEffect(() => {
    if (isActive) wasEverActive.current = true;
  }, [isActive]);

  const fitScript = 'window.__fitTerminal && window.__fitTerminal(); true;';

  const sendToTerminal = useCallback((data: string) => {
    const payload = JSON.stringify(data);
    webRef.current?.injectJavaScript(
      `window.__sendToTerminal && window.__sendToTerminal(${payload}); true;`
    );
  }, []);

  const blurTerminal = useCallback(() => {
    keyboardVisibleRef.current = false;
    setKeyboardOffset(0);
    setIsAccessoryExpanded(false);
    setIsFocusedOnTerminal(false);
    webRef.current?.injectJavaScript(
      'window.__blurTerminal && window.__blurTerminal(); true;'
    );
  }, []);

  const handleSendInput = useCallback(() => {
    if (!inputText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendToTerminal(inputText);
    setInputText('');
    setIsTextInputMode(false);
  }, [inputText, sendToTerminal]);

  const uploadPickedImage = useCallback(
    async (result: ImagePicker.ImagePickerResult) => {
      const asset = result.assets?.[0];
      const base64 = asset?.base64;
      if (result.canceled || !base64) return;
      try {
        const mimeType = asset.mimeType ?? 'image/jpeg';
        const { path } = await uploadImage(session.host, base64, mimeType);
        sendToTerminal(path + ' ');
      } catch (err) {
        console.error('Upload failed:', err);
      }
    },
    [session.host, sendToTerminal]
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
    const openCamera = () => { void takePhoto(); };
    const openLibrary = () => { void pickFromLibrary(); };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Take Photo', 'Choose Photo', 'Cancel'], cancelButtonIndex: 2 },
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

  // Keyboard handling
  useEffect(() => {
    if (!isActive) return;
    const updateKeyboardOffset = (height: number) => {
      if (!isFocused || appState !== 'active') return;
      const nextHeight = Math.max(0, height);
      keyboardVisibleRef.current = nextHeight > 0;
      setKeyboardOffset(nextHeight);
    };
    const show = Keyboard.addListener('keyboardDidShow', (e) => updateKeyboardOffset(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      updateKeyboardOffset(0);
      webRef.current?.injectJavaScript('window.__blurTerminal && window.__blurTerminal(); true;');
    });
    const changeFrame = Keyboard.addListener('keyboardDidChangeFrame', (e) => updateKeyboardOffset(e.endCoordinates.height));
    return () => { show.remove(); hide.remove(); changeFrame.remove(); };
  }, [isActive, appState, isFocused]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!isFocused || !isActive) {
      keyboardVisibleRef.current = false;
      setKeyboardOffset(0);
      setIsAccessoryExpanded(false);
      setIsTextInputMode(false);
      setIsFocusedOnTerminal(false);
    }
  }, [isFocused, isActive]);

  useEffect(() => {
    if (appState === 'active') return;
    keyboardVisibleRef.current = false;
    setKeyboardOffset(0);
    setIsAccessoryExpanded(false);
    setIsTextInputMode(false);
    setIsFocusedOnTerminal(false);
  }, [appState]);

  // Refit terminal when active and keyboard changes
  useEffect(() => {
    if (!isActive || !isFocused) return;
    const timeout = setTimeout(() => {
      webRef.current?.injectJavaScript(fitScript);
    }, 50);
    return () => clearTimeout(timeout);
  }, [isActive, isFocused, keyboardOffset, helperHeight, fitScript]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const keyboardInset = isFocusedOnTerminal ? Math.max(0, keyboardOffset) : 0;

  if (!isActive && !wasEverActive.current) {
    return <View style={{ flex: 1, backgroundColor: colors.terminalBackground }} />;
  }

  return (
    <View style={styles.container}>
      {/* Terminal */}
      <View style={[styles.terminal, keyboardInset > 0 && { paddingBottom: keyboardInset + helperHeight }]}>
        <TerminalWebView
          setRef={(ref) => { webRef.current = ref; }}
          source={terminalSource}
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
                  onSelectingChange?.(true);
                  return;
                case 'selectionEnd':
                  onSelectingChange?.(false);
                  return;
                case 'focus':
                  if (payload.focused) {
                    setIsFocusedOnTerminal(true);
                  }
                  return;
                default:
                  return;
              }
            } catch {}
          }}
        />
      </View>

      {/* Helper keys bar */}
      {keyboardInset > 0 && (
        <View style={[styles.helperOverlay, { bottom: keyboardInset }]}>
          <View
            style={styles.helperBar}
            onLayout={(e) => setHelperHeight(e.nativeEvent.layout.height)}
          >
            <ScrollView
              horizontal
              directionalLockEnabled
              alwaysBounceVertical={false}
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
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
                  {item.icon
                    ? <item.icon size={16} color={colors.terminalForeground} />
                    : <AppText variant="caps" style={styles.helperText}>{item.label}</AppText>}
                </Pressable>
              ))}
              <Pressable
                style={({ pressed }) => [isAccessoryExpanded ? styles.doneKey : styles.helperKey, pressed && styles.keyPressed]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsAccessoryExpanded(!isAccessoryExpanded); }}
              >
                {isAccessoryExpanded
                  ? <X size={16} color={colors.terminalForeground} />
                  : <MoreHorizontal size={16} color={colors.terminalForeground} />}
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
                  keyboardShouldPersistTaps="handled"
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
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleInsertImage(); }}
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
                      {item.icon
                        ? <item.icon size={16} color={colors.terminalForeground} />
                        : <AppText variant="caps" style={styles.helperText}>{item.label}</AppText>}
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

    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.terminalBackground,
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
    expandedRow: {
      marginTop: 8,
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
  });
}
