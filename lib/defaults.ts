import { AppPreferences, Host } from '@/lib/types';
import type { ColorValue } from 'react-native';
import { hostColors } from '@/lib/colors';

export function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

export function pickHostAccent(hosts: Host[]): ColorValue {
  const used = new Set<ColorValue>(hosts.map((host) => host.color).filter(Boolean) as ColorValue[]);
  const available = hostColors.find((color) => !used.has(color));
  return available ?? hostColors[hosts.length % hostColors.length];
}

export function defaultPreferences(): AppPreferences {
  return {
    usageCards: {
      claude: true,
      codex: true,
      copilot: true,
      kimi: true,
    },
    theme: 'system',
    notifications: {
      pushEnabled: true,
      liveEnabled: true,
    },
    terminal: {
      fontFamily: 'JetBrains Mono',
      fontSize: 12,
    },
    github: {
      enabled: false,
    },
    sessionOrders: [],
  };
}
