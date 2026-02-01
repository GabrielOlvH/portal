import type { Hono } from 'hono';
import { getSessionInsights } from '../../agents';
import { capturePane, getCursorInfo, requireName, runTmux, sessionTarget, spawnTmuxSession } from '../../tmux';
import { jsonError } from '../errors';
import { fetchSessions } from '../sessions';

type CreateSessionBody = {
  name?: unknown;
  windowName?: unknown;
  command?: unknown;
};

type RenameSessionBody = {
  name?: unknown;
};

type SendKeysBody = {
  text?: unknown;
  keys?: unknown;
};

type ResizeSessionBody = {
  cols?: unknown;
  rows?: unknown;
};

export function registerSessionRoutes(app: Hono) {
  app.get('/sessions', async (c) => {
    try {
      const preview = c.req.query('preview') === '1';
      const lines = Number(c.req.query('lines') ?? '6');
      const includeInsights = c.req.query('insights') === '1';
      const sessions = await fetchSessions({
        preview,
        previewLines: Number.isFinite(lines) ? lines : 6,
        insights: includeInsights,
      });
      return c.json(sessions);
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.post('/sessions', async (c) => {
    try {
      const body = await c.req.json<CreateSessionBody>();
      const name = requireName(body.name);
      const windowName = body.windowName && typeof body.windowName === 'string' ? body.windowName.trim() : undefined;
      const command = body.command && typeof body.command === 'string' ? body.command.trim() : undefined;
      const args = ['new-session', '-d', '-s', name];
      if (windowName) args.push('-n', windowName);
      if (command) args.push(command);
      await spawnTmuxSession(args);
      await runTmux(['set-option', '-t', name, 'status', 'off']);
      return c.json({ ok: true });
    } catch (err) {
      return jsonError(c, err, 400);
    }
  });

  app.post('/sessions/:name/rename', async (c) => {
    try {
      const oldName = requireName(c.req.param('name'));
      const body = await c.req.json<RenameSessionBody>();
      const newName = requireName(body.name);
      await runTmux(['rename-session', '-t', oldName, newName]);
      return c.json({ ok: true });
    } catch (err) {
      return jsonError(c, err, 400);
    }
  });

  app.post('/sessions/:name/kill', async (c) => {
    try {
      const name = requireName(c.req.param('name'));
      await runTmux(['kill-session', '-t', name]);
      return c.json({ ok: true });
    } catch (err) {
      return jsonError(c, err, 400);
    }
  });

  app.post('/sessions/:name/keys', async (c) => {
    try {
      const name = requireName(c.req.param('name'));
      const body = await c.req.json<SendKeysBody>();
      if (typeof body.text === 'string' && body.text.length > 0) {
        await runTmux(['send-keys', '-l', '-t', sessionTarget(name), body.text]);
        return c.json({ ok: true });
      }
      if (!Array.isArray(body.keys) || body.keys.length === 0 || body.keys.some((key) => typeof key !== 'string')) {
        return c.json({ error: 'Keys or text are required' }, 400);
      }
      await runTmux(['send-keys', '-t', sessionTarget(name), ...body.keys]);
      return c.json({ ok: true });
    } catch (err) {
      return jsonError(c, err, 400);
    }
  });

  app.post('/sessions/:name/resize', async (c) => {
    try {
      const name = requireName(c.req.param('name'));
      const body = await c.req.json<ResizeSessionBody>();
      const cols = Number(body.cols);
      const rows = Number(body.rows);
      if (!Number.isFinite(cols) || !Number.isFinite(rows)) {
        return c.json({ error: 'cols and rows are required' }, 400);
      }
      await runTmux(['resize-window', '-t', sessionTarget(name), '-x', String(cols), '-y', String(rows)]);
      return c.json({ ok: true });
    } catch (err) {
      return jsonError(c, err, 400);
    }
  });

  app.get('/sessions/:name/capture', async (c) => {
    try {
      const name = requireName(c.req.param('name'));
      const lines = Number(c.req.query('lines') ?? '60');
      const preview = await capturePane(name, lines);
      const includeCursor = c.req.query('cursor') === '1';
      if (!includeCursor) return c.json({ lines: preview });
      const cursor = await getCursorInfo(name);
      return c.json({ lines: preview, cursor });
    } catch (err) {
      return jsonError(c, err, 400);
    }
  });

  app.get('/sessions/:name/insights', async (c) => {
    try {
      const name = requireName(c.req.param('name'));
      const previewLines = await capturePane(name, 4);
      const insights = await getSessionInsights(name, previewLines);
      return c.json(insights);
    } catch (err) {
      return jsonError(c, err, 400);
    }
  });
}

