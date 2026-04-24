import { Router } from 'express';
import { config } from '../config.mjs';

export const healthRouter = Router();

/**
 * Public liveness probe. Kept minimal so it doesn't leak server config.
 * Returns 503 if the API key is missing so a deployment without secrets
 * fails its healthcheck instead of silently returning broken chat.
 */
healthRouter.get('/health', (_req, res) => {
  if (!config.anthropicApiKey) {
    res.status(503).json({ ok: false });
    return;
  }
  res.json({ ok: true });
});
