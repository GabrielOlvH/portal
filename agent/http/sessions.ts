import { getSessionInsights } from '../agents';
import { listSessions } from '../sessions';
import { capturePane, parseSessions } from '../tmux';
import { getUsageSnapshot } from '../usage';

export type SessionsOptions = {
  preview?: boolean;
  previewLines?: number;
  insights?: boolean;
};

type SessionSummary = ReturnType<typeof parseSessions>[number];
type SessionPayload = SessionSummary & { preview?: string[]; insights?: Record<string, unknown> };

export async function fetchSessions(options: SessionsOptions = {}): Promise<SessionPayload[]> {
  const preview = Boolean(options.preview);
  const lines = Number.isFinite(options.previewLines) ? options.previewLines : 6;
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
    if (message.includes('no server running')) return [];
    throw err;
  }
}

