/**
 * BaniDB, called directly.
 *
 * The web app goes through a same-origin proxy because BaniDB caches its
 * allow-origin header across ports; a native app has no origin to be blocked
 * by, so it talks to the API itself.
 */
export const BANIDB_BASE = 'https://api.banidb.com/v2';
