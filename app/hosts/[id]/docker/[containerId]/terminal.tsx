import React, { useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Copy, OctagonX } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { useStore } from '@/lib/store';
import { ThemeColors, useTheme } from '@/lib/useTheme';

type WebViewSource = { html: string };
type SourceCacheEntry = {
  key: string;
  source: WebViewSource;
};

function buildDockerWsUrl(host: { baseUrl: string; authToken?: string }, containerId: string): string {
  try {
    const base = new URL(host.baseUrl);
    const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams();
    params.set('container', containerId);
    params.set('shell', 'sh');
    params.set('cols', '80');
    params.set('rows', '24');
    if (host.authToken) params.set('token', host.authToken);
    return `${protocol}//${base.host}/docker/exec?${params.toString()}`;
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

      function sendToRN(payload) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      }

      function connect() {
        socket = new WebSocket('${wsUrl}');
        socket.onopen = () => {
          setTimeout(() => { fitAddon.fit(); sendResize(); }, 50);
        };
        socket.onmessage = (event) => term.write(event.data);
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

      window.__fitTerminal = () => { fitAddon.fit(); sendResize(); };
      window.__sendCtrlC = () => {
        if (socket?.readyState === 1) socket.send(JSON.stringify({ type: 'input', data: '\\u0003' }));
      };
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

      // Touch selection: long-press to select text
      let touchStartX = 0;
      let touchStartY = 0;
      let touchStartTime = 0;
      let isSelectionMode = false;
      let selectionStartCol = 0;
      let selectionStartRow = 0;
      const LONG_PRESS_DURATION = 400;
      const MOVE_THRESHOLD = 10;

      function getCellSize() {
        const core = term._core;
        return {
          width: core._renderService.dimensions.css.cell.width,
          height: core._renderService.dimensions.css.cell.height
        };
      }

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
          touchStartTime = Date.now();
          isSelectionMode = false;
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

          if (!isSelectionMode && !moved && elapsed > LONG_PRESS_DURATION) {
            isSelectionMode = true;
            const start = touchToCell(touchStartX, touchStartY);
            selectionStartCol = start.col;
            selectionStartRow = start.row;
            term.select(selectionStartCol, selectionStartRow + term.buffer.active.viewportY, 1);
            sendToRN({ type: 'haptic' });
            return;
          }

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
          }
        }
      }, { passive: true });

      window.addEventListener('resize', () => { fitAddon.fit(); sendResize(); });
      connect();
    </script>
  </body>
</html>`;
}

export default function DockerTerminalScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id: string; containerId: string }>();
  const { hosts } = useStore();
  const host = hosts.find((item) => item.id === params.id);
  const containerId = params.containerId ? decodeURIComponent(params.containerId) : '';

  const wsUrl = useMemo(() => (host && containerId ? buildDockerWsUrl(host, containerId) : ''), [host, containerId]);
  const terminalTheme = useMemo(
    () => ({
      background: colors.terminalBackground,
      foreground: colors.terminalForeground,
      cursor: colors.terminalForeground,
    }),
    [colors]
  );
  const sourceCache = useRef<SourceCacheEntry | null>(null);
  const source = useMemo(() => {
    if (!wsUrl) return undefined;
    const cacheKey = `${wsUrl}|${terminalTheme.background}|${terminalTheme.foreground}|${terminalTheme.cursor}`;
    if (!sourceCache.current || sourceCache.current.key !== cacheKey) {
      sourceCache.current = {
        key: cacheKey,
        source: { html: buildTerminalHtml(wsUrl, terminalTheme) },
      };
    }
    return sourceCache.current.source;
  }, [
    wsUrl,
    terminalTheme.background,
    terminalTheme.foreground,
    terminalTheme.cursor,
  ]);
  const webRef = useRef<WebView | null>(null);
  const styles = useMemo(() => createStyles(colors), [colors]);

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
              webRef.current?.injectJavaScript('window.__sendCtrlC && window.__sendCtrlC(); true;');
            }}
          >
            <OctagonX size={16} color={colors.red} />
          </Pressable>
        </View>
      </View>

      <View style={styles.terminal}>
        <WebView
          ref={(ref) => { webRef.current = ref; }}
          source={source}
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
