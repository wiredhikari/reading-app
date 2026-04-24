import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

export const config = {
  port: process.env.PORT ? Number(process.env.PORT) : 3001,
  nodeEnv,
  isProduction,

  // Anthropic
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
  maxTokens: process.env.ANTHROPIC_MAX_TOKENS ? Number(process.env.ANTHROPIC_MAX_TOKENS) : 4096,

  // Where to find the built frontend in production.
  // The repository builds to ./dist; resolved to absolute path in staticAssets.mjs.
  distDir: process.env.DIST_DIR || 'dist',

  // CORS — only used when the frontend is served from a different origin.
  // Comma-separated list, e.g. "https://app.example.com,https://example.com"
  // Leave unset to disable.
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : null,

  // When true, trust X-Forwarded-* headers from a reverse proxy (Cloudflare, etc.)
  trustProxy: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',

  // Request body limit for all JSON endpoints. Chat payloads are small; keep this tight.
  bodyLimit: process.env.BODY_LIMIT || '256kb',

  // Rate limiting on /api/chat. Per-IP, fixed window.
  // Defaults to enabled in production, off in development (override with RATE_LIMIT_ENABLE).
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLE
      ? process.env.RATE_LIMIT_ENABLE === '1' || process.env.RATE_LIMIT_ENABLE === 'true'
      : isProduction,
    windowMs: process.env.RATE_LIMIT_WINDOW_MS ? Number(process.env.RATE_LIMIT_WINDOW_MS) : 10 * 60 * 1000,
    max: process.env.RATE_LIMIT_MAX ? Number(process.env.RATE_LIMIT_MAX) : 30,
  },

  // Chat payload caps. Guards against accidental or malicious oversized payloads
  // before anything is forwarded to the Anthropic SDK.
  chatLimits: {
    maxSystemChars: process.env.CHAT_MAX_SYSTEM_CHARS
      ? Number(process.env.CHAT_MAX_SYSTEM_CHARS)
      : 32_000,
    maxMessages: process.env.CHAT_MAX_MESSAGES ? Number(process.env.CHAT_MAX_MESSAGES) : 100,
    maxMessageChars: process.env.CHAT_MAX_MESSAGE_CHARS
      ? Number(process.env.CHAT_MAX_MESSAGE_CHARS)
      : 32_000,
  },
};

export function warnIfMissingKey() {
  if (!config.anthropicApiKey) {
    console.error('\n[reading-companion] ANTHROPIC_API_KEY is not set.');
    console.error('  Copy .env.example to .env and fill in your key from https://console.anthropic.com/\n');
  }
}
