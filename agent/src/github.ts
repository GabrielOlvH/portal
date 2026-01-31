import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type RepoInfo = {
  owner: string;
  repo: string;
};

export type CommitStatusContext = {
  context: string;
  state: string;
  description?: string;
  targetUrl?: string;
};

export type CommitStatus = {
  projectId: string;
  hostId: string;
  repo: string;
  branch: string;
  sha: string;
  state: 'pending' | 'success' | 'failure' | 'error';
  contexts: CommitStatusContext[];
  updatedAt: number;
};

const CACHE_TTL = 30000; // 30 seconds
const statusCache = new Map<string, { ts: number; value: CommitStatus }>();

function getCacheKey(projectId: string, branch: string): string {
  return `${projectId}:${branch}`;
}

export async function isGhAuthenticated(): Promise<boolean> {
  try {
    await execFileAsync('gh', ['auth', 'status'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function getRepoFromPath(projectPath: string): Promise<RepoInfo | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', projectPath, 'remote', 'get-url', 'origin'],
      { timeout: 5000 }
    );
    const url = stdout.trim();
    
    // Parse HTTPS: https://github.com/owner/repo.git
    const httpsMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }
    
    // Parse SSH: git@github.com:owner/repo.git
    const sshMatch = url.match(/github\.com:([^\/]+)\/([^\/]+?)(?:\.git)?$/);
    if (sshMatch) {
      return { owner: sshMatch[1], repo: sshMatch[2] };
    }
    
    return null;
  } catch {
    return null;
  }
}

export async function getCurrentBranch(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', projectPath, 'rev-parse', '--abbrev-ref', 'HEAD'],
      { timeout: 5000 }
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getBranchesForProject(projectPath: string): Promise<string[]> {
  try {
    // Get local branches
    const { stdout } = await execFileAsync(
      'git',
      ['-C', projectPath, 'branch', '--format=%(refname:short)'],
      { timeout: 5000 }
    );
    const branches = stdout.trim().split('\n').filter(Boolean);
    
    // Get current branch if not in list
    const current = await getCurrentBranch(projectPath);
    if (current && !branches.includes(current)) {
      branches.push(current);
    }
    
    return branches;
  } catch {
    return [];
  }
}

export async function getLatestCommit(projectPath: string, branch: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', projectPath, 'rev-parse', branch],
      { timeout: 5000 }
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getCommitStatus(
  repo: RepoInfo,
  sha: string
): Promise<{ state: CommitStatus['state']; contexts: CommitStatusContext[] } | null> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      [
        'api',
        `-H`,
        'Accept: application/vnd.github+json',
        `-H`,
        'X-GitHub-Api-Version: 2022-11-28',
        `/repos/${repo.owner}/${repo.repo}/commits/${sha}/status`,
      ],
      { timeout: 10000 }
    );
    
    const data = JSON.parse(stdout) as {
      state: string;
      statuses: Array<{
        context: string;
        state: string;
        description?: string;
        target_url?: string;
      }>;
    };
    
    const state = data.state as CommitStatus['state'];
    const contexts = data.statuses.map((s) => ({
      context: s.context,
      state: s.state,
      description: s.description,
      targetUrl: s.target_url,
    }));
    
    return { state, contexts };
  } catch {
    return null;
  }
}

export async function getProjectCommitStatus(
  projectId: string,
  hostId: string,
  projectPath: string,
  branch?: string
): Promise<CommitStatus | null> {
  const targetBranch = branch || (await getCurrentBranch(projectPath));
  if (!targetBranch) return null;
  
  const cacheKey = getCacheKey(projectId, targetBranch);
  const cached = statusCache.get(cacheKey);
  const now = Date.now();
  
  if (cached && now - cached.ts < CACHE_TTL) {
    return cached.value;
  }
  
  const repo = await getRepoFromPath(projectPath);
  if (!repo) return null;
  
  const sha = await getLatestCommit(projectPath, targetBranch);
  if (!sha) return null;
  
  const status = await getCommitStatus(repo, sha);
  if (!status) return null;
  
  const result: CommitStatus = {
    projectId,
    hostId,
    repo: `${repo.owner}/${repo.repo}`,
    branch: targetBranch,
    sha,
    state: status.state,
    contexts: status.contexts,
    updatedAt: now,
  };
  
  statusCache.set(cacheKey, { ts: now, value: result });
  return result;
}

export async function getAllProjectStatuses(
  projects: Array<{ id: string; hostId: string; path: string }>,
  branches?: Map<string, string[]> // projectId -> branches
): Promise<CommitStatus[]> {
  const authenticated = await isGhAuthenticated();
  if (!authenticated) return [];
  
  const statuses: CommitStatus[] = [];
  
  for (const project of projects) {
    const projectBranches = branches?.get(project.id);
    
    if (projectBranches && projectBranches.length > 0) {
      // Check specific branches
      for (const branch of projectBranches) {
        const status = await getProjectCommitStatus(project.id, project.hostId, project.path, branch);
        if (status) statuses.push(status);
      }
    } else {
      // Check current branch only
      const status = await getProjectCommitStatus(project.id, project.hostId, project.path);
      if (status) statuses.push(status);
    }
  }
  
  return statuses;
}

export function clearStatusCache(): void {
  statusCache.clear();
}

export function getCachedStatus(projectId: string, branch: string): CommitStatus | null {
  const cacheKey = getCacheKey(projectId, branch);
  const cached = statusCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.ts > CACHE_TTL) {
    statusCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}
