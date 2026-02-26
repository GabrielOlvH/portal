import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { AppText } from '@/components/AppText';
import { hostColors } from '@/lib/colors';
import { useTheme, type ThemeColors } from '@/lib/useTheme';
import type { SessionWithHost } from '@/lib/workspace-types';

export type SessionPickerSheetProps = {
  visible: boolean;
  sessions: SessionWithHost[];
  currentSessionKey?: string;
  onSelectSession: (hostId: string, sessionName: string) => void;
  onClose: () => void;
};

export function SessionPickerSheet({
  visible,
  sessions,
  currentSessionKey,
  onSelectSession,
  onClose,
}: SessionPickerSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
        mass: 0.8,
      }).start();
    } else {
      Animated.spring(translateY, {
        toValue: 600,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
        mass: 0.8,
      }).start();
    }
  }, [visible, translateY]);

  const groups = useMemo(() => {
    const map = new Map<string, { host: SessionWithHost['host']; hostIndex: number; sessions: { session: SessionWithHost; key: string }[] }>();
    sessions.forEach((session) => {
      const hostId = session.host.id;
      if (!map.has(hostId)) {
        map.set(hostId, { host: session.host, hostIndex: session.hostIndex, sessions: [] });
      }
      map.get(hostId)!.sessions.push({ session, key: `${hostId}/${session.name}` });
    });
    return Array.from(map.values());
  }, [sessions]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: Math.max(insets.bottom, 16) },
          { transform: [{ translateY }] },
        ]}
      >
        <View style={styles.sheetHeader}>
          <AppText variant="subtitle" style={styles.sheetTitle}>Sessions</AppText>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <X size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.handle} />

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {groups.map((group) => {
            const hostColor = group.host.color
              ? String(group.host.color)
              : (hostColors[group.hostIndex % hostColors.length] as unknown as string);

            return (
              <View key={group.host.id} style={styles.group}>
                <View style={styles.groupHeader}>
                  <View style={[styles.groupDot, { backgroundColor: hostColor }]} />
                  <AppText variant="caps" tone="muted" style={styles.groupName} numberOfLines={1}>
                    {group.host.name}
                  </AppText>
                </View>

                {group.sessions.map(({ session, key }) => {
                  const isActive = key === currentSessionKey;
                  const isAttached = session.attached === true;

                  return (
                    <Pressable
                      key={key}
                      style={({ pressed }) => [
                        styles.sessionRow,
                        isActive && styles.sessionRowActive,
                        pressed && styles.sessionRowPressed,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        onSelectSession(session.host.id, session.name);
                        onClose();
                      }}
                    >
                      <View style={[styles.attachedDot, { backgroundColor: isAttached ? colors.green : colors.textMuted }]} />
                      <AppText
                        variant="body"
                        style={[styles.sessionName, isActive && styles.sessionNameActive]}
                        numberOfLines={1}
                      >
                        {session.title || session.name}
                      </AppText>
                      {isActive && (
                        <View style={[styles.activePill, { backgroundColor: colors.accent }]}>
                          <AppText variant="caps" style={styles.activePillText}>current</AppText>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            );
          })}

          {sessions.length === 0 && (
            <View style={styles.emptyState}>
              <AppText variant="body" tone="muted">No sessions</AppText>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.background,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      maxHeight: '75%',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 16,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.separator,
      alignSelf: 'center',
      marginBottom: 8,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 4,
    },
    sheetTitle: {
      fontSize: 17,
      fontWeight: '600',
    },
    closeBtn: {
      padding: 4,
      borderRadius: 12,
      backgroundColor: colors.barBg,
    },
    list: {
      flexShrink: 1,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 8,
      gap: 16,
    },
    group: {
      gap: 2,
    },
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 4,
      paddingVertical: 6,
    },
    groupDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    groupName: {
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sessionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    sessionRowActive: {
      backgroundColor: colors.barBg,
    },
    sessionRowPressed: {
      backgroundColor: colors.cardPressed,
    },
    attachedDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      flexShrink: 0,
    },
    sessionName: {
      flex: 1,
      fontSize: 15,
    },
    sessionNameActive: {
      fontWeight: '600',
    },
    activePill: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 8,
      flexShrink: 0,
    },
    activePillText: {
      color: colors.accentText,
      fontSize: 10,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 32,
    },
  });
}
