/**
 * Application-wide constants for timeouts, limits, and configuration values.
 * Centralizes magic numbers for better maintainability and tuning.
 */

// UI feedback durations (milliseconds)
export const TIMING = {
  /** Duration for showing refresh indicator */
  REFRESH_INDICATOR_MS: 600,
  /** Duration for showing copied feedback */
  COPIED_FEEDBACK_MS: 2000,
  /** Delay before auto-focus */
  AUTO_FOCUS_DELAY_MS: 100,
  /** Sync indicator display time */
  SYNC_INDICATOR_MS: 600,
} as const;

// Polling intervals (milliseconds)
export const POLLING = {
  /** OAuth device code polling interval */
  OAUTH_POLL_MS: 5000,
  /** Auto-update check interval */
  UPDATE_CHECK_MS: 60000,
} as const;

// Terminal settings
export const TERMINAL = {
  /** Default terminal columns */
  DEFAULT_COLS: 80,
  /** Default terminal rows */
  DEFAULT_ROWS: 24,
  /** WebSocket reconnect delay base (ms) */
  RECONNECT_BASE_MS: 1000,
  /** Maximum reconnect attempts */
  MAX_RECONNECT_ATTEMPTS: 5,
} as const;

// Limits
export const LIMITS = {
  /** Maximum recent launches to display */
  MAX_RECENT_LAUNCHES: 5,
  /** Maximum log lines to retain */
  MAX_LOG_LINES: 1000,
  /** Docker log tail lines */
  DOCKER_LOG_TAIL: '500',
} as const;
