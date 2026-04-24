import { config } from './config.mjs';

/**
 * Paths that are reachable without the gate cookie. Keep this list tight —
 * any new public endpoint has to be added explicitly.
 *
 *   /login         → the password prompt page (self-contained HTML)
 *   /api/login     → POST endpoint that accepts the password and sets the cookie
 *   /api/logout    → POST endpoint that clears the cookie
 *   /api/health    → liveness probe for the host (Railway / Docker healthcheck)
 *   /favicon.ico   → browser requests this before anything else; 404 noise otherwise
 */
const PUBLIC_PATHS = new Set([
  '/login',
  '/api/login',
  '/api/logout',
  '/api/health',
  '/favicon.ico',
]);

/**
 * Express middleware that enforces the shared-password gate.
 *
 * If the signed `rc_gate` cookie is present and valid, the request continues.
 * Otherwise:
 *   - API requests (path starts with /api/) get a 401 JSON response.
 *   - Everything else redirects to /login.
 *
 * Install this AFTER cookie-parser and AFTER the login router is mounted —
 * both need to be reachable before the gate activates.
 */
export function gateMiddleware(req, res, next) {
  if (PUBLIC_PATHS.has(req.path)) return next();

  const hasGate = req.signedCookies && req.signedCookies.rc_gate === 'ok';
  if (hasGate) return next();

  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  // For any other path (the SPA, static assets), send to login. Preserve the
  // original path as ?next= so we can bounce them back after they sign in.
  const next_ = encodeURIComponent(req.originalUrl || '/');
  res.redirect(302, `/login?next=${next_}`);
}

/**
 * Cookie options used when setting/clearing the gate cookie. Centralized so
 * set and clear stay in sync — mismatched options will leave the cookie behind.
 */
export function gateCookieOptions() {
  return {
    signed: true,
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: config.cookieMaxAgeMs,
    path: '/',
  };
}
