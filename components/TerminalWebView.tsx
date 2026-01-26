import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Platform, type StyleProp, type ViewStyle, type LayoutChangeEvent } from 'react-native';
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
}: TerminalWebViewProps) {
  const webRef = useRef<WebView | null>(null);
  const layoutRef = useRef<{ width: number; height: number } | null>(null);
  const loadedRef = useRef(false);

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
    // Verify container matches RN layout (within tolerance)
    const tolerance = 8;
    const widthMatch = Math.abs(request.container.width - layout.width) < tolerance;
    const heightMatch = Math.abs(request.container.height - layout.height) < tolerance;
    if (widthMatch && heightMatch) {
      confirmDimensions(request.proposed.cols, request.proposed.rows);
    }
    // If mismatch, don't confirm - WebView will retry
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

  const handleRef = useCallback((ref: WebView | null) => {
    webRef.current = ref;
    setRef?.(ref);
  }, [setRef]);

  const handleLoadEnd = useCallback(() => {
    loadedRef.current = true;
    onLoadEnd?.();
    triggerDimensionRequest();
  }, [onLoadEnd, triggerDimensionRequest]);

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
      triggerDimensionRequest();
    }
  }, [onLayout, triggerDimensionRequest]);

  useEffect(() => {
    loadedRef.current = false;
  }, [source]);

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
        androidLayerType={Platform.OS === 'android' ? 'software' : undefined}
        renderToHardwareTextureAndroid={true}
        keyboardDisplayRequiresUserAction={keyboardEnabled ? false : undefined}
        hideKeyboardAccessoryView={keyboardEnabled ? true : undefined}
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
    ...StyleSheet.absoluteFillObject,
  },
});

