// SHA-256 of a file's bytes, hex-encoded. Used to give each book a stable
// identity the server can recognize across sessions without ever storing
// the file contents (Stage 2).
//
// Uses the browser's WebCrypto API — available in every evergreen browser
// over HTTPS (and localhost). Falls back to throwing on insecure origins
// because file hashing is the whole point; there's no meaningful degraded
// mode.

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('WebCrypto unavailable — cannot hash file. Use HTTPS or localhost.');
  }
  // digest consumes the buffer view, not the buffer itself. Pass a fresh copy
  // because the caller may still need the original ArrayBuffer to render the
  // book (pdfjs mutates its input, EPUB doesn't, but copying is cheap).
  const copy = buffer.slice(0);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}
