import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Host, Project, GitHubCommitStatus } from '@/lib/types';
import { getGitHubStatus, refreshGitHubStatus, getGitHubConfig } from '@/lib/api';

const GITHUB_STATUS_KEY = 'github-status';
const GITHUB_CONFIG_KEY = 'github-config';

// Group projects by host for efficient fetching
function groupProjectsByHost(projects: Project[]): Map<string, Project[]> {
  const groups = new Map<string, Project[]>();
  for (const project of projects) {
    const existing = groups.get(project.hostId) || [];
    existing.push(project);
    groups.set(project.hostId, existing);
  }
  return groups;
}

// Get host by ID
function getHostById(hosts: Host[], hostId: string): Host | undefined {
  return hosts.find((h) => h.id === hostId);
}

export function useGitHubStatus(
  hosts: Host[],
  projects: Project[],
  enabled: boolean = true
) {
  return useQuery({
    queryKey: [GITHUB_STATUS_KEY, projects.map((p) => p.id).sort()],
    queryFn: async (): Promise<GitHubCommitStatus[]> => {
      if (projects.length === 0) return [];

      const grouped = groupProjectsByHost(projects);
      const results: GitHubCommitStatus[] = [];

      for (const [hostId, hostProjects] of grouped) {
        const host = getHostById(hosts, hostId);
        if (!host) continue;

        try {
          const response = await getGitHubStatus(
            host,
            hostProjects.map((p) => ({ id: p.id, hostId: p.hostId, path: p.path }))
          );
          if (response.authenticated) {
            results.push(...response.statuses);
          }
        } catch (error) {
          console.warn('[GitHub] Failed to get status for host:', hostId, error);
        }
      }

      return results;
    },
    enabled: enabled && projects.length > 0,
    staleTime: 30_000, // 30 seconds
    refetchInterval: enabled ? 60_000 : false, // Poll every minute when enabled
  });
}

export function useRefreshGitHubStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      hosts,
      projects,
    }: {
      hosts: Host[];
      projects: Project[];
    }): Promise<GitHubCommitStatus[]> => {
      if (projects.length === 0) return [];

      const grouped = groupProjectsByHost(projects);
      const results: GitHubCommitStatus[] = [];

      for (const [hostId, hostProjects] of grouped) {
        const host = getHostById(hosts, hostId);
        if (!host) continue;

        try {
          const response = await refreshGitHubStatus(
            host,
            hostProjects.map((p) => ({ id: p.id, hostId: p.hostId, path: p.path }))
          );
          if (response.authenticated) {
            results.push(...response.statuses);
          }
        } catch (error) {
          console.warn('[GitHub] Failed to refresh status for host:', hostId, error);
        }
      }

      return results;
    },
    onSuccess: (data, variables) => {
      // Update the cache with fresh data
      queryClient.setQueryData(
        [GITHUB_STATUS_KEY, variables.projects.map((p) => p.id).sort()],
        data
      );
    },
  });
}

export function useGitHubConfig(host: Host | null) {
  return useQuery({
    queryKey: [GITHUB_CONFIG_KEY, host?.id],
    queryFn: async () => {
      if (!host) throw new Error('Host is required');
      return getGitHubConfig(host);
    },
    enabled: !!host,
    staleTime: 5 * 60_000, // 5 minutes
  });
}

// Helper to group statuses by project
export function groupStatusesByProject(
  statuses: GitHubCommitStatus[]
): Map<string, GitHubCommitStatus[]> {
  const groups = new Map<string, GitHubCommitStatus[]>();
  for (const status of statuses) {
    const existing = groups.get(status.projectId) || [];
    existing.push(status);
    groups.set(status.projectId, existing);
  }
  return groups;
}

// Helper to get status summary
export function getStatusSummary(statuses: GitHubCommitStatus[]): {
  total: number;
  success: number;
  failure: number;
  pending: number;
  error: number;
} {
  return {
    total: statuses.length,
    success: statuses.filter((s) => s.state === 'success').length,
    failure: statuses.filter((s) => s.state === 'failure').length,
    pending: statuses.filter((s) => s.state === 'pending').length,
    error: statuses.filter((s) => s.state === 'error').length,
  };
}
