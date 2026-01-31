import type { Hono } from 'hono';
import {
  isGhAuthenticated,
  getAllProjectStatuses,
  getBranchesForProject,
  clearStatusCache,
  type CommitStatus,
} from '../../github';
import { jsonError } from '../errors';

type ProjectInput = {
  id: string;
  hostId: string;
  path: string;
};

type StatusRequest = {
  projects: ProjectInput[];
  branches?: Record<string, string[]>; // projectId -> branches
};

type BranchesRequest = {
  projectPath: string;
};

export function registerGitHubRoutes(app: Hono) {
  // Get commit status for all projects
  app.post('/github/status', async (c) => {
    try {
      const body = (await c.req.json()) as StatusRequest;
      const { projects, branches } = body;

      if (!Array.isArray(projects)) {
        return c.json({ error: 'projects array is required' }, 400);
      }

      const authenticated = await isGhAuthenticated();
      if (!authenticated) {
        return c.json(
          {
            error: 'GitHub CLI not authenticated. Run: gh auth login',
            authenticated: false,
            statuses: [],
          },
          401
        );
      }

      // Convert branches record to map
      const branchesMap = branches
        ? new Map(Object.entries(branches))
        : undefined;

      const statuses = await getAllProjectStatuses(projects, branchesMap);

      return c.json({
        authenticated: true,
        statuses,
      });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  // Force refresh (clear cache and fetch fresh)
  app.post('/github/refresh', async (c) => {
    try {
      const body = (await c.req.json()) as StatusRequest;
      const { projects, branches } = body;

      if (!Array.isArray(projects)) {
        return c.json({ error: 'projects array is required' }, 400);
      }

      const authenticated = await isGhAuthenticated();
      if (!authenticated) {
        return c.json(
          {
            error: 'GitHub CLI not authenticated. Run: gh auth login',
            authenticated: false,
            statuses: [],
          },
          401
        );
      }

      // Clear cache before fetching
      clearStatusCache();

      const branchesMap = branches
        ? new Map(Object.entries(branches))
        : undefined;

      const statuses = await getAllProjectStatuses(projects, branchesMap);

      return c.json({
        authenticated: true,
        statuses,
      });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  // Get branches for a project
  app.post('/github/branches', async (c) => {
    try {
      const body = (await c.req.json()) as BranchesRequest;
      const { projectPath } = body;

      if (!projectPath || typeof projectPath !== 'string') {
        return c.json({ error: 'projectPath is required' }, 400);
      }

      const branches = await getBranchesForProject(projectPath);

      return c.json({ branches });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  // Get GitHub CLI config/status
  app.get('/github/config', async (c) => {
    try {
      const authenticated = await isGhAuthenticated();
      return c.json({
        authenticated,
      });
    } catch (err) {
      return jsonError(c, err);
    }
  });
}
