import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Host, Project, RecentLaunch } from '@/lib/types';
import { createId } from '@/lib/defaults';
import {
  getProjects,
  addRemoteProject,
  updateRemoteProject,
  removeRemoteProject,
  RemoteProject,
} from '@/lib/api';

const PROJECTS_KEY = 'tmux.projects.v1';
const RECENT_LAUNCHES_KEY = 'tmux.recent-launches.v1';
const MAX_RECENT_LAUNCHES = 10;

async function loadProjects(): Promise<Project[]> {
  const raw = await AsyncStorage.getItem(PROJECTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((project) => {
      const { customCommands: _customCommands, ...rest } = project as StoredProject;
      return rest as Project;
    });
  } catch {
    return [];
  }
}

async function saveProjects(projects: Project[]): Promise<void> {
  await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

async function loadRecentLaunches(): Promise<RecentLaunch[]> {
  const raw = await AsyncStorage.getItem(RECENT_LAUNCHES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as RecentLaunch[];
  } catch {
    return [];
  }
}

async function saveRecentLaunches(launches: RecentLaunch[]): Promise<void> {
  await AsyncStorage.setItem(RECENT_LAUNCHES_KEY, JSON.stringify(launches));
}

type ProjectDraft = Omit<Project, 'id'>;
type StoredProject = Project & { customCommands?: unknown };

type ProjectDraftWithHost = Omit<Project, 'id'> & { host?: Host };
type UpdateProjectOptions = { host?: Host };
type RemoveProjectOptions = { host?: Host };

const ProjectsContext = createContext<{
  projects: Project[];
  recentLaunches: RecentLaunch[];
  ready: boolean;
  addProject: (draft: ProjectDraftWithHost) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Project>, options?: UpdateProjectOptions) => Promise<void>;
  removeProject: (id: string, options?: RemoveProjectOptions) => Promise<void>;
  addRecentLaunch: (launch: Omit<RecentLaunch, 'id' | 'timestamp'>) => Promise<void>;
  getProjectsByHost: (hostId: string) => Project[];
  syncWithHost: (host: Host) => Promise<void>;
} | null>(null);

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentLaunches, setRecentLaunches] = useState<RecentLaunch[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const [storedProjects, storedLaunches] = await Promise.all([
        loadProjects(),
        loadRecentLaunches(),
      ]);
      if (!mounted) return;
      setProjects(storedProjects);
      setRecentLaunches(storedLaunches);
      setReady(true);
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const persistProjects = useCallback(async (nextProjects: Project[]) => {
    setProjects(nextProjects);
    await saveProjects(nextProjects);
  }, []);

  const persistRecentLaunches = useCallback(async (nextLaunches: RecentLaunch[]) => {
    setRecentLaunches(nextLaunches);
    await saveRecentLaunches(nextLaunches);
  }, []);

  const addProject = useCallback(
    async (draft: ProjectDraftWithHost): Promise<Project> => {
      const { host, ...projectDraft } = draft;
      let projectId = createId('project');

      if (host) {
        try {
          const { project: remoteProject } = await addRemoteProject(host, {
            name: projectDraft.name,
            path: projectDraft.path,
          });
          projectId = remoteProject.id;
        } catch (error) {
          console.warn('Failed to save project to remote, saving locally:', error);
        }
      }

      const project: Project = {
        ...projectDraft,
        id: projectId,
      };
      await persistProjects([...projects, project]);
      return project;
    },
    [projects, persistProjects]
  );

  const updateProject = useCallback(
    async (id: string, updates: Partial<Project>, options?: UpdateProjectOptions) => {
      if (options?.host) {
        try {
          await updateRemoteProject(options.host, id, {
            name: updates.name,
            path: updates.path,
          });
        } catch (error) {
          console.warn('Failed to update project on remote:', error);
        }
      }
      const nextProjects = projects.map((p) => (p.id === id ? { ...p, ...updates } : p));
      await persistProjects(nextProjects);
    },
    [projects, persistProjects]
  );

  const removeProject = useCallback(
    async (id: string, options?: RemoveProjectOptions) => {
      if (options?.host) {
        try {
          await removeRemoteProject(options.host, id);
        } catch (error) {
          console.warn('Failed to remove project from remote:', error);
        }
      }
      const nextProjects = projects.filter((p) => p.id !== id);
      await persistProjects(nextProjects);
    },
    [projects, persistProjects]
  );

  const syncWithHost = useCallback(
    async (host: Host) => {
      try {
        const { projects: remoteProjects } = await getProjects(host);

        const remoteIds = new Set(remoteProjects.map((p) => p.id));
        const localForHost = projects.filter((p) => p.hostId === host.id);

        // Find local projects not on remote (need migration)
        const toMigrate = localForHost.filter((p) => !remoteIds.has(p.id));

        // Push orphaned local projects to remote
        const migratedProjects: Project[] = [];
        for (const local of toMigrate) {
          try {
            const { project: created } = await addRemoteProject(host, {
              name: local.name,
              path: local.path,
            });
            migratedProjects.push({
              ...local,
              id: created.id,
            });
          } catch (error) {
            console.warn('Failed to migrate project to remote:', error);
            migratedProjects.push(local);
          }
        }

        // Convert remote projects to local format
        const fromRemote: Project[] = remoteProjects.map((rp) => ({
          id: rp.id,
          hostId: host.id,
          name: rp.name,
          path: rp.path,
        }));

        // Merge: keep projects from other hosts, replace this host's with remote + migrated
        const otherHostProjects = projects.filter((p) => p.hostId !== host.id);
        const mergedProjects = [...otherHostProjects, ...fromRemote];

        await persistProjects(mergedProjects);
      } catch (error) {
        console.warn('Failed to sync projects with host:', error);
      }
    },
    [projects, persistProjects]
  );

  const addRecentLaunch = useCallback(
    async (launch: Omit<RecentLaunch, 'id' | 'timestamp'>) => {
      const newLaunch: RecentLaunch = {
        ...launch,
        id: createId('launch'),
        timestamp: Date.now(),
      };
      const filtered = recentLaunches.filter(
        (l) => !(l.projectId === launch.projectId && l.command.command === launch.command.command)
      );
      const nextLaunches = [newLaunch, ...filtered].slice(0, MAX_RECENT_LAUNCHES);
      await persistRecentLaunches(nextLaunches);
    },
    [recentLaunches, persistRecentLaunches]
  );

  const getProjectsByHost = useCallback(
    (hostId: string) => projects.filter((p) => p.hostId === hostId),
    [projects]
  );

  const value = useMemo(
    () => ({
      projects,
      recentLaunches,
      ready,
      addProject,
      updateProject,
      removeProject,
      addRecentLaunch,
      getProjectsByHost,
      syncWithHost,
    }),
    [
      projects,
      recentLaunches,
      ready,
      addProject,
      updateProject,
      removeProject,
      addRecentLaunch,
      getProjectsByHost,
      syncWithHost,
    ]
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const context = useContext(ProjectsContext);
  if (!context) {
    throw new Error('useProjects must be used within ProjectsProvider');
  }
  return context;
}
