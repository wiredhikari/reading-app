import Anthropic from '@anthropic-ai/sdk';

let client = null;

/**
 * Lazy-construct the Anthropic client so importing this module doesn't fail
 * when the API key is missing (the /api/chat handler returns a friendly 500 instead).
 */
export function getClient() {
  if (!client) client = new Anthropic();
  return client;
}
