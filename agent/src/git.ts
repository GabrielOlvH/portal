import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gitCache, evictGitCache } from './state';

import type { GitStatus } from './state';

const execFileAsync = promisify(execFile);

export async function getGitStatus(repoPath?: string | null): Promise<GitStatus> {
  if (!repoPath) return { repo: false };
  const cached = gitCache.get(repoPath);
  const now = Date.now();
  if (cached && now - cached.ts < 5000) return cached.value;
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'status', '--porcelain=v2', '-b'],
      { timeout: 4000 }
    );
    const lines = stdout.trim().split('\n').filter(Boolean);
    let branch;
    let ahead = 0;
    let behind = 0;
    let dirty = 0;
    for (const line of lines) {
      if (line.startsWith('# branch.head ')) {
        branch = line.replace('# branch.head ', '').trim();
      } else if (line.startsWith('# branch.ab ')) {
        const match = line.match(/\+(\d+)\s+-(\d+)/);
        if (match) {
          ahead = Number(match[1]);
          behind = Number(match[2]);
        }
      } else if (/^[12u]\s/.test(line)) {
        dirty += 1;
      }
    }
    const value = { repo: true, branch, ahead, behind, dirty, path: repoPath };
    gitCache.set(repoPath, { ts: now, value });
    evictGitCache();
    return value;
  } catch {
    const value = { repo: false };
    gitCache.set(repoPath, { ts: now, value });
    evictGitCache();
    return value;
  }
}
