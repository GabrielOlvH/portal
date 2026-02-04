import type { Hono } from 'hono';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import os from 'node:os';
import { jsonError } from '../errors';

interface Project {
  id: string;
  name: string;
  path: string;
}

interface ProjectsData {
  projects: Project[];
}

const PROJECTS_FILE = join(os.homedir(), '.config', 'ter', 'projects.json');

function generateId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `project-${timestamp}-${random}`;
}

async function loadProjects(): Promise<ProjectsData> {
  try {
    const content = await readFile(PROJECTS_FILE, 'utf-8');
    return JSON.parse(content) as ProjectsData;
  } catch {
    return { projects: [] };
  }
}

async function saveProjects(data: ProjectsData): Promise<void> {
  await mkdir(dirname(PROJECTS_FILE), { recursive: true });
  await writeFile(PROJECTS_FILE, JSON.stringify(data, null, 2));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    const resolved = resolve(path);
    const stats = await stat(resolved);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export function registerProjectRoutes(app: Hono) {
  app.get('/projects', async (c) => {
    try {
      const data = await loadProjects();
      return c.json({ projects: data.projects });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.post('/projects', async (c) => {
    try {
      const body = (await c.req.json()) as { name?: unknown; path?: unknown };

      if (typeof body.name !== 'string' || !body.name.trim()) {
        return c.json({ error: 'name is required' }, 400);
      }
      if (typeof body.path !== 'string' || !body.path.trim()) {
        return c.json({ error: 'path is required' }, 400);
      }

      const resolvedPath = resolve(body.path);
      if (!(await pathExists(resolvedPath))) {
        return c.json({ error: 'Path does not exist or is not a directory' }, 400);
      }

      const data = await loadProjects();

      const existing = data.projects.find((p) => p.path === resolvedPath);
      if (existing) {
        return c.json({ error: 'Project with this path already exists', existingId: existing.id }, 409);
      }

      const project: Project = {
        id: generateId(),
        name: body.name.trim(),
        path: resolvedPath,
      };

      data.projects.push(project);
      await saveProjects(data);

      return c.json({ project }, 201);
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.put('/projects/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const body = (await c.req.json()) as { name?: unknown; path?: unknown };

      const data = await loadProjects();
      const index = data.projects.findIndex((p) => p.id === id);

      if (index === -1) {
        return c.json({ error: 'Project not found' }, 404);
      }

      if (body.name !== undefined) {
        if (typeof body.name !== 'string' || !body.name.trim()) {
          return c.json({ error: 'name must be a non-empty string' }, 400);
        }
        data.projects[index].name = body.name.trim();
      }

      if (body.path !== undefined) {
        if (typeof body.path !== 'string' || !body.path.trim()) {
          return c.json({ error: 'path must be a non-empty string' }, 400);
        }
        const resolvedPath = resolve(body.path);
        if (!(await pathExists(resolvedPath))) {
          return c.json({ error: 'Path does not exist or is not a directory' }, 400);
        }

        const duplicate = data.projects.find((p) => p.path === resolvedPath && p.id !== id);
        if (duplicate) {
          return c.json({ error: 'Another project with this path already exists', existingId: duplicate.id }, 409);
        }

        data.projects[index].path = resolvedPath;
      }

      await saveProjects(data);
      return c.json({ project: data.projects[index] });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.delete('/projects/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const data = await loadProjects();
      const index = data.projects.findIndex((p) => p.id === id);

      if (index === -1) {
        return c.json({ error: 'Project not found' }, 404);
      }

      const removed = data.projects.splice(index, 1)[0];
      await saveProjects(data);

      return c.json({ ok: true, removed });
    } catch (err) {
      return jsonError(c, err);
    }
  });
}
