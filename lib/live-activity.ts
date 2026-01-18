import { Platform } from 'react-native';

type LiveActivityModule = typeof import('expo-live-activity');

let moduleCache: LiveActivityModule | null | undefined;

function getModule(): LiveActivityModule | null {
  if (Platform.OS !== 'ios') return null;
  if (moduleCache !== undefined) return moduleCache;
  try {
    moduleCache = require('expo-live-activity') as LiveActivityModule;
  } catch {
    moduleCache = null;
  }
  return moduleCache;
}

export type TaskLiveActivityState = {
  title: string;
  subtitle?: string;
  status?: string;
};

export function startTaskLiveActivity(state: TaskLiveActivityState): string | null {
  const mod = getModule();
  if (!mod || typeof mod.startActivity !== 'function') return null;
  try {
    return mod.startActivity(
      {
        title: state.title,
        subtitle: state.subtitle ?? '',
      },
      {
        timerType: 'digital',
      }
    ) as string;
  } catch {
    return null;
  }
}

export function updateTaskLiveActivity(activityId: string, state: TaskLiveActivityState): void {
  const mod = getModule();
  if (!mod || typeof mod.updateActivity !== 'function') return;
  try {
    mod.updateActivity(activityId, {
      title: state.title,
      subtitle: state.subtitle ?? '',
    });
  } catch {}
}

export function endTaskLiveActivity(activityId: string, state?: TaskLiveActivityState): void {
  const mod = getModule();
  if (!mod || typeof mod.stopActivity !== 'function') return;
  try {
    mod.stopActivity(activityId, {
      title: state?.title ?? '',
      subtitle: state?.subtitle ?? '',
    });
  } catch {}
}
