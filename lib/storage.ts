import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppPreferences, Host } from '@/lib/types';
import { defaultPreferences } from '@/lib/defaults';

const HOSTS_KEY = 'tmux.hosts.v1';
const PREFERENCES_KEY = 'tmux.preferences.v1';

export async function loadHosts(): Promise<Host[]> {
  const raw = await AsyncStorage.getItem(HOSTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Host[];
  } catch {
    return [];
  }
}

export async function saveHosts(hosts: Host[]): Promise<void> {
  await AsyncStorage.setItem(HOSTS_KEY, JSON.stringify(hosts));
}

function normalizePreferences(raw: Partial<AppPreferences> | null): AppPreferences {
  const defaults = defaultPreferences();
  const usageCards: Partial<AppPreferences['usageCards']> = raw?.usageCards ?? {};
  const notifications: Partial<AppPreferences['notifications']> = raw?.notifications ?? {};
  const validThemes = ['light', 'dark', 'system'] as const;
  const theme = raw?.theme && validThemes.includes(raw.theme) ? raw.theme : defaults.theme;

  return {
    usageCards: {
      claude: typeof usageCards.claude === 'boolean' ? usageCards.claude : defaults.usageCards.claude,
      codex: typeof usageCards.codex === 'boolean' ? usageCards.codex : defaults.usageCards.codex,
      copilot:
        typeof usageCards.copilot === 'boolean' ? usageCards.copilot : defaults.usageCards.copilot,
    },
    theme,
    notifications: {
      pushEnabled:
        typeof notifications.pushEnabled === 'boolean' ? notifications.pushEnabled : defaults.notifications.pushEnabled,
      liveEnabled:
        typeof notifications.liveEnabled === 'boolean' ? notifications.liveEnabled : defaults.notifications.liveEnabled,
    },
  };
}

export async function loadPreferences(): Promise<AppPreferences> {
  const raw = await AsyncStorage.getItem(PREFERENCES_KEY);
  if (!raw) return defaultPreferences();
  try {
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return normalizePreferences(parsed);
  } catch {
    return defaultPreferences();
  }
}

export async function savePreferences(preferences: AppPreferences): Promise<void> {
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}
