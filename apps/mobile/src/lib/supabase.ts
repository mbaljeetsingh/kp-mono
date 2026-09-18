/**
 * The app's Supabase client.
 *
 * `@kp/api` takes the config rather than reading it, because Vite and Expo
 * expose environment variables differently. This is the Expo half.
 */
import { createKpClient } from '@kp/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  // Failing here names the problem. Without it the first query fails with an
  // opaque network error and the missing variable is three layers away.
  throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY must be set');
}

export const supabase = createKpClient({
  url,
  key,
  // React Native has no localStorage, so without this the session dies with
  // the process and every launch is signed out.
  storage: AsyncStorage,
  // Supabase's implicit flow reads the session out of the URL hash on load,
  // which has no meaning in an app and makes it hang waiting for a `window`
  // that is not there.
  detectSessionInUrl: false,
});

/**
 * Public URL for an artist photo.
 *
 * Photos are seeded as storage paths only — the images are not in git — so a
 * missing one is the normal case and the caller falls back to a gradient tile.
 */
export function artistPhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('artist-photos').getPublicUrl(path).data.publicUrl;
}
