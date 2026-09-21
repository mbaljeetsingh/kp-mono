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

export const supabase = createKpClient({ url, key });
