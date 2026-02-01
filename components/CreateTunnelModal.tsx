import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Alert } from 'react-native';
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetBackdrop,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { TunnelCreate, Host } from '@/lib/types';
import { createTunnel } from '@/lib/api';

type CreateTunnelModalProps = {
  isOpen: boolean;
  onClose: () => void;
  host: Host | null;
  prefillPort?: number;
  onCreated?: () => void;
};

const snapPoints = ['55%'];

export function CreateTunnelModal({
  isOpen,
  onClose,
  host,
  prefillPort,
  onCreated,
}: CreateTunnelModalProps) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [listenPort, setListenPort] = useState('');
  const [targetHost, setTargetHost] = useState('localhost');
  const [targetPort, setTargetPort] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.snapToIndex(0);
      if (prefillPort) {
        setTargetPort(String(prefillPort));
      }
    } else {
      sheetRef.current?.close();
    }
  }, [isOpen, prefillPort]);

  const resetForm = useCallback(() => {
    setListenPort('');
    setTargetHost('localhost');
    setTargetPort('');
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const handleCreate = useCallback(async () => {
    if (!host) return;

    const listenPortNum = parseInt(listenPort, 10);
    const targetPortNum = parseInt(targetPort, 10);

    if (!listenPortNum || listenPortNum < 1 || listenPortNum > 65535) {
      Alert.alert('Invalid Input', 'Listen port must be between 1 and 65535');
      return;
    }
    if (!targetPortNum || targetPortNum < 1 || targetPortNum > 65535) {
      Alert.alert('Invalid Input', 'Target port must be between 1 and 65535');
      return;
    }
    if (!targetHost.trim()) {
      Alert.alert('Invalid Input', 'Target host is required');
      return;
    }

    const config: TunnelCreate = {
      listenPort: listenPortNum,
      targetHost: targetHost.trim(),
      targetPort: targetPortNum,
    };

    setCreating(true);
    try {
      await createTunnel(host, config);
      resetForm();
      onCreated?.();
      onClose();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create tunnel');
    } finally {
      setCreating(false);
    }
  }, [host, listenPort, targetHost, targetPort, resetForm, onCreated, onClose]);

  const renderBackdrop = useCallback(
    (props: Parameters<typeof BottomSheetBackdrop>[0]) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    []
  );

  const isValid = listenPort && targetPort && targetHost.trim();

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={handleClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: colors.separator }}
    >
      <BottomSheetScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
      >
        <AppText variant="title" style={styles.title}>Create Port Forward</AppText>
        <AppText variant="body" tone="muted" style={styles.subtitle}>
          Forward a port on the agent to a target service
        </AppText>

        <View style={styles.section}>
          <AppText variant="label" tone="muted" style={styles.label}>Port Mapping</AppText>
          <View style={styles.portRow}>
            <View style={styles.portInput}>
              <AppText variant="label" tone="muted" style={styles.portLabel}>Listen Port</AppText>
              <View style={styles.inputCard}>
                <BottomSheetTextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="8080"
                  placeholderTextColor={colors.textSecondary}
                  value={listenPort}
                  onChangeText={setListenPort}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <AppText style={styles.portArrow}>→</AppText>
            <View style={styles.portInput}>
              <AppText variant="label" tone="muted" style={styles.portLabel}>Target Port</AppText>
              <View style={styles.inputCard}>
                <BottomSheetTextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="3000"
                  placeholderTextColor={colors.textSecondary}
                  value={targetPort}
                  onChangeText={setTargetPort}
                  keyboardType="number-pad"
                />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <AppText variant="label" tone="muted" style={styles.label}>Target Host</AppText>
          <View style={styles.inputCard}>
            <BottomSheetTextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="localhost"
              placeholderTextColor={colors.textSecondary}
              value={targetHost}
              onChangeText={setTargetHost}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <AppText variant="body" tone="muted" style={styles.hint}>
            The host to forward connections to (usually localhost)
          </AppText>
        </View>

        <Pressable
          style={[styles.createButton, (!isValid || creating) && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={!isValid || creating}
        >
          <AppText variant="subtitle" style={styles.createButtonText}>
            {creating ? 'Creating...' : 'Create Forward'}
          </AppText>
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: {
    padding: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    marginBottom: theme.spacing.lg,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    marginBottom: theme.spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hint: {
    marginTop: theme.spacing.xs,
    fontSize: 12,
  },
  inputCard: {
    marginTop: theme.spacing.xs,
  },
  input: {
    padding: theme.spacing.md,
    fontSize: 16,
  },
  portRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  portInput: {
    flex: 1,
  },
  portLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  portArrow: {
    fontSize: 20,
    color: colors.textSecondary,
    paddingBottom: 14,
  },
  createButton: {
    backgroundColor: colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    color: colors.accentText,
  },
});
