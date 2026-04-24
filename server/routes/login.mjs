import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.mjs';
import { gateCookieOptions } from '../auth.mjs';

export const loginRouter = Router();

/**
 * Self-contained HTML for the password prompt. Inline CSS + inline JS so this
 * page doesn't need to load any static assets (which would themselves be
 * gated). Kept deliberately minimal — no framework, no build step.
 *
 * The `next` query param, if present, is where we bounce the user back to
 * after a successful login. We accept only relative paths starting with /
 * to avoid an open redirect.
 */
const LOGIN_HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Reading Companion</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      background: #faf7f2;
      color: #1a1612;
      padding: 1rem;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #171411; color: #ede8e0; }
    }
    .card {
      width: 100%;
      max-width: 360px;
      padding: 2rem;
      border-radius: 14px;
      background: rgba(0,0,0,0.03);
    }
    @media (prefers-color-scheme: dark) {
      .card { background: rgba(255,255,255,0.04); }
    }
    h1 { font-size: 1.15rem; margin: 0 0 0.35rem; font-weight: 600; letter-spacing: -0.01em; }
    p { margin: 0 0 1.25rem; opacity: 0.7; font-size: 0.9rem; }
    form { display: flex; flex-direction: column; gap: 0.6rem; }
    input, button {
      padding: 0.7rem 0.9rem;
      font-size: 1rem;
      border-radius: 8px;
      font-family: inherit;
    }
    input {
      border: 1px solid rgba(0,0,0,0.12);
      background: transparent;
      color: inherit;
    }
    @media (prefers-color-scheme: dark) {
      input { border-color: rgba(255,255,255,0.12); }
    }
    input:focus { outline: 2px solid #8a6d3b; outline-offset: 1px; }
    button {
      border: 0;
      background: #8a6d3b;
      color: #fff;
      cursor: pointer;
      font-weight: 500;
    }
    button:hover { background: #735a31; }
    button:disabled { opacity: 0.6; cursor: default; }
    .error {
      color: #b00;
      font-size: 0.85rem;
      margin-top: 0.4rem;
      min-height: 1.2em;
    }
    @media (prefers-color-scheme: dark) { .error { color: #f87171; } }
  </style>
</head>
<body>
  <div class="card">
    <h1>Reading Companion</h1>
    <p>Enter the shared password to continue.</p>
    <form id="f">
      <input type="password" name="password" placeholder="Password" autofocus required autocomplete="current-password" />
      <button type="submit" id="b">Continue</button>
      <div class="error" id="e"></div>
    </form>
  </div>
  <script>
    (function () {
      var f = document.getElementById('f');
      var e = document.getElementById('e');
      var b = document.getElementById('b');
      f.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        e.textContent = '';
        b.disabled = true;
        try {
          var res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: f.password.value }),
          });
          if (res.ok) {
            // Safe next: only accept a relative path starting with '/'.
            var params = new URLSearchParams(window.location.search);
            var next = params.get('next') || '/';
            if (!next.startsWith('/') || next.startsWith('//')) next = '/';
            window.location.href = next;
            return;
          }
          var body;
          try { body = await res.json(); } catch (_) { body = {}; }
          e.textContent = body.error || 'Wrong password.';
        } catch (_) {
          e.textContent = 'Network error. Try again.';
        } finally {
          b.disabled = false;
        }
      });
    })();
  </script>
</body>
</html>`;

loginRouter.get('/login', (_req, res) => {
  // Don't cache — if the password changes we want the latest page served.
  res.setHeader('Cache-Control', 'no-store');
  res.type('text/html').send(LOGIN_HTML);
});

/**
 * POST /api/login { password: string } → 200 { ok: true } (+ signed cookie)
 *
 * Rejects with 401 on wrong password, 400 on malformed body, 500 if the server
 * has no SHARED_PASSWORD configured. Uses a constant-time compare so the
 * response time doesn't leak password-prefix information.
 */
loginRouter.post('/api/login', (req, res) => {
  const pwd = req.body && typeof req.body.password === 'string' ? req.body.password : '';
  if (pwd.length === 0) {
    res.status(400).json({ error: 'Password is required.' });
    return;
  }
  if (!config.sharedPassword) {
    res.status(500).json({ error: 'Server is not configured.' });
    return;
  }
  const got = Buffer.from(pwd);
  const want = Buffer.from(config.sharedPassword);
  const ok = got.length === want.length && timingSafeEqual(got, want);
  if (!ok) {
    res.status(401).json({ error: 'Wrong password.' });
    return;
  }
  res.cookie('rc_gate', 'ok', gateCookieOptions());
  res.json({ ok: true });
});

/**
 * POST /api/logout → clears the gate cookie. Always 200 even if there was no
 * cookie to begin with, so the client can treat it as idempotent.
 */
loginRouter.post('/api/logout', (_req, res) => {
  const opts = { ...gateCookieOptions(), maxAge: 0 };
  res.clearCookie('rc_gate', opts);
  res.json({ ok: true });
});
