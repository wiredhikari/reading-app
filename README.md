# Reading Companion

A two-pane web app for reading demanding texts — philosophy, scientific papers, classic literature, legal documents — with an AI companion that knows when to be quiet.

- **Left pane:** PDF or EPUB reader with text selection.
- **Right pane:** a chat that already knows where you are in the book and what you're looking at.
- **Modes:** the companion shifts between lookup, deep comprehension, Socratic engagement, and retention based on how you write.
- **Privacy:** your file never leaves your machine. Only a small text excerpt around your current location is sent to the model.

The whole project lives in one folder on your computer:

```
~/.../reading-app/
```

(Wherever you cloned or unzipped it. This README assumes that folder is your working directory.)

---

## Quickstart

Requires **Node 20+**.

```bash
npm install
cp .env.example .env
# open .env and paste your key from https://console.anthropic.com/
npm run dev
```

Open <http://localhost:5173>. Drop a PDF or EPUB into the upload area and start reading.

The dev script runs two processes side by side:

| Process | URL | What it does |
|---|---|---|
| `dev:web` (Vite) | `http://localhost:5173` | Frontend with HMR. Proxies `/api/*` to the backend. |
| `dev:api` (Node) | `http://localhost:3001` | Express server that holds the Anthropic key and streams responses. |

The API key never touches the browser.

---

## How it works (data flow)

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│  Browser        │     │  Express server  │     │  Anthropic API │
│  (Vite/React)   │ ──► │  /api/chat       │ ──► │  Messages.stream│
│                 │ ◄── │  text/plain      │ ◄── │  (SSE → text)  │
└─────────────────┘     └──────────────────┘     └────────────────┘
```

1. You drop a file into `FileDrop`. It's read entirely in the browser as an `ArrayBuffer` — never uploaded.
2. `PdfReader` (pdf.js) or `EpubReader` (epub.js) renders the file. As you scroll/turn pages, they emit a `location` and an excerpt of `visibleText` back up to `App.tsx`.
3. When you send a chat message, `useChat` builds a payload:
   - the **system prompt** from `src/lib/systemPrompt.ts`
   - a **reading context block** (built by `buildContextBlock`): title, author, current location, and either the visible text or the passage you selected (capped to ~6k chars)
   - the **conversation history**
4. `POST /api/chat` on the Express server forwards that to `anthropic.messages.stream(...)`.
5. The server pipes deltas back as `text/plain` chunks. The browser reads them with `ReadableStream.getReader()` and renders incrementally with `react-markdown`.
6. **Stop** in the UI aborts both the fetch and the upstream Anthropic request.

The companion's behavior — its four modes, intellectual standards, what to avoid — lives entirely in `src/lib/systemPrompt.ts`. Edit that file to change how it talks.

---

## File layout

Every file, with what it does:

```
reading-app/
├── index.html                          ← HTML shell. PWA meta, font preconnects.
├── package.json                        ← Scripts and dependencies.
├── vite.config.ts                      ← Vite config + /api proxy → :3001.
├── tsconfig*.json                      ← TypeScript project refs.
├── Dockerfile                          ← Multi-stage Alpine build for hosting.
├── .dockerignore
├── .env.example                        ← Template — copy to .env, fill key.
│
├── public/
│   ├── manifest.webmanifest            ← PWA manifest (iOS/Android install).
│   └── icons/
│       ├── icon.svg                    ← Vector source.
│       ├── icon-180.png                ← apple-touch-icon
│       ├── icon-192.png                ← PWA standard
│       ├── icon-512.png                ← PWA standard
│       └── icon-512-maskable.png       ← Android adaptive
│
├── src/
│   ├── main.tsx                        ← React entry. Boots theme before paint.
│   ├── App.tsx                         ← Two-pane shell. Holds reader/chat state.
│   ├── index.css                       ← Tailwind v4 + design tokens (light+dark).
│   ├── vite-env.d.ts                   ← Vite client types.
│   │
│   ├── components/
│   │   ├── TopBar.tsx                  ← Glassy sticky header. Mobile tabs.
│   │   ├── ThemeToggle.tsx             ← Sun/moon button.
│   │   ├── FileDrop.tsx                ← Upload screen with hero copy.
│   │   ├── PdfReader.tsx               ← pdf.js renderer + selection.
│   │   ├── EpubReader.tsx              ← epub.js renderer + theme switch.
│   │   ├── SplitPane.tsx               ← Resizable divider (desktop).
│   │   ├── ChatPanel.tsx               ← Chat UI shell.
│   │   ├── ChatMessage.tsx             ← Markdown-rendered messages.
│   │   └── ChatInput.tsx               ← Auto-grow textarea + selection chip.
│   │
│   └── lib/
│       ├── systemPrompt.ts             ← The companion's instructions + ReadingContext.
│       ├── api.ts                      ← Streaming fetch wrapper for /api/chat.
│       ├── useChat.ts                  ← Chat state + streaming hook.
│       ├── theme.ts                    ← useTheme hook (light/dark/auto).
│       ├── useMediaQuery.ts            ← Reactive media query hook.
│       └── constants.ts                ← Breakpoints, char caps.
│
└── server/
    ├── index.mjs                       ← Entry. Process guards + graceful shutdown.
    ├── app.mjs                         ← createApp() Express factory.
    ├── config.mjs                      ← Centralized env config.
    ├── anthropicClient.mjs             ← Lazy Anthropic client.
    ├── staticAssets.mjs                ← Serves dist/ in production with SPA fallback.
    └── routes/
        ├── health.mjs                  ← GET /api/health (liveness probe).
        └── chat.mjs                    ← POST /api/chat (streaming proxy).
```

---

## Scripts

```bash
npm run dev         # Vite + Express, two processes, HMR
npm run clean       # rm -rf dist
npm run build       # clean → tsc -b → vite build → dist/
npm run start       # NODE_ENV=production node server/index.mjs (serves dist/ + API)
npm run host        # build + start, single port (3001)
npm run typecheck   # tsc -b --noEmit
npm run preview     # vite preview (built frontend, no API)
```

---

## Environment variables

Defined in `.env` (copy from `.env.example`).

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | From <https://console.anthropic.com/> |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-4-5` | Any model your key has access to. |
| `ANTHROPIC_MAX_TOKENS` | no | `4096` | Per response. |
| `PORT` | no | `3001` | Express port. |
| `DIST_DIR` | no | `dist` | Where the built frontend lives. |
| `CORS_ORIGINS` | no | unset | Comma-separated list. Only needed if frontend is on a different origin. |
| `TRUST_PROXY` | no | `0` | Set `1` behind Cloudflare/nginx/etc. Required for correct rate-limit IPs. |
| `BODY_LIMIT` | no | `256kb` | JSON body limit for all endpoints. |
| `RATE_LIMIT_ENABLE` | no | `1` in prod, `0` in dev | Per-IP fixed-window rate limit on `/api/chat`. |
| `RATE_LIMIT_WINDOW_MS` | no | `600000` | Window in ms (default 10 min). |
| `RATE_LIMIT_MAX` | no | `30` | Max requests per window per IP. |
| `CHAT_MAX_SYSTEM_CHARS` | no | `32000` | Rejects oversized `system` prompts. |
| `CHAT_MAX_MESSAGES` | no | `100` | Rejects conversations with too many turns. |
| `CHAT_MAX_MESSAGE_CHARS` | no | `32000` | Rejects any single message above this size. |

> **Production note:** when `NODE_ENV=production`, server errors in `/api/chat` are genericized in the response ("Upstream error. Please try again shortly.") and full detail is logged server-side only.

### Security posture

The server applies [`helmet`](https://helmetjs.github.io/) defaults (nosniff, frameguard, referrer-policy, and friends). Its default CSP is disabled because the reader relies on pdf.js workers, epub.js iframes with `blob:` URLs, and Google Fonts — a strict CSP would break them. Tighten CSP in `server/app.mjs` if you can verify the full set of origins your reader needs.

---

## Customizing the companion

The system prompt is the soul of the app. It's a single string in `src/lib/systemPrompt.ts` — edit it freely:

- **Tone and length:** edit the "COMMUNICATION STYLE" and "WHAT TO AVOID" sections.
- **Modes:** the four modes (Frictionless, Deep, Socratic, Retention) are described under "THE FOUR MODES". Add, remove, or rewrite them.
- **What context the model gets:** `buildContextBlock(ctx)` in the same file controls the runtime context. To attach more (e.g. a chapter outline), extend `ReadingContext` in `App.tsx` and add it here.

The character cap (`MAX_CONTEXT_TEXT_CHARS`) lives in `src/lib/constants.ts`.

---

## Theming

Two themes (light cream / dark warm ink) share variable names; only values change. Defined in `src/index.css` under `:root` and `[data-theme="dark"]`. The `useTheme` hook in `src/lib/theme.ts` writes a `data-theme` attribute on `<html>`, persists the choice to `localStorage`, and updates the `<meta name="theme-color">` so iOS status bars match.

To rebrand:
- Edit the CSS custom properties in `src/index.css` (`--color-bg`, `--color-fg`, `--color-accent`, `--color-paper`, `--color-shadow-*`).
- Replace the icons in `public/icons/` and re-export from the SVG.

---

## Production hosting

A single Node process serves both the API and the built frontend:

```bash
npm run host          # builds, then starts
# or, with a process manager:
npm run build
NODE_ENV=production node server/index.mjs
```

`server/staticAssets.mjs` mounts `dist/` and adds an SPA fallback for non-`/api` routes. Hashed assets get a 1-year cache; everything else, 1 hour.

### Docker

```bash
docker build -t reading-companion .
docker run -p 3001:3001 --env-file .env reading-companion
```

The image is multi-stage (Node 20 Alpine), drops devDependencies, runs as the non-root `node` user, and includes a healthcheck that hits `/api/health`.

### Behind a reverse proxy

Set `TRUST_PROXY=1` and (if the frontend is on a different origin) `CORS_ORIGINS=https://your-host`. The `/api/chat` endpoint streams `text/plain` and sets `X-Accel-Buffering: no` so nginx will not buffer responses.

---

## Install on iPhone (PWA)

The app is a Progressive Web App. To install it as a standalone icon:

1. Host it (or expose your dev server over your LAN — see below).
2. Open the URL in **Safari** on your iPhone.
3. Tap the Share button → **Add to Home Screen** → Add.

It launches full-screen with no Safari chrome, the warm ink theme color in the status bar, and the app icon you see in `public/icons/`.

### Run on iPhone over LAN (no hosting)

Find your Mac/PC's local IP (e.g. `192.168.1.42`), then:

```bash
npm run host           # production build, single port
# or for dev:
npm run dev            # Vite is already bound to 0.0.0.0 via --host
```

On your phone, visit `http://192.168.1.42:3001` (production) or `http://192.168.1.42:5173` (dev) — both must be on the same Wi-Fi.

> **Note:** iOS Safari restricts some PWA features over plain HTTP. For the full installable experience, host it behind HTTPS (a tunnel like `cloudflared tunnel` or `tailscale serve` works).

---

## Troubleshooting

**`ANTHROPIC_API_KEY is not set`**
Copy `.env.example` → `.env` and paste a key from <https://console.anthropic.com/>. Restart `npm run dev`.

**`Credit balance too low`**
Add credit at <https://console.anthropic.com/settings/billing>.

**The chat panel hangs / no response**
Check the API server logs in your terminal. The `/api/chat` route logs upstream errors. Hit <http://localhost:3001/api/health> to confirm the server sees your key.

**PDF text selection isn't being captured**
Some PDFs (scanned books) have no text layer. The companion will still get the location, but `visibleText` will be empty. Use the EPUB if available.

**EPUB looks unstyled in dark mode**
The EPUB renderer registers a dark theme via epub.js — if a publisher's CSS overrides it, the override wins. This is a limitation of `epubjs`.

**Mobile keyboard hides the input**
The layout uses `100dvh` and safe-area insets, which should handle iOS. If you're on an older iOS, update Safari.

---

## What's not in this app (by design)

- No accounts, no sync, no server-side storage of your reading or chats.
- No analytics or tracking.
- No "summarize this for me" button. The companion will summarize if you ask, but it isn't pushed at you.
- No assistant emoji, no "great question", no performance of helpfulness.

---

## License

For your own use. Not affiliated with Anthropic.
