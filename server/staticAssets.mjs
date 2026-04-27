import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { config } from './config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '..', config.distDir);

/**
 * Mounts static asset serving for production.
 *
 * Serves files from the built `dist/` directory and falls back to index.html
 * for unknown routes (so deep links work). API requests are NOT handled here —
 * register API routers BEFORE calling this.
 */
export function mountStaticAssets(app) {
  if (!fs.existsSync(distPath)) {
    console.warn(
      `[stoa] dist directory not found at ${distPath}. Run \`npm run build\` first.`,
    );
    return;
  }

  // Static files: hashed assets get aggressive caching, everything else short-lived.
  app.use(
    express.static(distPath, {
      index: false,
      maxAge: '1h',
      setHeaders(res, filePath) {
        if (/\.[a-f0-9]{8,}\./.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  // SPA fallback: anything not matched above and not under /api returns index.html.
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  console.log(`[stoa] serving static frontend from ${distPath}`);
}
