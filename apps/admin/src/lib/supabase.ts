/**
 * The app's Supabase client.
 *
 * `@kp/api` takes the config rather than reading it, because Vite and Expo
 * expose environment variables differently. This is the Vite half.
 */
import { createKpClient } from '@kp/api';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

if (!url || !key) {
  // Failing here names the problem. Without it the first query fails with an
  // opaque network error and the missing variable is three layers away.
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_KEY must be set — see .env.example');
}

// Refuse, don't send, a request that would leave without the user's token:
// every read here is the signed-in user's, and an anonymous answer looks like
// a real one — Review empty, a tag page missing its drafts (ClientConfig.tokenless).
export const supabase = createKpClient({ url, key, tokenless: 'refuse' });
