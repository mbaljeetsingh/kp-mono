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

/**
 * Public URL for an artist photo.
 *
 * Photos are seeded as storage paths only — the images are not in git — so a
 * missing one is the normal case and the caller falls back to a gradient tile
 * rather than a broken image.
 */
export function artistPhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('artist-photos').getPublicUrl(path).data.publicUrl;
}
