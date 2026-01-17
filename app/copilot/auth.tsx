import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { useStore } from '@/lib/store';
import { palette, theme } from '@/lib/theme';
import { systemColors } from '@/lib/colors';
import {
  startCopilotAuth,
  pollCopilotAuth,
  CopilotAuthStartResponse,
} from '@/lib/api';

type AuthState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'showing_code'; data: CopilotAuthStartResponse }
  | { status: 'polling'; data: CopilotAuthStartResponse }
  | { status: 'success' }
  | { status: 'error'; message: string };

export default function CopilotAuthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ hostId: string }>();
  const { hosts } = useStore();
  const host = hosts.find((h) => h.id === params.hostId);

  const [authState, setAuthState] = useState<AuthState>({ status: 'idle' });
  const [copied, setCopied] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (expiryTimeoutRef.current) {
      clearTimeout(expiryTimeoutRef.current);
      expiryTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const startAuth = useCallback(async () => {
    if (!host) return;

    clearTimers();
    setAuthState({ status: 'loading' });

    try {
      const data = await startCopilotAuth(host);
      setAuthState({ status: 'showing_code', data });
    } catch (err) {
      setAuthState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to start authentication',
      });
    }
  }, [host, clearTimers]);

  const startPolling = useCallback(() => {
    if (!host) return;
    if (authState.status !== 'showing_code') return;

    const { data } = authState;
    setAuthState({ status: 'polling', data });

    const pollInterval = Math.max(data.interval * 1000, 5000);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const result = await pollCopilotAuth(host);

        if (result.status === 'success') {
          clearTimers();
          setAuthState({ status: 'success' });
          setTimeout(() => {
            router.back();
          }, 1500);
        } else if (result.status === 'expired') {
          clearTimers();
          setAuthState({
            status: 'error',
            message: result.error ?? 'Authentication expired. Please try again.',
          });
        }
      } catch (err) {
        clearTimers();
        setAuthState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Polling failed',
        });
      }
    }, pollInterval);

    expiryTimeoutRef.current = setTimeout(() => {
      clearTimers();
      setAuthState({
        status: 'error',
        message: 'Authentication timed out. Please try again.',
      });
    }, data.expiresIn * 1000);
  }, [host, authState, clearTimers, router]);

  const openGitHub = useCallback(() => {
    if (authState.status !== 'showing_code' && authState.status !== 'polling') return;
    const { data } = authState;
    Linking.openURL(data.verificationUri);
    if (authState.status === 'showing_code') {
      startPolling();
    }
  }, [authState, startPolling]);

  const copyCode = useCallback(async () => {
    if (authState.status !== 'showing_code' && authState.status !== 'polling') return;
    const { data } = authState;
    await Clipboard.setStringAsync(data.userCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [authState]);

  useEffect(() => {
    if (host) {
      startAuth();
    }
  }, []);

  if (!host) {
    return (
      <Screen>
        <View style={styles.center}>
          <AppText variant="title">Host not found</AppText>
          <Pressable style={styles.button} onPress={() => router.back()}>
            <AppText variant="subtitle" style={styles.buttonText}>
              Go Back
            </AppText>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">GitHub Copilot</AppText>
      </View>

      <View style={styles.content}>
        {authState.status === 'idle' && (
          <View style={styles.center}>
            <AppText variant="body" tone="secondary">
              Connect GitHub Copilot to enable AI-powered completions.
            </AppText>
            <Pressable style={styles.button} onPress={startAuth}>
              <AppText variant="subtitle" style={styles.buttonText}>
                Start Authentication
              </AppText>
            </Pressable>
          </View>
        )}

        {authState.status === 'loading' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={palette.accent} />
            <AppText variant="body" tone="secondary" style={styles.loadingText}>
              Initiating authentication...
            </AppText>
          </View>
        )}

        {(authState.status === 'showing_code' || authState.status === 'polling') && (
          <View style={styles.codeContainer}>
            <AppText variant="body" tone="secondary" style={styles.instructions}>
              Enter this code on GitHub:
            </AppText>

            <Pressable style={styles.codeBox} onPress={copyCode}>
              <AppText variant="mono" style={styles.userCode}>
                {authState.data.userCode}
              </AppText>
              <AppText variant="caps" tone="accent" style={styles.copyHint}>
                {copied ? 'Copied!' : 'Tap to copy'}
              </AppText>
            </Pressable>

            <AppText variant="label" tone="secondary" style={styles.urlText}>
              {authState.data.verificationUri}
            </AppText>

            <Pressable style={styles.button} onPress={openGitHub}>
              <AppText variant="subtitle" style={styles.buttonText}>
                Open GitHub
              </AppText>
            </Pressable>

            {authState.status === 'polling' && (
              <View style={styles.pollingIndicator}>
                <ActivityIndicator size="small" color={palette.accent} />
                <AppText variant="body" tone="secondary" style={styles.pollingText}>
                  Waiting for authorization...
                </AppText>
              </View>
            )}

            <Pressable style={styles.cancelButton} onPress={() => router.back()}>
              <AppText variant="label" tone="secondary">
                Cancel
              </AppText>
            </Pressable>
          </View>
        )}

        {authState.status === 'success' && (
          <View style={styles.center}>
            <View style={styles.successIcon}>
              <AppText style={styles.checkmark}>✓</AppText>
            </View>
            <AppText variant="subtitle" tone="success" style={styles.successText}>
              Authentication Successful
            </AppText>
            <AppText variant="body" tone="secondary">
              GitHub Copilot is now connected.
            </AppText>
          </View>
        )}

        {authState.status === 'error' && (
          <View style={styles.center}>
            <AppText variant="subtitle" tone="error" style={styles.errorTitle}>
              Authentication Failed
            </AppText>
            <AppText variant="body" tone="secondary" style={styles.errorMessage}>
              {authState.message}
            </AppText>
            <Pressable style={styles.button} onPress={startAuth}>
              <AppText variant="subtitle" style={styles.buttonText}>
                Try Again
              </AppText>
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={() => router.back()}>
              <AppText variant="label" tone="secondary">
                Cancel
              </AppText>
            </Pressable>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: theme.spacing.lg,
  },
  content: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  loadingText: {
    marginTop: theme.spacing.md,
  },
  codeContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: theme.spacing.xl,
  },
  instructions: {
    marginBottom: theme.spacing.md,
  },
  codeBox: {
    backgroundColor: palette.surface,
    borderRadius: theme.radii.lg,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    alignItems: 'center',
    ...theme.shadow.card,
  },
  userCode: {
    fontSize: 32,
    letterSpacing: 4,
    color: palette.ink,
  },
  copyHint: {
    marginTop: theme.spacing.xs,
  },
  urlText: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  button: {
    backgroundColor: palette.accent,
    borderRadius: theme.radii.md,
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    minWidth: 200,
  },
  buttonText: {
    color: '#FFFFFF',
  },
  pollingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  pollingText: {
    marginLeft: theme.spacing.xs,
  },
  cancelButton: {
    marginTop: theme.spacing.lg,
    padding: theme.spacing.sm,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: systemColors.green,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    fontSize: 32,
    color: '#FFFFFF',
  },
  successText: {
    marginTop: theme.spacing.md,
  },
  errorTitle: {
    marginBottom: theme.spacing.sm,
  },
  errorMessage: {
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
});
