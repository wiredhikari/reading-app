import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FileDrop from './components/FileDrop';
import PdfReader from './components/PdfReader';
import EpubReader from './components/EpubReader';
import ChatPanel from './components/ChatPanel';
import SplitPane from './components/SplitPane';
import TopBar, { type MobileTab } from './components/TopBar';
import UsernamePicker from './components/UsernamePicker';
import LibraryView from './components/LibraryView';
import { useMediaQuery } from './lib/useMediaQuery';
import { MOBILE_MEDIA_QUERY } from './lib/constants';
import type { ReadingContext } from './lib/systemPrompt';
import { sha256Hex } from './lib/hashFile';
import {
  getMe,
  upsertBook,
  saveProgress,
  logoutUser,
  uploadToLibrary,
} from './lib/persistence';

interface LoadedFile {
  name: string;
  format: 'pdf' | 'epub';
  buffer: ArrayBuffer;
}

type MeState =
  | { kind: 'loading' }
  | { kind: 'no-persistence' }
  | { kind: 'needs-username' }
  | {
      kind: 'signed-in';
      user: { id: number; username: string };
      libraryEnabled: boolean;
    };

// How often we save reading progress while the user is actively paging.
// Too short = churn; too long = losing pages on tab close. 1.5s is a good
// middle ground — `beforeunload` flush below catches anything missed.
const PROGRESS_SAVE_DEBOUNCE_MS = 1500;

export default function App() {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [location, setLocation] = useState<string>('');
  const [visibleText, setVisibleText] = useState<string>('');
  const [meta, setMeta] = useState<{ title?: string; author?: string }>({});
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  // Mobile uses a tab toggle (reader | chat) in the TopBar instead of a split.
  // Keeps the active surface full-height — better for iPhone-sized screens.
  const [mobileTab, setMobileTab] = useState<MobileTab>('reader');
  const [unreadChat, setUnreadChat] = useState(false);
  // Focus mode: hide TopBar + reader toolbar so the text is the whole page.
  // A small pill in the corner brings chrome back. Available when a file is
  // loaded, on desktop only (on mobile the tab toggle is already the chrome).
  const [focus, setFocus] = useState(false);

  // Mobile-only: Kindle-style auto-hiding TopBar while reading. Defaults to
  // shown when a file first loads or the user switches tabs, then auto-hides
  // after a short delay; tapping the top edge brings it back.
  const [mobileChromeShown, setMobileChromeShown] = useState(true);

  // Stage 2 persistence. Initialized by /api/me on mount — three outcomes:
  //   - loading         (briefly, before /me returns)
  //   - no-persistence  (DB not configured on the server; Stage 1 behavior)
  //   - needs-username  (DB configured but user hasn't picked a handle)
  //   - signed-in       (user has a numeric id; can save books and progress)
  const [meState, setMeState] = useState<MeState>({ kind: 'loading' });

  // Per-file persistence state. `bookId` is set once a file is upserted to
  // the server; `initialRestoreKey` is whatever prior location came back,
  // passed through to the reader on first render.
  const [bookId, setBookId] = useState<number | null>(null);
  const [initialRestoreKey, setInitialRestoreKey] = useState<string | null>(null);

  // Most recent restore key the reader has emitted. A debounced effect
  // syncs this to the server. Tracked in a ref so the beforeunload flush
  // doesn't depend on stale closure values.
  const latestKeyRef = useRef<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);

  // Bootstrap: ask the server who we are.
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((res) => {
        if (cancelled) return;
        if (!res.persistence) setMeState({ kind: 'no-persistence' });
        else if (!res.user) setMeState({ kind: 'needs-username' });
        else
          setMeState({
            kind: 'signed-in',
            user: res.user,
            libraryEnabled: !!res.library,
          });
      })
      .catch((err) => {
        if (cancelled) return;
        // /api/me shouldn't fail unless the gate cookie has expired — in
        // which case the gate middleware has already redirected to /login.
        // Any other failure: degrade gracefully to Stage-1 behavior.
        console.warn('[persistence] /api/me failed:', err);
        setMeState({ kind: 'no-persistence' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // When the chat tab becomes active, clear the unread dot.
  useEffect(() => {
    if (mobileTab === 'chat') setUnreadChat(false);
  }, [mobileTab]);

  const handleFile = useCallback(
    async (f: File, buffer: ArrayBuffer) => {
      const lower = f.name.toLowerCase();
      let format: 'pdf' | 'epub' | null = null;
      if (lower.endsWith('.pdf') || f.type === 'application/pdf') format = 'pdf';
      else if (lower.endsWith('.epub') || f.type === 'application/epub+zip') format = 'epub';
      if (!format) {
        alert('Unsupported file. Please load a PDF or EPUB.');
        return;
      }
      setFile({ name: f.name, format, buffer });
      setLocation('');
      setVisibleText('');
      setMeta({});
      setPendingSelection(null);
      setMobileTab('reader');
      setUnreadChat(false);
      setFocus(false);
      // Reset per-file persistence state. Upsert below may rehydrate them.
      setBookId(null);
      setInitialRestoreKey(null);
      latestKeyRef.current = null;
      setPendingKey(null);

      // Upsert the book to the server if persistence is on. If it fails,
      // we just continue in local-only mode — losing persistence is better
      // than blocking the read.
      if (meState.kind === 'signed-in') {
        try {
          const fileHash = await sha256Hex(buffer);
          const { bookId: id, lastLocation } = await upsertBook({
            fileHash,
            fileName: f.name,
            format,
          });
          setBookId(id);
          setInitialRestoreKey(lastLocation);
        } catch (err) {
          console.warn('[persistence] upsertBook failed:', err);
        }
        // Kindle-style: every book the user opens also gets pushed to the
        // shared library so it's reachable from any device on the next visit.
        // Background and best-effort — losing the upload doesn't block the
        // read, and the library endpoint is idempotent on hash so opening
        // an already-uploaded book is a no-op there.
        if (meState.libraryEnabled) {
          uploadToLibrary(f).catch((err) => {
            console.warn('[library] auto-upload failed:', err);
          });
        }
      }
    },
    [meState],
  );

  // Open a book from the shared library. We don't have a real `File` object,
  // just bytes + name + format — synthesize something shaped like a File so
  // the existing handleFile flow can treat it identically.
  const openFromLibrary = useCallback(
    (args: { name: string; format: 'pdf' | 'epub'; buffer: ArrayBuffer }) => {
      const fakeFile = new File([args.buffer], args.name, {
        type: args.format === 'pdf' ? 'application/pdf' : 'application/epub+zip',
      });
      void handleFile(fakeFile, args.buffer);
    },
    [handleFile],
  );

  // Esc exits focus mode — a common reflex when something goes fullscreen.
  useEffect(() => {
    if (!focus) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFocus(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus]);

  // Re-show the TopBar whenever the file changes or the user switches mobile
  // tabs — those are moments where they almost certainly want controls.
  useEffect(() => {
    setMobileChromeShown(true);
  }, [file?.name, mobileTab]);

  // Auto-hide the TopBar a few seconds after it appears on the mobile reader.
  // We don't auto-hide on chat (the input there is the focus) or on desktop.
  useEffect(() => {
    if (!isMobile || !file || mobileTab !== 'reader' || !mobileChromeShown) return;
    const timer = window.setTimeout(() => setMobileChromeShown(false), 3500);
    return () => window.clearTimeout(timer);
  }, [isMobile, file, mobileTab, mobileChromeShown]);

  const onPdfLocation = useCallback((loc: string, text: string) => {
    setLocation(loc);
    setVisibleText(text);
  }, []);

  const onEpubLocation = useCallback(
    (loc: string, text: string, m: { title?: string; author?: string }) => {
      setLocation(loc);
      if (text) setVisibleText(text);
      if (m.title || m.author) setMeta(m);
    },
    [],
  );

  const onSelection = useCallback(
    (text: string) => {
      setPendingSelection(text);
      // On mobile, jump to the chat tab so the attached chip is immediately visible.
      if (isMobile) setMobileTab('chat');
    },
    [isMobile],
  );

  // Fired on every assistant-stream chunk. When the user is on the reader tab,
  // this means new content has arrived they haven't seen — show a small dot.
  const onAssistantTick = useCallback(() => {
    if (isMobile && mobileTab !== 'chat') setUnreadChat(true);
  }, [isMobile, mobileTab]);

  // Readers emit this on every position change — we keep only the latest
  // and a debounced effect below syncs it to the server.
  const onRestoreKey = useCallback((key: string) => {
    latestKeyRef.current = key;
    setPendingKey(key);
  }, []);

  // Debounced progress save. We intentionally depend on pendingKey, not on
  // bookId, so we don't refire if the bookId materializes later.
  useEffect(() => {
    if (!bookId || !pendingKey) return;
    const handle = window.setTimeout(() => {
      saveProgress(bookId, pendingKey).catch((err) => {
        // Don't surface to the user — progress save is best-effort.
        console.warn('[persistence] saveProgress failed:', err);
      });
    }, PROGRESS_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [bookId, pendingKey]);

  // Best-effort flush on tab close. `keepalive` lets fetch continue past
  // unload; sendBeacon would be simpler but is POST-only, and our endpoint
  // is PUT. Size is tiny (a single JSON string) so the keepalive 64KB cap
  // is comfortably clear.
  useEffect(() => {
    if (!bookId) return;
    function flush() {
      const key = latestKeyRef.current;
      if (!key || !bookId) return;
      try {
        fetch(`/api/books/${bookId}/progress`, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location: key }),
          keepalive: true,
        }).catch(() => {
          /* best-effort */
        });
      } catch {
        // ignore
      }
    }
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [bookId]);

  const readingContext: ReadingContext = useMemo(() => {
    if (!file) return { format: 'none' };
    return {
      format: file.format,
      bookTitle: meta.title ?? file.name,
      bookAuthor: meta.author,
      location: location || undefined,
      visibleText: visibleText || undefined,
    };
  }, [file, meta, location, visibleText]);

  const showLibrary =
    meState.kind === 'signed-in' && meState.libraryEnabled;

  // Focus mode is offered whenever a file is loaded — on mobile it hides the
  // TopBar (including tab toggle) and shows the reader full-bleed; the
  // ExitFocusPill is how you come back.
  const canFocus = !!file;
  const chromeHidden = focus && canFocus;
  // Mobile auto-hide: reader tab on mobile collapses the TopBar after a beat,
  // and a thin tap zone at the top reveals it. This is the "Kindle subtle"
  // mode the user asked for. Distinct from explicit focus mode (which also
  // hides reader-internal chrome).
  const mobileChromeAutoHidden =
    isMobile && !!file && mobileTab === 'reader' && !mobileChromeShown;
  // TopBar is hidden either by explicit focus or by mobile auto-hide.
  const topBarHidden = chromeHidden || mobileChromeAutoHidden;
  // Mobile tab toggle is suppressed in focus mode — the reader has the screen.
  const showMobileTabs = isMobile && !!file && !chromeHidden;
  // Reader's internal toolbar disappears in either subtle mode.
  const hideReaderToolbar = chromeHidden || mobileChromeAutoHidden;

  const reader = !file ? (
    // Landing screen: file drop first, then the user's own books (with
    // progress), then the shared library. Outer div owns the scroll so all
    // sections are reachable on short viewports.
    <div className="h-full w-full overflow-y-auto">
      <FileDrop onFile={handleFile} />
      {showLibrary && (
        <LibraryView
          currentUserId={meState.kind === 'signed-in' ? meState.user.id : undefined}
          onOpen={openFromLibrary}
        />
      )}
    </div>
  ) : file.format === 'pdf' ? (
    <PdfReader
      fileBuffer={file.buffer}
      onLocationChange={onPdfLocation}
      onSelection={onSelection}
      initialRestoreKey={initialRestoreKey}
      onRestoreKey={onRestoreKey}
      hideToolbar={hideReaderToolbar}
    />
  ) : (
    <EpubReader
      fileBuffer={file.buffer}
      onLocationChange={onEpubLocation}
      onSelection={onSelection}
      initialRestoreKey={initialRestoreKey}
      onRestoreKey={onRestoreKey}
      hideToolbar={hideReaderToolbar}
    />
  );

  const chat = (
    <ChatPanel
      readingContext={readingContext}
      pendingSelection={pendingSelection}
      onSelectionUsed={() => setPendingSelection(null)}
      onAssistantTick={onAssistantTick}
      isMobile={isMobile}
      bookId={bookId}
    />
  );

  async function handleSignOut() {
    // Clear the signed rc_user cookie server-side, then drop local
    // book/progress state and return to the username picker. We keep the
    // gate cookie intact — signing out of your handle isn't the same as
    // leaving the site.
    try {
      await logoutUser();
    } catch (err) {
      console.warn('[auth] sign-out failed:', err);
    }
    setFile(null);
    setBookId(null);
    setInitialRestoreKey(null);
    latestKeyRef.current = null;
    setPendingKey(null);
    setMeState({ kind: 'needs-username' });
  }

  // Pre-app states: brief loading flash while /api/me is in flight, then
  // the username picker if the DB's configured and we don't have a handle.
  if (meState.kind === 'loading') {
    return (
      <div
        className="flex h-[100dvh] w-screen items-center justify-center"
        style={{
          paddingLeft: 'var(--safe-left)',
          paddingRight: 'var(--safe-right)',
        }}
      >
        <div className="text-sm text-[var(--color-muted)]">Loading…</div>
      </div>
    );
  }
  if (meState.kind === 'needs-username') {
    return (
      <div
        className="flex h-[100dvh] w-screen flex-col"
        style={{
          paddingLeft: 'var(--safe-left)',
          paddingRight: 'var(--safe-right)',
        }}
      >
        <TopBar />
        <main className="flex-1 overflow-hidden">
          <UsernamePicker
            onPicked={(user) =>
              // We don't know the library flag here — /api/me was our source
              // of truth and it's already returned. Re-query to keep the
              // state exact. This is cheap and runs once on sign-in.
              getMe()
                .then((res) =>
                  setMeState({
                    kind: 'signed-in',
                    user,
                    libraryEnabled: !!res.library,
                  }),
                )
                .catch(() =>
                  setMeState({ kind: 'signed-in', user, libraryEnabled: false }),
                )
            }
          />
        </main>
      </div>
    );
  }

  return (
    <div
      className="flex h-[100dvh] w-screen flex-col"
      style={{
        paddingLeft: 'var(--safe-left)',
        paddingRight: 'var(--safe-right)',
      }}
    >
      {!topBarHidden && (
        <TopBar
          fileName={file?.name}
          onClose={file ? () => setFile(null) : undefined}
          showTabs={showMobileTabs}
          mobileTab={mobileTab}
          onMobileTab={setMobileTab}
          unreadChat={unreadChat}
          onEnterFocus={canFocus ? () => setFocus(true) : undefined}
          user={meState.kind === 'signed-in' ? meState.user : undefined}
          onSignOut={meState.kind === 'signed-in' ? handleSignOut : undefined}
        />
      )}
      {chromeHidden && <ExitFocusPill onClick={() => setFocus(false)} />}
      {/* Mobile reveal-tap zone: invisible strip across the very top of the
          screen that brings the TopBar back when it's auto-hidden. Sits above
          the reader so a tap at the top fires here, not on a swipe handler. */}
      {mobileChromeAutoHidden && (
        <button
          type="button"
          onClick={() => setMobileChromeShown(true)}
          aria-label="Show toolbar"
          className="fixed inset-x-0 top-0 z-40"
          style={{
            height: 'calc(2.5rem + var(--safe-top))',
            background: 'transparent',
          }}
        />
      )}
      <main className="flex-1 overflow-hidden">
        {chromeHidden ? (
          // Focus mode (desktop + mobile): reader fills the whole page.
          // Chat is unmounted here — on re-entry the tab layout is restored;
          // chat history is already persisted server-side, so nothing is lost.
          <div
            className="h-full w-full"
            style={{ paddingBottom: isMobile ? 'var(--safe-bottom)' : undefined }}
          >
            {reader}
          </div>
        ) : isMobile ? (
          !file ? (
            // Landing screen: no chat pane below, so we need to respect the
            // iOS home indicator ourselves. The reader pane takes care of its
            // own bottom when a file is loaded (ChatInput has safe-bottom).
            <div
              className="h-full w-full"
              style={{ paddingBottom: 'var(--safe-bottom)' }}
            >
              {reader}
            </div>
          ) : (
            // Tab-based mobile layout. The inactive pane stays mounted (hidden
            // via CSS) so state — scroll position, chat input, stream — is
            // preserved when you switch tabs.
            <div className="relative h-full w-full">
              <div
                className={`absolute inset-0 ${mobileTab === 'reader' ? '' : 'hidden'}`}
                aria-hidden={mobileTab !== 'reader'}
                // Reader doesn't have a bottom input, so respect the home indicator here.
                style={{ paddingBottom: 'var(--safe-bottom)' }}
              >
                {reader}
              </div>
              <div
                className={`absolute inset-0 ${mobileTab === 'chat' ? '' : 'hidden'}`}
                aria-hidden={mobileTab !== 'chat'}
              >
                {chat}
              </div>
            </div>
          )
        ) : (
          <SplitPane left={reader} right={chat} />
        )}
      </main>
    </div>
  );
}

function ExitFocusPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Exit focus mode (Esc)"
      aria-label="Exit focus mode"
      className="fixed right-3 top-3 z-40 grid h-9 w-9 place-items-center rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)]/85 text-[var(--color-muted)] backdrop-blur-md transition-colors hover:text-[var(--color-ink)]"
      style={{
        top: 'calc(0.75rem + var(--safe-top))',
        right: 'calc(0.75rem + var(--safe-right))',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 4H5a1 1 0 0 0-1 1v4" />
        <path d="M15 4h4a1 1 0 0 1 1 1v4" />
        <path d="M9 20H5a1 1 0 0 1-1-1v-4" />
        <path d="M15 20h4a1 1 0 0 0 1-1v-4" />
      </svg>
    </button>
  );
}
