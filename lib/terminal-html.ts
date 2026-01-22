export type TerminalHtmlProfile = 'session' | 'docker' | 'logs';
export type TerminalTheme = { background: string; foreground: string; cursor?: string; selection?: string };
export type TerminalFontConfig = { fontFamily: string; fontSize: number };

const FONT_FAMILIES: Record<string, { css: string; google?: string }> = {
  'JetBrains Mono': {
    css: '"JetBrains Mono", monospace',
    google: 'JetBrains+Mono:wght@400;500',
  },
  'Fira Code': {
    css: '"Fira Code", monospace',
    google: 'Fira+Code:wght@400;500',
  },
  'Source Code Pro': {
    css: '"Source Code Pro", monospace',
    google: 'Source+Code+Pro:wght@400;500',
  },
  'SF Mono': {
    css: '"SF Mono", SFMono-Regular, monospace',
    google: undefined,
  },
  'Menlo': {
    css: 'Menlo, monospace',
    google: undefined,
  },
};

type TerminalHtmlMode = 'interactive' | 'logs';
type TerminalStatusMode = 'none' | 'terminal' | 'logs';
type ReconnectStrategy = 'fixed' | 'exponential';

type TerminalHtmlConfig = {
  wsUrl: string;
  mode: TerminalHtmlMode;
  theme: { background: string; foreground: string; cursor: string; selectionBackground?: string };
  fontFamily: string;
  fontSize: number;
  scrollback?: number;
  enableInput: boolean;
  enableResize: boolean;
  enableAck: boolean;
  enableReconnect: boolean;
  reconnectStrategy: ReconnectStrategy;
  reconnectDelayMs: number;
  reconnectMaxDelayMs?: number;
  reconnectMaxAttempts?: number;
  reconnectOnCleanClose: boolean;
  notifyStatus: TerminalStatusMode;
  stopReconnectReasons?: string[];
  emitSessionEnded: boolean;
  emitFocusEvents: boolean;
  enableOverlay: boolean;
  enableSgrScroll: boolean;
  emitSelectionEvents: boolean;
  autoScroll: boolean;
  hideTextarea: boolean;
  exposeReconnect: boolean;
  allowCopyAll: boolean;
};

export const TERMINAL_HTML_VERSION = 'xterm-shared-v1';

function buildConfig(profile: TerminalHtmlProfile, wsUrl: string, theme: TerminalTheme, font: TerminalFontConfig): TerminalHtmlConfig {
  const cursor = theme.cursor ?? theme.foreground;
  const selectionBackground = theme.selection;
  const fontConfig = FONT_FAMILIES[font.fontFamily] ?? FONT_FAMILIES['JetBrains Mono'];
  if (profile === 'logs') {
    return {
      wsUrl,
      mode: 'logs',
      theme: { background: theme.background, foreground: theme.foreground, cursor: theme.background, selectionBackground },
      fontFamily: fontConfig.css,
      fontSize: 11,
      scrollback: 10000,
      enableInput: false,
      enableResize: false,
      enableAck: false,
      enableReconnect: true,
      reconnectStrategy: 'exponential',
      reconnectDelayMs: 1000,
      reconnectMaxDelayMs: 10000,
      reconnectMaxAttempts: 5,
      reconnectOnCleanClose: false,
      notifyStatus: 'logs',
      emitSessionEnded: false,
      emitFocusEvents: false,
      enableOverlay: false,
      enableSgrScroll: false,
      emitSelectionEvents: false,
      autoScroll: true,
      hideTextarea: true,
      exposeReconnect: true,
      allowCopyAll: true,
    };
  }

  if (profile === 'docker') {
    return {
      wsUrl,
      mode: 'interactive',
      theme: { background: theme.background, foreground: theme.foreground, cursor, selectionBackground },
      fontFamily: fontConfig.css,
      fontSize: font.fontSize,
      enableInput: true,
      enableResize: true,
      enableAck: true,
      enableReconnect: false,
      reconnectStrategy: 'fixed',
      reconnectDelayMs: 1000,
      reconnectOnCleanClose: false,
      notifyStatus: 'none',
      emitSessionEnded: false,
      emitFocusEvents: true,
      enableOverlay: true,
      enableSgrScroll: false,
      emitSelectionEvents: false,
      autoScroll: false,
      hideTextarea: false,
      exposeReconnect: false,
      allowCopyAll: false,
    };
  }

  return {
    wsUrl,
    mode: 'interactive',
    theme: { background: theme.background, foreground: theme.foreground, cursor, selectionBackground },
    fontFamily: fontConfig.css,
    fontSize: font.fontSize,
    enableInput: true,
    enableResize: true,
    enableAck: true,
    enableReconnect: true,
    reconnectStrategy: 'fixed',
    reconnectDelayMs: 1000,
    reconnectOnCleanClose: true,
    notifyStatus: 'terminal',
    stopReconnectReasons: ['session ended', 'session not found'],
    emitSessionEnded: true,
    emitFocusEvents: true,
    enableOverlay: true,
    enableSgrScroll: true,
    emitSelectionEvents: true,
    autoScroll: false,
    hideTextarea: false,
    exposeReconnect: false,
    allowCopyAll: false,
  };
}

function getGoogleFontsLink(fontFamily: string): string {
  const fontConfig = FONT_FAMILIES[fontFamily];
  if (!fontConfig?.google) return '';
  return `<link href="https://fonts.googleapis.com/css2?family=${fontConfig.google}&display=swap" rel="stylesheet" />`;
}

export function buildTerminalHtml(profile: TerminalHtmlProfile, wsUrl: string, theme: TerminalTheme, font: TerminalFontConfig): string {
  const config = buildConfig(profile, wsUrl, theme, font);
  const googleFontsLink = getGoogleFontsLink(font.fontFamily);
  const configJson = JSON.stringify(config);
  const overlayMarkup = config.enableOverlay ? '<div id="overlay"></div>' : '';
  const baseStyles = config.enableOverlay
    ? `
      body { position: relative; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; }
      #terminal { width: 100%; height: 100%; padding: 0 4px; box-sizing: border-box; }
      #overlay { position: absolute; inset: 0; z-index: 2; }
      #terminal, #overlay {
        -webkit-user-select: none;
        user-select: none;
        -webkit-touch-callout: none;
      }
    `
    : `
      #root { width: 100%; height: 100%; overflow: hidden; }
      #terminal { height: 100%; width: 100%; padding: 0 4px; box-sizing: border-box; }
    `;
  const textareaStyles = config.hideTextarea
    ? '.xterm-helper-textarea { font-size: 16px; opacity: 0; pointer-events: none; }'
    : '.xterm-helper-textarea { font-size: 16px; }';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    ${googleFontsLink ? `<link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    ${googleFontsLink}` : ''}
    <link id="xterm-css" rel="stylesheet" href="https://unpkg.com/xterm/css/xterm.css" />
    <style>
      html, body { height: 100%; width: 100%; margin: 0; background: ${config.theme.background}; overflow: hidden; -webkit-text-size-adjust: 100%; }
      ${baseStyles}
      ${textareaStyles}
    </style>
  </head>
  <body>
    <div id="root">
      <div id="terminal"></div>
      ${overlayMarkup}
    </div>
    <script src="https://unpkg.com/xterm/lib/xterm.js"></script>
    <script src="https://unpkg.com/xterm-addon-fit/lib/xterm-addon-fit.js"></script>
    <script>
      const config = ${configJson};
      const termOptions = {
        cursorBlink: config.mode === 'interactive',
        disableStdin: config.mode !== 'interactive',
        fontFamily: config.fontFamily,
        fontSize: config.fontSize,
        allowProposedApi: true,
        rendererType: 'canvas',
        theme: config.theme,
      };
      if (config.scrollback) termOptions.scrollback = config.scrollback;
      const term = new Terminal(termOptions);
      const fitAddon = new FitAddon.FitAddon();
      term.loadAddon(fitAddon);
      term.open(document.getElementById('terminal'));
      const terminalEl = document.getElementById('terminal');

      let socket = null;
      let reconnectTimer = null;
      let reconnectAttempts = 0;
      let hasFitted = false;
      let fitScheduled = false;
      let fitRetryTimer = null;
      let fitRetryCount = 0;
      let renderFitTriggered = false;
      let lastCols = 0;
      let lastRows = 0;
      let outputBuffer = '';
      let outputScheduled = false;
      let inputBuffer = '';
      let inputScheduled = false;
      let autoScroll = Boolean(config.autoScroll);
      let fontsReady = false;
      let layoutReady = false;
      let fontReadyTimer = null;

      function scheduleMicrotask(fn) {
        if (typeof queueMicrotask === 'function') {
          queueMicrotask(fn);
          return;
        }
        Promise.resolve().then(fn);
      }

      function sendToRN(payload) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      }

      function flushOutput() {
        if (!outputBuffer) return;
        const chunk = outputBuffer;
        outputBuffer = '';
        term.write(chunk, () => {
          if (config.enableAck && socket?.readyState === 1) {
            socket.send(JSON.stringify({ type: 'ack', bytes: chunk.length }));
          }
          if (autoScroll) {
            term.scrollToBottom();
          }
        });
      }

      function queueOutput(data) {
        outputBuffer += data;
        if (outputScheduled) return;
        outputScheduled = true;
        scheduleMicrotask(() => {
          outputScheduled = false;
          flushOutput();
        });
      }

      function flushInput() {
        if (!inputBuffer || !config.enableInput) return;
        const chunk = inputBuffer;
        inputBuffer = '';
        if (socket?.readyState === 1) {
          socket.send(JSON.stringify({ type: 'input', data: chunk }));
        }
      }

      function queueInput(data) {
        if (!data || !config.enableInput) return;
        if (socket?.readyState === 1 && data.length <= 1 && !inputScheduled && !inputBuffer) {
          socket.send(JSON.stringify({ type: 'input', data }));
          return;
        }
        inputBuffer += data;
        if (inputScheduled) return;
        inputScheduled = true;
        scheduleMicrotask(() => {
          inputScheduled = false;
          flushInput();
        });
      }

      function emitStatusConnected() {
        if (config.notifyStatus === 'terminal') {
          sendToRN({ type: 'status', state: 'connected' });
        } else if (config.notifyStatus === 'logs') {
          sendToRN({ type: 'connected' });
        }
      }

      function emitStatusDisconnected(reason) {
        if (config.notifyStatus === 'terminal') {
          sendToRN({ type: 'status', state: 'disconnected' });
        } else if (config.notifyStatus === 'logs') {
          sendToRN({ type: 'disconnected', reason });
        }
      }

      function emitStatusError() {
        if (config.notifyStatus === 'terminal') {
          sendToRN({ type: 'status', state: 'error' });
        } else if (config.notifyStatus === 'logs') {
          sendToRN({ type: 'error' });
        }
      }

      function sendResize() {
        if (!config.enableResize || socket?.readyState !== 1) return;
        const cols = term.cols;
        const rows = term.rows;
        if (!cols || !rows) return;
        if (cols === lastCols && rows === lastRows) return;
        lastCols = cols;
        lastRows = rows;
        socket.send(JSON.stringify({ type: 'resize', cols, rows }));
      }

      function updateLayoutReady() {
        if (!terminalEl) return;
        const rect = terminalEl.getBoundingClientRect();
        const ready = rect.width > 0 && rect.height > 0;
        if (ready !== layoutReady) {
          layoutReady = ready;
          if (layoutReady && fontsReady) {
            fitBurst();
          }
        }
      }

      function canFit() {
        return fontsReady && layoutReady;
      }

      function setFontsReady() {
        if (fontsReady) return;
        fontsReady = true;
        if (fontReadyTimer) {
          clearTimeout(fontReadyTimer);
          fontReadyTimer = null;
        }
        term.setOption('fontFamily', config.fontFamily);
        term.setOption('fontSize', config.fontSize);
        fitBurst();
      }

      function getProposedDimensions() {
        if (!fitAddon || typeof fitAddon.proposeDimensions !== 'function') return null;
        try {
          return fitAddon.proposeDimensions();
        } catch {
          return null;
        }
      }

      function tryFit() {
        updateLayoutReady();
        if (!canFit()) return false;
        const dims = getProposedDimensions();
        if (!dims || !dims.cols || !dims.rows) return false;
        fitAddon.fit();
        if (term.cols !== dims.cols || term.rows !== dims.rows) {
          term.resize(dims.cols, dims.rows);
        }
        if (term.cols !== dims.cols || term.rows !== dims.rows) return false;
        hasFitted = true;
        sendResize();
        fitRetryCount = 0;
        return true;
      }

      function scheduleFitRetry() {
        const MAX_FIT_RETRIES = 12;
        if (fitRetryTimer || fitRetryCount >= MAX_FIT_RETRIES) return;
        fitRetryTimer = setTimeout(() => {
          fitRetryTimer = null;
          fitRetryCount += 1;
          scheduleFit();
        }, 60);
      }

      function scheduleFit() {
        if (fitScheduled) return;
        fitScheduled = true;
        requestAnimationFrame(() => {
          fitScheduled = false;
          if (!tryFit()) {
            scheduleFitRetry();
          }
        });
      }

      function fitBurst() {
        scheduleFit();
        setTimeout(scheduleFit, 80);
        setTimeout(scheduleFit, 200);
        setTimeout(scheduleFit, 500);
        setTimeout(scheduleFit, 1000);
      }

      function loadFonts() {
        if (!document.fonts || typeof document.fonts.load !== 'function') {
          setFontsReady();
          return;
        }
        const fontSpec = config.fontSize + 'px ' + config.fontFamily;
        const finish = () => setFontsReady();
        document.fonts.load(fontSpec).then(finish).catch(finish);
        if (document.fonts.ready) {
          document.fonts.ready.then(finish).catch(() => {});
        }
        fontReadyTimer = setTimeout(finish, 1500);
      }

      function watchXtermCss() {
        const cssLink = document.getElementById('xterm-css');
        if (!cssLink || typeof cssLink.addEventListener !== 'function') return;
        const handleReady = () => { fitBurst(); };
        cssLink.addEventListener('load', handleReady);
        cssLink.addEventListener('error', handleReady);
        if (cssLink.sheet) {
          handleReady();
        }
      }

      function scheduleReconnect() {
        if (!config.enableReconnect) return;
        if (config.reconnectMaxAttempts && reconnectAttempts >= config.reconnectMaxAttempts) return;
        reconnectAttempts += 1;
        const baseDelay = config.reconnectDelayMs || 1000;
        let delay = baseDelay;
        if (config.reconnectStrategy === 'exponential') {
          delay = baseDelay * Math.pow(2, reconnectAttempts - 1);
          if (config.reconnectMaxDelayMs) {
            delay = Math.min(delay, config.reconnectMaxDelayMs);
          }
        }
        reconnectTimer = setTimeout(connect, delay);
        if (config.notifyStatus === 'logs') {
          sendToRN({ type: 'reconnecting', attempt: reconnectAttempts });
        }
      }

      function shouldStopReconnect(reason) {
        if (!config.stopReconnectReasons || !reason) return false;
        return config.stopReconnectReasons.indexOf(reason) >= 0;
      }

      function connect() {
        if (socket && socket.readyState === WebSocket.OPEN) return;
        socket = new WebSocket(config.wsUrl);
        if (config.mode === 'logs') {
          socket.binaryType = 'arraybuffer';
        }
        socket.onopen = () => {
          reconnectAttempts = 0;
          emitStatusConnected();
          flushInput();
          if (hasFitted) {
            sendResize();
          } else {
            setTimeout(scheduleFit, 50);
          }
        };
        socket.onmessage = (event) => {
          let data;
          if (config.mode === 'logs' && event.data instanceof ArrayBuffer) {
            data = new TextDecoder().decode(event.data);
          } else {
            data = typeof event.data === 'string' ? event.data : String(event.data);
          }
          if (data) queueOutput(data);
        };
        socket.onclose = (event) => {
          const reason = event.reason || 'closed';
          emitStatusDisconnected(reason);
          if (config.emitSessionEnded && shouldStopReconnect(reason)) {
            sendToRN({ type: 'sessionEnded' });
            return;
          }
          const shouldReconnect = config.enableReconnect && (config.reconnectOnCleanClose || event.code !== 1000);
          if (shouldReconnect) {
            scheduleReconnect();
          }
        };
        socket.onerror = () => {
          emitStatusError();
        };
      }

      function bindFocusEvents() {
        if (!config.emitFocusEvents) return;
        const emitFocused = (focused) => sendToRN({ type: 'focus', focused });
        if (typeof term.onFocus === 'function' && typeof term.onBlur === 'function') {
          term.onFocus(() => emitFocused(true));
          term.onBlur(() => emitFocused(false));
          return;
        }
        const focusTarget = term.textarea || term.element;
        if (focusTarget && typeof focusTarget.addEventListener === 'function') {
          focusTarget.addEventListener('focus', () => emitFocused(true));
          focusTarget.addEventListener('blur', () => emitFocused(false));
        }
      }

      if (config.enableInput) {
        term.onData((data) => {
          queueInput(data);
        });
        bindFocusEvents();
      }
      term.onRender(() => {
        if (renderFitTriggered || hasFitted) return;
        renderFitTriggered = true;
        fitBurst();
      });

      if (config.autoScroll) {
        term.onScroll(() => {
          const buffer = term.buffer.active;
          const atBottom = buffer.viewportY >= buffer.baseY;
          autoScroll = atBottom;
        });
      }

      window.__fitTerminal = () => { fitBurst(); };
      if (config.enableInput) {
        window.__sendToTerminal = (data) => { queueInput(data); };
        window.__sendCtrlC = () => { queueInput('\\u0003'); };
        window.__focusTerminal = () => term.focus();
        window.__blurTerminal = () => term.blur();
      }
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
      if (config.allowCopyAll) {
        window.__copyAll = () => {
          const buffer = term.buffer.active;
          const lines = [];
          for (let i = 0; i < buffer.length; i += 1) {
            const line = buffer.getLine(i);
            if (line) lines.push(line.translateToString(true));
          }
          sendToRN({ type: 'copy', text: lines.join('\\n') });
        };
      }
      if (config.autoScroll) {
        window.__scrollToBottom = () => {
          autoScroll = true;
          term.scrollToBottom();
        };
      }
      if (config.allowCopyAll) {
        window.__clearTerminal = () => {
          term.clear();
        };
      }
      if (config.exposeReconnect) {
        window.__reconnect = () => {
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectAttempts = 0;
          connect();
        };
      }

      if (config.enableOverlay) {
        function clamp(value, min, max) {
          return Math.min(max, Math.max(min, value));
        }

        function getCellSize(terminalEl) {
          const core = term._core;
          const css = core?._renderService?.dimensions?.css;
          let width = css?.cell?.width;
          let height = css?.cell?.height;
          if (!width || !height) {
            const rect = terminalEl.getBoundingClientRect();
            width = rect.width / Math.max(1, term.cols);
            height = rect.height / Math.max(1, term.rows);
          }
          return { width: width || 7, height: height || 14 };
        }

        function getTerminalContentRect(terminalEl) {
          const rect = terminalEl.getBoundingClientRect();
          const style = window.getComputedStyle(terminalEl);
          const paddingLeft = parseFloat(style.paddingLeft) || 0;
          const paddingRight = parseFloat(style.paddingRight) || 0;
          const paddingTop = parseFloat(style.paddingTop) || 0;
          const paddingBottom = parseFloat(style.paddingBottom) || 0;
          return {
            left: rect.left + paddingLeft,
            top: rect.top + paddingTop,
            width: rect.width - paddingLeft - paddingRight,
            height: rect.height - paddingTop - paddingBottom
          };
        }

        function sendScroll(deltaY, clientX, clientY) {
          if (!config.enableSgrScroll || !config.enableInput || socket?.readyState !== 1) return;
          const terminalEl = document.getElementById('terminal');
          if (!terminalEl) return;
          const rect = getTerminalContentRect(terminalEl);
          const cell = getCellSize(terminalEl);
          const relX = clamp(clientX - rect.left, 0, rect.width - 1);
          const relY = clamp(clientY - rect.top, 0, rect.height - 1);
          const col = clamp(Math.floor(relX / cell.width) + 1, 1, term.cols);
          const row = clamp(Math.floor(relY / cell.height) + 1, 1, term.rows);
          const btn = deltaY < 0 ? 64 : 65;
          const esc = String.fromCharCode(27);
          socket.send(JSON.stringify({ type: 'input', data: esc + '[<' + btn + ';' + col + ';' + row + 'M' }));
        }

        const overlay = document.getElementById('overlay');

        function handleWheel(e) {
          if (!config.enableSgrScroll) return;
          e.preventDefault();
          e.stopPropagation();
          const lines = Math.max(1, Math.ceil(Math.abs(e.deltaY) / 40));
          for (let i = 0; i < lines; i += 1) sendScroll(e.deltaY, e.clientX, e.clientY);
        }

        if (overlay && config.enableSgrScroll) {
          overlay.addEventListener('wheel', handleWheel, { passive: false });
        }

        let touchStartX = 0;
        let touchStartY = 0;
        let lastScrollY = 0;
        let touchStartTime = 0;
        let isSelectionMode = false;
        let isVerticalScroll = null;
        let touchMoved = false;
        let selectionStartCol = 0;
        let selectionStartRow = 0;
        const LONG_PRESS_DURATION = 400;
        const MOVE_THRESHOLD = 10;

        function touchToCell(clientX, clientY) {
          const terminalEl = document.getElementById('terminal');
          if (!terminalEl) return { col: 0, row: 0 };
          const rect = getTerminalContentRect(terminalEl);
          const cell = getCellSize(terminalEl);
          const col = Math.floor((clientX - rect.left) / cell.width);
          const row = Math.floor((clientY - rect.top) / cell.height);
          const maxCol = Math.max(0, term.cols - 1);
          const maxRow = Math.max(0, term.rows - 1);
          return { col: clamp(col, 0, maxCol), row: clamp(row, 0, maxRow) };
        }

        if (overlay) overlay.addEventListener('touchstart', (e) => {
          if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            lastScrollY = touchStartY;
            touchStartTime = Date.now();
            touchMoved = false;
            if (isSelectionMode) {
              if (config.emitSelectionEvents) {
                sendToRN({ type: 'selectionEnd' });
              }
            }
            isSelectionMode = false;
            isVerticalScroll = null;
            term.clearSelection();
          }
        }, { passive: true });

        if (overlay) overlay.addEventListener('touchmove', (e) => {
          if (e.touches.length === 1) {
            const x = e.touches[0].clientX;
            const y = e.touches[0].clientY;
            const dx = x - touchStartX;
            const dy = y - touchStartY;
            const elapsed = Date.now() - touchStartTime;
            const moved = Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD;
            if (moved) touchMoved = true;

            if (!isSelectionMode && !moved && elapsed > LONG_PRESS_DURATION) {
              isSelectionMode = true;
              const start = touchToCell(touchStartX, touchStartY);
              selectionStartCol = start.col;
              selectionStartRow = start.row;
              term.select(selectionStartCol, selectionStartRow + term.buffer.active.viewportY, 1);
              if (config.emitSelectionEvents) {
                sendToRN({ type: 'selectionStart' });
              }
              sendToRN({ type: 'haptic' });
              return;
            }

            if (isSelectionMode) {
              if (e.cancelable) e.preventDefault();
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

            if (!config.enableSgrScroll) return;
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
            if (e.cancelable) e.preventDefault();
            const delta = lastScrollY - y;
            if (Math.abs(delta) > 14) {
              const lines = Math.max(1, Math.ceil(Math.abs(delta) / 14));
              for (let i = 0; i < lines; i += 1) sendScroll(delta, x, y);
              lastScrollY = y;
            }
          }
        }, { passive: false });

        if (overlay) overlay.addEventListener('touchend', () => {
          if (!touchMoved && !isSelectionMode) {
            term.focus();
          }
        }, { passive: true });
      }

      loadFonts();
      watchXtermCss();
      updateLayoutReady();
      scheduleFit();
      if (typeof ResizeObserver !== 'undefined' && terminalEl) {
        const resizeObserver = new ResizeObserver(() => {
          scheduleFit();
        });
        resizeObserver.observe(terminalEl);
      }
      const visualViewport = window.visualViewport;
      if (visualViewport && typeof visualViewport.addEventListener === 'function') {
        visualViewport.addEventListener('resize', scheduleFit);
        visualViewport.addEventListener('scroll', scheduleFit);
      }
      window.addEventListener('resize', scheduleFit);
      connect();
    </script>
  </body>
</html>`;
}
