// Thin fetch wrappers for the Stage 2 persistence API. Keeps the JSON shapes
// in one place so components don't hand-roll `fetch` calls.
//
// All endpoints live under the gate cookie, so these requests require the
// user to be logged in. The `persistence` field on /api/me tells us whether
// the DB is even configured — when it isn't, callers should skip everything
// else here and just use local-only mode.

export interface MeResponse {
  persistence: boolean;
  library: boolean;
  user: { id: number; username: string } | null;
}

export interface BookUpsertResponse {
  bookId: number;
  lastLocation: string | null;
}

export interface LibraryBook {
  id: number;
  file_hash: string;
  file_name: string;
  title: string | null;
  author: string | null;
  format: 'pdf' | 'epub';
  last_opened_at: string;
  last_location: string | null;
  /** When set, the book content is available on the server (Stage-4 library). */
  library_id: number | null;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    let msg = body;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error) msg = parsed.error;
    } catch {
      // raw text
    }
    throw new Error(`${res.status}: ${msg || res.statusText}`);
  }
  // 204 No Content — nothing to parse.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function getMe(): Promise<MeResponse> {
  const res = await fetch('/api/me', { credentials: 'same-origin' });
  return handle<MeResponse>(res);
}

export async function logoutUser(): Promise<void> {
  const res = await fetch('/api/logout-user', {
    method: 'POST',
    credentials: 'same-origin',
  });
  await handle<void>(res);
}

export async function postUsername(username: string): Promise<{ user: { id: number; username: string } }> {
  const res = await fetch('/api/username', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  return handle(res);
}

export async function upsertBook(input: {
  fileHash: string;
  fileName: string;
  format: 'pdf' | 'epub';
  title?: string;
  author?: string;
}): Promise<BookUpsertResponse> {
  const res = await fetch('/api/books', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handle<BookUpsertResponse>(res);
}

export async function saveProgress(bookId: number, location: string): Promise<void> {
  const res = await fetch(`/api/books/${bookId}/progress`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location }),
  });
  await handle<void>(res);
}

export async function listBooks(): Promise<{ books: LibraryBook[] }> {
  const res = await fetch('/api/books', { credentials: 'same-origin' });
  return handle(res);
}

// ---- Chat history ---------------------------------------------------------

export interface StoredChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export async function getChatHistory(bookId: number): Promise<StoredChatMessage[]> {
  const res = await fetch(`/api/books/${bookId}/chat`, { credentials: 'same-origin' });
  const { messages } = await handle<{ messages: StoredChatMessage[] }>(res);
  return messages;
}

export async function postChatMessage(
  bookId: number,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  const res = await fetch(`/api/books/${bookId}/chat-message`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, content }),
  });
  await handle<void>(res);
}

export async function clearChatHistory(bookId: number): Promise<void> {
  const res = await fetch(`/api/books/${bookId}/chat`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  await handle<void>(res);
}

// ---- Library (Stage 4) ----------------------------------------------------

export interface LibraryFile {
  id: number;
  file_hash: string;
  file_name: string;
  format: 'pdf' | 'epub';
  size_bytes: number;
  title: string | null;
  author: string | null;
  uploaded_at: string;
  uploaded_by: number | null;
  uploaded_by_username: string | null;
}

export async function listLibrary(): Promise<LibraryFile[]> {
  const res = await fetch('/api/library', { credentials: 'same-origin' });
  const { library } = await handle<{ library: LibraryFile[] }>(res);
  return library;
}

export async function uploadToLibrary(
  file: File,
  meta?: { title?: string; author?: string },
): Promise<{ library: LibraryFile; duplicate: boolean }> {
  const form = new FormData();
  form.append('file', file);
  if (meta?.title) form.append('title', meta.title);
  if (meta?.author) form.append('author', meta.author);
  const res = await fetch('/api/library', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  return handle<{ library: LibraryFile; duplicate: boolean }>(res);
}

export async function deleteFromLibrary(id: number): Promise<void> {
  const res = await fetch(`/api/library/${id}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  await handle<void>(res);
}

/** Stream a library file back to an ArrayBuffer for the reader. */
export async function fetchLibraryFile(id: number): Promise<ArrayBuffer> {
  const res = await fetch(`/api/library/${id}/file`, { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  return res.arrayBuffer();
}
