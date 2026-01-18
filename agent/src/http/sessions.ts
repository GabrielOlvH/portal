import { getSessionInsights } from '../agents';
import { listSessions } from '../sessions';
import { capturePane, parseSessions } from '../tmux';
import { getUsageSnapshot } from '../usage';

export type SessionsOptions = {
  preview?: boolean;
  previewLines?: number;
  insights?: boolean;
};

export async function fetchSessions(options: SessionsOptions = {}) {
  const preview = Boolean(options.preview);
  const parsedLines = Number(options.previewLines ?? 6);
  const lines = Number.isFinite(parsedLines) ? parsedLines : 6;
  const includeInsights = Boolean(options.insights);
  try {
    const raw = await listSessions();
    const sessions = parseSessions(raw);
    if (!preview && !includeInsights) return sessions;

    const usage = includeInsights ? await getUsageSnapshot() : null;
    const withPreview = await Promise.all(
      sessions.map(async (session) => {
        let previewLines: string[] | null = null;
        if (preview) {
          try {
            previewLines = await capturePane(session.name, lines);
          } catch {
            previewLines = [];
          }
        }

        let insights: Record<string, unknown> | null = null;
        if (usage) {
          const sessionInsights = await getSessionInsights(session.name, previewLines || undefined);
          const meta = sessionInsights.meta || usage.meta;
          insights = { ...usage, ...sessionInsights, meta };
        }

        if (!preview) {
          return { ...session, ...(insights ? { insights } : {}) };
        }

        return { ...session, preview: previewLines || [], ...(insights ? { insights } : {}) };
      })
    );
    return withPreview;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('no server running') || message.includes('No such file or directory')) return [];
    throw err;
  }
}

