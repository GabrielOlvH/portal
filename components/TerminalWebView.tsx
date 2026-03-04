import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, View, StyleSheet, Platform, type AppStateStatus, type StyleProp, type ViewStyle, type LayoutChangeEvent } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

type DimensionRequest = {
  type: 'dimensionRequest';
  container: { width: number; height: number };
  proposed: { cols: number; rows: number } | null;
};

type TerminalWebViewProps = {
  source?: { html: string };
  setRef?: (ref: WebView | null) => void;
  style?: StyleProp<ViewStyle>;
  onLoadEnd?: () => void;
  onMessage?: (event: WebViewMessageEvent) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  keyboardEnabled?: boolean;
  autoFit?: boolean;
  autoRequestFocus?: boolean;
};

export function TerminalWebView({
  source,
  setRef,
  style,
  onLoadEnd,
  onMessage,
  onLayout,
  keyboardEnabled = true,
  autoFit = false,
  autoRequestFocus = false,
}: TerminalWebViewProps) {
  const webRef = useRef<WebView | null>(null);
  const layoutRef = useRef<{ width: number; height: number } | null>(null);
  const loadedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const fitTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const flattenedStyle = useMemo(() => StyleSheet.flatten(style) ?? {}, [style]);
  const containerStyle = useMemo(
    () => [styles.container, style],
    [style]
  );
  const webViewStyle = useMemo(
    () => [
      styles.webview,
      typeof flattenedStyle.backgroundColor === 'string'
        ? { backgroundColor: flattenedStyle.backgroundColor }
        : null,
    ],
    [flattenedStyle.backgroundColor]
  );

  const confirmDimensions = useCallback((cols: number, rows: number) => {
    if (!loadedRef.current || !webRef.current) return;
    webRef.current.injectJavaScript(
      `window.__confirmDimensions && window.__confirmDimensions(${cols}, ${rows}); true;`
    );
  }, []);

  const handleDimensionRequest = useCallback((request: DimensionRequest) => {
    if (!autoFit) return;
    const layout = layoutRef.current;
    if (!layout || layout.width <= 0 || layout.height <= 0) return;
    if (!request.proposed || request.proposed.cols <= 0 || request.proposed.rows <= 0) return;
    // The WebView computes proposed cols/rows from its own DOM measurements.
    // RN `onLayout` can differ by a couple px (rounding/safe-area/transform),
    // and being too strict here can permanently prevent fitting, leaving blank
    // space on the right/bottom.
    const dw = Math.abs(request.container.width - layout.width);
    const dh = Math.abs(request.container.height - layout.height);
    const hugeMismatch = dw > 64 || dh > 64;
    if (!hugeMismatch) {
      confirmDimensions(request.proposed.cols, request.proposed.rows);
    }
  }, [autoFit, confirmDimensions]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data && data.type === 'dimensionRequest') {
        handleDimensionRequest(data as DimensionRequest);
        onMessage?.(event);
        return;
      }
    } catch {
      // Not JSON or not a dimension request, pass through
    }
    onMessage?.(event);
  }, [handleDimensionRequest, onMessage]);

  const triggerDimensionRequest = useCallback(() => {
    if (!autoFit || !loadedRef.current || !webRef.current) return;
    webRef.current.injectJavaScript(
      `window.__fitTerminal && window.__fitTerminal(); true;`
    );
  }, [autoFit]);

  const clearFitTimers = useCallback(() => {
    if (fitTimersRef.current.length === 0) return;
    fitTimersRef.current.forEach((timer) => clearTimeout(timer));
    fitTimersRef.current = [];
  }, []);

  const triggerFitBurst = useCallback((delays: number[]) => {
    if (!autoFit || !loadedRef.current || !webRef.current) return;
    clearFitTimers();
    fitTimersRef.current = delays.map((delay) =>
      setTimeout(() => {
        triggerDimensionRequest();
      }, delay)
    );
  }, [autoFit, clearFitTimers, triggerDimensionRequest]);

  const notifyAppState = useCallback((state: AppStateStatus) => {
    if (!loadedRef.current || !webRef.current) return;
    const value = JSON.stringify(state);
    webRef.current.injectJavaScript(
      `window.__onAppState && window.__onAppState(${value}); true;`
    );
  }, []);

  const requestNativeFocus = useCallback(() => {
    if (Platform.OS !== 'android' || !webRef.current) return;
    const ref = webRef.current as unknown as { requestFocus?: () => void };
    ref.requestFocus?.();
  }, []);

  const handleRef = useCallback((ref: WebView | null) => {
    webRef.current = ref;
    setRef?.(ref);
  }, [setRef]);

  const handleLoadEnd = useCallback(() => {
    loadedRef.current = true;
    onLoadEnd?.();
    notifyAppState(appStateRef.current);
    if (autoRequestFocus) {
      requestNativeFocus();
      setTimeout(requestNativeFocus, 80);
    }
    triggerFitBurst([0, 80, 220]);
  }, [notifyAppState, onLoadEnd, autoRequestFocus, requestNativeFocus, triggerFitBurst]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const prevLayout = layoutRef.current;
    const newLayout = event.nativeEvent.layout;
    layoutRef.current = newLayout;
    onLayout?.(event);
    if (!loadedRef.current) return;
    // Only trigger if layout changed significantly
    const significantChange = !prevLayout ||
      Math.abs(prevLayout.width - newLayout.width) > 2 ||
      Math.abs(prevLayout.height - newLayout.height) > 2;
    if (significantChange) {
      triggerFitBurst([0, 80]);
    }
  }, [onLayout, triggerFitBurst]);

  useEffect(() => {
    loadedRef.current = false;
    clearFitTimers();
    return () => {
      clearFitTimers();
    };
  }, [clearFitTimers, source]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      notifyAppState(nextState);
      if (nextState === 'active') {
        if (autoRequestFocus) {
          requestNativeFocus();
          setTimeout(requestNativeFocus, 60);
        }
        triggerFitBurst([0, 80, 220, 450]);
      }
    });
    return () => {
      subscription.remove();
    };
  }, [notifyAppState, autoRequestFocus, requestNativeFocus, triggerFitBurst]);

  return (
    <View style={containerStyle} onLayout={handleLayout}>
      <WebView
        ref={handleRef}
        source={source}
        originWhitelist={['*']}
        scrollEnabled={false}
        overScrollMode="never"
        nestedScrollEnabled={true}
        scalesPageToFit={false}
        renderToHardwareTextureAndroid={Platform.OS === 'android'}
        keyboardDisplayRequiresUserAction={Platform.OS === 'ios' && keyboardEnabled ? false : undefined}
        hideKeyboardAccessoryView={Platform.OS === 'ios' && keyboardEnabled ? true : undefined}
        style={webViewStyle}
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignSelf: 'stretch',
  },
  webview: {
    position: 'absolute',
    top: 0,
    left: 0,
    // iOS can show a tiny right/bottom seam due to fractional layout rounding.
    // Overscan by a couple px to ensure the terminal paints to the edges.
    right: Platform.OS === 'ios' ? -2 : 0,
    bottom: Platform.OS === 'ios' ? -2 : 0,
  },
});
