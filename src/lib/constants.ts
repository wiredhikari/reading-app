// Single source of truth for cross-cutting magic numbers.

// Tailwind's md breakpoint is 768px; we treat anything narrower as mobile.
export const MOBILE_BREAKPOINT_PX = 767;
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;

// How much visible/selected text we attach to a chat turn.
export const MAX_CONTEXT_TEXT_CHARS = 6000;
export const MAX_SELECTION_PREVIEW_CHARS = 240;
