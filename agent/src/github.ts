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
  // Enhanced CI data from Checks API
  workflowName?: string;
  jobName?: string;
  runId?: number;
  checkSuiteId?: number;
  startedAt?: string;
  completedAt?: string;
  steps?: Array<{
    name: string;
    status: string;
    conclusion?: string;
    number: number;
    startedAt?: string;
    completedAt?: string;
  }>;
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
  // Local git state
  ahead?: number;      // commits ahead of origin
  behind?: number;     // commits behind origin
  staged?: number;     // staged files count
  unstaged?: number;   // unstaged changes count
};

const CACHE_TTL = 30000; // 30 seconds
const MAX_STATUS_CACHE_SIZE = 200;
const statusCache = new Map<string, { ts: number; value: CommitStatus }>();

function evictStatusCache(): void {
  const now = Date.now();
  // First, remove expired entries
  for (const [key, entry] of statusCache) {
    if (now - entry.ts > CACHE_TTL) {
      statusCache.delete(key);
    }
  }
  // If still over limit, remove oldest entries
  if (statusCache.size > MAX_STATUS_CACHE_SIZE) {
    const entries = [...statusCache.entries()];
    entries.sort((a, b) => a[1].ts - b[1].ts);
    const toRemove = entries.slice(0, entries.length - MAX_STATUS_CACHE_SIZE);
    for (const [key] of toRemove) {
      statusCache.delete(key);
    }
  }
}

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
    // Use origin/branch to get the last pushed commit (what GitHub knows about)
    const { stdout } = await execFileAsync(
      'git',
      ['-C', projectPath, 'rev-parse', `origin/${branch}`],
      { timeout: 5000 }
    );
    return stdout.trim() || null;
  } catch {
    // Fall back to local branch if origin doesn't exist
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
}

export async function getGitDiffStats(projectPath: string, branch: string): Promise<{
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
}> {
  const result = { ahead: 0, behind: 0, staged: 0, unstaged: 0 };
  
  try {
    // Get ahead/behind counts
    const { stdout: revList } = await execFileAsync(
      'git',
      ['-C', projectPath, 'rev-list', '--left-right', '--count', `origin/${branch}...${branch}`],
      { timeout: 5000 }
    ).catch(() => ({ stdout: '' }));
    
    if (revList.trim()) {
      const [behind, ahead] = revList.trim().split(/\s+/).map(Number);
      result.behind = behind || 0;
      result.ahead = ahead || 0;
    }
    
    // Get staged and unstaged counts
    const { stdout: status } = await execFileAsync(
      'git',
      ['-C', projectPath, 'status', '--porcelain'],
      { timeout: 5000 }
    ).catch(() => ({ stdout: '' }));
    
    if (status.trim()) {
      const lines = status.trim().split('\n');
      for (const line of lines) {
        const index = line[0];
        const workTree = line[1];
        // Staged: index has A, M, D, R, C (not ? or space)
        if (index && index !== ' ' && index !== '?') {
          result.staged++;
        }
        // Unstaged: work tree has M, D (not space or ?)
        if (workTree && workTree !== ' ' && workTree !== '?') {
          result.unstaged++;
        }
      }
    }
  } catch {
    // Ignore errors, return zeros
  }
  
  return result;
}

export async function getCommitStatus(
  repo: RepoInfo,
  sha: string
): Promise<{ state: CommitStatus['state']; contexts: CommitStatusContext[] } | null> {
  try {
    // Fetch both legacy status and new check runs
    const [statusResult, checkRunsResult] = await Promise.all([
      // Legacy Status API
      execFileAsync(
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
      ).catch(() => null),
      // New Checks API
      execFileAsync(
        'gh',
        [
          'api',
          `-H`,
          'Accept: application/vnd.github+json',
          `-H`,
          'X-GitHub-Api-Version: 2022-11-28',
          `/repos/${repo.owner}/${repo.repo}/commits/${sha}/check-runs`,
        ],
        { timeout: 10000 }
      ).catch(() => null),
    ]);

    // Parse check runs for enhanced data
    const checkRunsMap = new Map<string, CommitStatusContext>();
    if (checkRunsResult) {
      const checkRunsData = JSON.parse(checkRunsResult.stdout) as {
        check_runs: Array<{
          id: number;
          name: string;
          status: string;
          conclusion: string | null;
          details_url?: string;
          started_at?: string;
          completed_at?: string;
          check_suite?: {
            id: number;
          };
          app?: {
            slug?: string;
            name?: string;
          };
          steps?: Array<{
            name: string;
            status: string;
            conclusion?: string;
            number: number;
            started_at?: string;
            completed_at?: string;
          }>;
        }>;
      };

      for (const check of checkRunsData.check_runs || []) {
        // Use check name as key, prefer GitHub Actions checks
        const isGitHubActions = check.app?.slug === 'github-actions';
        const key = check.name;

        const existing = checkRunsMap.get(key);
        if (existing && !isGitHubActions) continue; // Prefer GitHub Actions

        // Map check status to state
        let state: CommitStatus['state'];
        if (check.status === 'completed') {
          if (check.conclusion === 'success') state = 'success';
          else if (check.conclusion === 'failure') state = 'failure';
          else if (check.conclusion === 'cancelled') state = 'error';
          else if (check.conclusion === 'timed_out') state = 'error';
          else if (check.conclusion === 'skipped') state = 'success';
          else state = 'error';
        } else {
          state = 'pending';
        }

        // Extract workflow name from check name if it contains " / "
        // GitHub Actions format: "Workflow Name / Job Name"
        let workflowName: string | undefined;
        let jobName = check.name;
        const separatorIndex = check.name.indexOf(' / ');
        if (separatorIndex > 0) {
          workflowName = check.name.substring(0, separatorIndex);
          jobName = check.name.substring(separatorIndex + 3);
        }

        checkRunsMap.set(key, {
          context: check.name,
          state,
          description: check.conclusion
            ? `${check.status}: ${check.conclusion}`
            : check.status,
          targetUrl: check.details_url,
          workflowName,
          jobName,
          runId: check.id,
          checkSuiteId: check.check_suite?.id,
          startedAt: check.started_at,
          completedAt: check.completed_at,
          steps: check.steps?.map((step) => ({
            name: step.name,
            status: step.status,
            conclusion: step.conclusion,
            number: step.number,
            startedAt: step.started_at,
            completedAt: step.completed_at,
          })),
        });
      }
    }

    // Parse legacy status
    let state: CommitStatus['state'] = 'pending';
    const contexts: CommitStatusContext[] = [];
    let hasLegacyStatuses = false;

    if (statusResult) {
      const data = JSON.parse(statusResult.stdout) as {
        state: string;
        statuses: Array<{
          context: string;
          state: string;
          description?: string;
          target_url?: string;
        }>;
      };

      hasLegacyStatuses = data.statuses.length > 0;
      if (hasLegacyStatuses) {
        state = data.state as CommitStatus['state'];
      }

      for (const s of data.statuses) {
        // Check if we have enhanced data from check runs
        const enhanced = checkRunsMap.get(s.context);
        if (enhanced) {
          contexts.push(enhanced);
          checkRunsMap.delete(s.context); // Remove used check
        } else {
          contexts.push({
            context: s.context,
            state: s.state,
            description: s.description,
            targetUrl: s.target_url,
          });
        }
      }
    }

    // Add remaining check runs that weren't in legacy status
    for (const [, checkContext] of checkRunsMap) {
      contexts.push(checkContext);
    }

    // Determine state from all contexts (check runs + legacy statuses)
    // The legacy status API only considers legacy statuses, not check runs,
    // so we need to compute the combined state ourselves
    if (contexts.length > 0 && !hasLegacyStatuses) {
      // Only check runs, no legacy statuses - compute state from checks
      const hasPending = contexts.some((c) => c.state === 'pending');
      const hasFailure = contexts.some((c) => c.state === 'failure');
      const hasError = contexts.some((c) => c.state === 'error');

      if (hasFailure) state = 'failure';
      else if (hasError) state = 'error';
      else if (hasPending) state = 'pending';
      else state = 'success';
    } else if (contexts.length > 0 && hasLegacyStatuses) {
      // Both check runs and legacy statuses - recompute combined state
      const hasPending = contexts.some((c) => c.state === 'pending');
      const hasFailure = contexts.some((c) => c.state === 'failure');
      const hasError = contexts.some((c) => c.state === 'error');

      if (hasFailure) state = 'failure';
      else if (hasError) state = 'error';
      else if (hasPending) state = 'pending';
      else state = 'success';
    }

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
  
  // Get local git state (ahead/behind/staged/unstaged)
  const diffStats = await getGitDiffStats(projectPath, targetBranch);
  
  const result: CommitStatus = {
    projectId,
    hostId,
    repo: `${repo.owner}/${repo.repo}`,
    branch: targetBranch,
    sha,
    state: status.state,
    contexts: status.contexts,
    updatedAt: now,
    ahead: diffStats.ahead,
    behind: diffStats.behind,
    staged: diffStats.staged,
    unstaged: diffStats.unstaged,
  };
  
  statusCache.set(cacheKey, { ts: now, value: result });
  evictStatusCache();
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
