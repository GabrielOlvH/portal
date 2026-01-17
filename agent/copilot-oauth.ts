import { formatOAuthError } from './utils';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const CLIENT_ID = 'Iv1.b507a08c87ecfe98';
const SCOPE = 'read:user';

export type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
};

export type AccessTokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
};

export type DeviceFlowError =
  | 'authorization_pending'
  | 'slow_down'
  | 'expired_token'
  | 'access_denied'
  | 'unsupported_grant_type'
  | 'incorrect_client_credentials'
  | 'incorrect_device_code'
  | 'device_flow_disabled';

type TokenPollResult =
  | { status: 'success'; token: AccessTokenResponse }
  | { status: 'pending' }
  | { status: 'slow_down'; newInterval: number }
  | { status: 'error'; error: string };

export async function requestDeviceCode(): Promise<
  { success: true; data: DeviceCodeResponse } | { success: false; error: string }
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        scope: SCOPE,
      }),
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      return { success: false, error: `GitHub returned ${response.status}: ${text.slice(0, 200)}` };
    }

    const data = JSON.parse(text) as DeviceCodeResponse;

    if (!data.device_code || !data.user_code || !data.verification_uri) {
      return { success: false, error: 'Invalid device code response from GitHub' };
    }

    return { success: true, data };
  } catch (err) {
    const message = formatOAuthError(err) || 'Failed to request device code';
    return { success: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

async function pollOnce(deviceCode: string): Promise<TokenPollResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    const data = JSON.parse(text);

    if (data.access_token) {
      return {
        status: 'success',
        token: {
          access_token: data.access_token,
          token_type: data.token_type || 'bearer',
          scope: data.scope || SCOPE,
        },
      };
    }

    const errorCode = data.error as DeviceFlowError | undefined;

    switch (errorCode) {
      case 'authorization_pending':
        return { status: 'pending' };

      case 'slow_down':
        return { status: 'slow_down', newInterval: (data.interval || 5) + 5 };

      case 'expired_token':
        return { status: 'error', error: 'Device code expired. Please restart authentication.' };

      case 'access_denied':
        return { status: 'error', error: 'User denied authorization.' };

      case 'incorrect_device_code':
        return { status: 'error', error: 'Invalid device code.' };

      case 'incorrect_client_credentials':
        return { status: 'error', error: 'Invalid client credentials.' };

      case 'device_flow_disabled':
        return { status: 'error', error: 'Device flow is disabled for this application.' };

      default:
        if (errorCode) {
          return { status: 'error', error: `OAuth error: ${errorCode}` };
        }
        return { status: 'error', error: `Unexpected response: ${text.slice(0, 200)}` };
    }
  } catch (err) {
    const message = formatOAuthError(err) || 'Token poll request failed';
    return { status: 'error', error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export type PollProgress = {
  attempt: number;
  maxAttempts: number;
  intervalMs: number;
};

export type PollForTokenOptions = {
  deviceCode: string;
  expiresIn: number;
  initialInterval: number;
  onProgress?: (progress: PollProgress) => void;
};

export async function pollForToken(
  options: PollForTokenOptions
): Promise<{ success: true; token: AccessTokenResponse } | { success: false; error: string }> {
  const { deviceCode, expiresIn, initialInterval, onProgress } = options;

  let intervalMs = initialInterval * 1000;
  const maxAttempts = Math.floor((expiresIn * 1000) / intervalMs);
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;

    onProgress?.({ attempt, maxAttempts, intervalMs });

    const result = await pollOnce(deviceCode);

    switch (result.status) {
      case 'success':
        return { success: true, token: result.token };

      case 'pending':
        await sleep(intervalMs);
        break;

      case 'slow_down':
        intervalMs = result.newInterval * 1000;
        await sleep(intervalMs);
        break;

      case 'error':
        return { success: false, error: result.error };
    }
  }

  return { success: false, error: 'Polling timed out waiting for user authorization.' };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type DeviceFlowSession = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  interval: number;
};

export async function startDeviceFlow(): Promise<
  { success: true; session: DeviceFlowSession } | { success: false; error: string }
> {
  const result = await requestDeviceCode();

  if (!result.success) {
    return { success: false, error: (result as { success: false; error: string }).error };
  }

  const { data } = result;

  return {
    success: true,
    session: {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresAt: Date.now() + data.expires_in * 1000,
      interval: data.interval,
    },
  };
}

export async function completeDeviceFlow(
  session: DeviceFlowSession,
  onProgress?: PollForTokenOptions['onProgress']
): Promise<{ success: true; token: AccessTokenResponse } | { success: false; error: string }> {
  const remainingSeconds = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));

  if (remainingSeconds <= 0) {
    return { success: false, error: 'Device code has expired. Please restart authentication.' };
  }

  return pollForToken({
    deviceCode: session.deviceCode,
    expiresIn: remainingSeconds,
    initialInterval: session.interval,
    onProgress,
  });
}
