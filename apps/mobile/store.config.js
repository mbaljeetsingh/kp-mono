/**
 * The App Store listing (EAS Metadata), with what cannot live in
 * store.config.json added at push time: the version (from app.json) and the
 * review phone (from the environment).
 *
 * Apple requires a phone number for the review contact. Everything else lives
 * in store.config.json; this reads that and adds the number from the
 * environment, so pushing looks like:
 *
 *   KP_REVIEW_PHONE="+91 …" npx eas-cli metadata:push
 */
const config = require('./store.config.json');
const app = require('./app.json');

// The App Store version the listing is pushed to is always the app's own:
// Apple refuses the version step without one, and a hand-copied number would
// drift from app.json the first release somebody forgot it.
config.apple.version = app.expo.version;

const phone = process.env.KP_REVIEW_PHONE;
if (!phone) {
  throw new Error('Set KP_REVIEW_PHONE (the App Review contact number) before pushing metadata.');
}
config.apple.review.phone = phone;

module.exports = config;
