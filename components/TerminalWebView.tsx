import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Platform, type StyleProp, type ViewStyle, type LayoutChangeEvent } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

type TerminalWebViewProps = {
  source?: { html: string };
  setRef?: (ref: WebView | null) => void;
  style?: StyleProp<ViewStyle>;
  onLoadEnd?: () => void;
  onMessage?: (event: WebViewMessageEvent) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  keyboardEnabled?: boolean;
  autoFit?: boolean;
  fitDelaysMs?: number[];
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
  fitDelaysMs,
}: TerminalWebViewProps) {
  const webRef = useRef<WebView | null>(null);
  const layoutRef = useRef<{ width: number; height: number } | null>(null);
  const loadedRef = useRef(false);
  const delays = fitDelaysMs ?? [0, 50, 150];

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

  const canFit = useCallback(() => {
    if (!loadedRef.current) return false;
    const layout = layoutRef.current;
    if (!layout) return false;
    const width = layout.width;
    const height = layout.height;
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
  }, []);

  const scheduleFit = useCallback(() => {
    if (!autoFit) return;
    delays.forEach((delay) => {
      setTimeout(() => {
        if (!canFit()) return;
        webRef.current?.injectJavaScript(
          `(function(){const fit=()=>window.__fitTerminal&&window.__fitTerminal();requestAnimationFrame(fit);setTimeout(fit,60);})(); true;`
        );
      }, delay);
    });
  }, [autoFit, delays, canFit]);

  const handleRef = useCallback((ref: WebView | null) => {
    webRef.current = ref;
    setRef?.(ref);
  }, [setRef]);

  const handleLoadEnd = useCallback(() => {
    loadedRef.current = true;
    onLoadEnd?.();
    scheduleFit();
  }, [onLoadEnd, scheduleFit]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    layoutRef.current = event.nativeEvent.layout;
    onLayout?.(event);
    scheduleFit();
  }, [onLayout, scheduleFit]);

  useEffect(() => {
    loadedRef.current = false;
  }, [source]);

  useEffect(() => {
    scheduleFit();
  }, [scheduleFit, source]);

  useEffect(() => {
    if (!loadedRef.current) return;
    scheduleFit();
  }, [scheduleFit]);

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
        onMessage={onMessage}
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
