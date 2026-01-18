const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_BATCH_SIZE = 100;

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  channelId?: string;
};

type ExpoPushResponse = {
  data?: { status?: string; message?: string; details?: Record<string, unknown> }[];
  errors?: { message?: string }[];
};

function chunkMessages(messages: ExpoPushMessage[]): ExpoPushMessage[][] {
  const batches: ExpoPushMessage[][] = [];
  for (let i = 0; i < messages.length; i += MAX_BATCH_SIZE) {
    batches.push(messages.slice(i, i + MAX_BATCH_SIZE));
  }
  return batches;
}

export async function sendExpoPushMessages(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const batches = chunkMessages(messages);
  for (const batch of batches) {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Expo push failed (${response.status})`);
    }

    const payload = (await response.json()) as ExpoPushResponse;
    if (payload.errors && payload.errors.length > 0) {
      const message = payload.errors.map((err) => err.message).filter(Boolean).join('; ');
      if (message) {
        throw new Error(message);
      }
    }
  }
}
