/**
 * BaniDB, called directly.
 *
 * The web app goes through a same-origin proxy because BaniDB caches its
 * allow-origin header across ports; a native app has no origin to be blocked
 * by, so it talks to the API itself.
 */
export const BANIDB_BASE = 'https://api.banidb.com/v2';

/**
 * The privacy policy, on the player site. The stores want its URL in the
 * listing and a way to it inside the app; Google Play also wants it to say how
 * to delete an account without the app, which it does.
 */
export const PRIVACY_URL = 'https://kirtanplayer.beejaysoft.com/privacy/';
