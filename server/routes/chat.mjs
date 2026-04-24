import { Router } from 'express';
import { config } from '../config.mjs';
import { getClient } from '../anthropicClient.mjs';

export const chatRouter = Router();

const ALLOWED_ROLES = new Set(['user', 'assistant']);

/**
 * Validate the chat request body. Returns null if valid, or a { status, error }
 * object describing the rejection.
 */
function validateChatBody(body) {
  if (!body || typeof body !== 'object') {
    return { status: 400, error: 'Request body must be a JSON object.' };
  }
  const { system, messages } = body;

  if (typeof system !== 'string') {
    return { status: 400, error: '`system` must be a string.' };
  }
  if (system.length > config.chatLimits.maxSystemChars) {
    return { status: 413, error: '`system` exceeds the maximum allowed size.' };
  }
  if (!Array.isArray(messages)) {
    return { status: 400, error: '`messages` must be an array.' };
  }
  if (messages.length === 0) {
    return { status: 400, error: '`messages` must contain at least one entry.' };
  }
  if (messages.length > config.chatLimits.maxMessages) {
    return { status: 413, error: '`messages` exceeds the maximum allowed count.' };
  }

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || typeof m !== 'object') {
      return { status: 400, error: `messages[${i}] must be an object.` };
    }
    if (!ALLOWED_ROLES.has(m.role)) {
      return { status: 400, error: `messages[${i}].role must be "user" or "assistant".` };
    }
    // The Anthropic SDK accepts string OR content-block arrays. Browser sends strings.
    if (typeof m.content !== 'string' || m.content.length === 0) {
      return { status: 400, error: `messages[${i}].content must be a non-empty string.` };
    }
    if (m.content.length > config.chatLimits.maxMessageChars) {
      return { status: 413, error: `messages[${i}].content exceeds the maximum allowed size.` };
    }
  }

  return null;
}

/**
 * Pick a client-safe error message. In production we don't leak raw upstream
 * error text (which can include internal rate-limit details, stack hints, etc.).
 */
function clientErrorMessage(err) {
  if (config.isProduction) return 'Upstream error. Please try again shortly.';
  return err instanceof Error ? err.message : String(err);
}

/**
 * POST /api/chat
 *
 * Body: { system: string, messages: Array<{role, content}> }
 * Response: text/plain stream of assistant text, chunked as it arrives.
 */
chatRouter.post('/chat', async (req, res) => {
  const validationError = validateChatBody(req.body);
  if (validationError) {
    res.status(validationError.status).json({ error: validationError.error });
    return;
  }

  if (!config.anthropicApiKey) {
    res.status(500).json({
      error: config.isProduction
        ? 'Server is not configured.'
        : 'ANTHROPIC_API_KEY is not set on the server. See .env.example.',
    });
    return;
  }

  const { system, messages } = req.body;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering

  // Only abort upstream if the client truly disconnects mid-stream.
  // res 'close' fires after a normal end too — guard with writableEnded.
  const upstreamAbort = new AbortController();
  let clientGone = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      clientGone = true;
      upstreamAbort.abort();
    }
  });

  let stream;
  try {
    stream = getClient().messages.stream(
      {
        model: config.model,
        max_tokens: config.maxTokens,
        system,
        messages,
      },
      { signal: upstreamAbort.signal },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[chat] failed to create stream:', message);
    if (!res.headersSent) {
      res.status(502).type('text/plain').send(clientErrorMessage(err));
    } else if (!res.writableEnded) {
      try {
        res.end();
      } catch {
        /* ignore */
      }
    }
    return;
  }

  // Prevent the SDK's internal promise rejection from becoming an unhandled rejection.
  // Real error handling happens in the await stream.done() catch block below.
  stream.on('error', () => {});

  // Stream text deltas as they arrive.
  stream.on('text', (delta) => {
    if (!res.writableEnded) res.write(delta);
  });

  try {
    await stream.done();
    if (!res.writableEnded) res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (clientGone || upstreamAbort.signal.aborted || /abort/i.test(message)) {
      if (!res.writableEnded) {
        try {
          res.end();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    console.error('[chat] stream error:', message);
    if (!res.headersSent) {
      res.status(502).type('text/plain').send(clientErrorMessage(err));
    } else if (!res.writableEnded) {
      try {
        res.write(`\n\n[error: ${clientErrorMessage(err)}]`);
        res.end();
      } catch {
        /* ignore */
      }
    }
  }
});
