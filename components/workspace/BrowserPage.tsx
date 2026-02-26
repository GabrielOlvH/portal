import React, { useRef } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { ArrowLeft, RotateCw } from 'lucide-react-native';

import { useTheme } from '@/lib/useTheme';

const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

export function BrowserPage({
  url,
}: {
  url: string;
}) {
  const { colors } = useTheme();
  const webViewRef = useRef<WebView>(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={{ flex: 1 }}
        userAgent={CHROME_UA}
        allowsInlineMediaPlayback
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures={Platform.OS === 'ios'}
      />
      <View
        style={{
          position: 'absolute',
          top: 4,
          alignSelf: 'center',
          flexDirection: 'row',
          gap: 8,
        }}
      >
        <Pressable
          onPress={() => webViewRef.current?.goBack()}
          hitSlop={8}
          style={{
            backgroundColor: 'rgba(0,0,0,0.45)',
            borderRadius: 16,
            padding: 8,
          }}
        >
          <ArrowLeft size={16} color="rgba(255,255,255,0.8)" />
        </Pressable>
        <Pressable
          onPress={() => webViewRef.current?.reload()}
          hitSlop={8}
          style={{
            backgroundColor: 'rgba(0,0,0,0.45)',
            borderRadius: 16,
            padding: 8,
          }}
        >
          <RotateCw size={16} color="rgba(255,255,255,0.8)" />
        </Pressable>
      </View>
    </View>
  );
}
