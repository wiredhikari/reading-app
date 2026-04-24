import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.mjs';
import { healthRouter } from './routes/health.mjs';
import { chatRouter } from './routes/chat.mjs';
import { mountStaticAssets } from './staticAssets.mjs';

/**
 * Build the Express app. Pure function — no side effects on import.
 *
 * Order matters:
 *   1. trust proxy
 *   2. security headers (helmet)
 *   3. access logging
 *   4. CORS
 *   5. JSON body parser (with a small limit)
 *   6. rate limiter on /api/chat
 *   7. API routes (so they win over the SPA catch-all)
 *   8. Static asset serving (production only — includes SPA fallback)
 */
export function createApp() {
  const app = express();

  if (config.trustProxy) app.set('trust proxy', true);

  // Security headers. We disable the default CSP because this app uses
  // pdf.js workers, epub.js iframes with blob: URLs, inline styles from
  // Tailwind, and Google Fonts — a strict CSP would break the reader.
  // Other helmet defaults (nosniff, frameguard, referrer-policy, etc.) stay on.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Minimal access log — method, path, status, ms. Skips health to keep logs clean.
  app.use((req, res, next) => {
    if (req.path === '/api/health') return next();
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      console.log(
        `[reading-companion] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`,
      );
    });
    next();
  });

  // Tiny CORS implementation — only active when CORS_ORIGINS is set.
  if (config.corsOrigins) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && config.corsOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      }
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      next();
    });
  }

  app.use(express.json({ limit: config.bodyLimit }));

  // Rate limit /api/chat to protect the API key from abuse.
  if (config.rateLimit.enabled) {
    const chatLimiter = rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many requests. Slow down and try again shortly.' },
    });
    app.use('/api/chat', chatLimiter);
  }

  // API
  app.use('/api', healthRouter);
  app.use('/api', chatRouter);

  // Static frontend (production)
  if (config.isProduction) mountStaticAssets(app);

  return app;
}
