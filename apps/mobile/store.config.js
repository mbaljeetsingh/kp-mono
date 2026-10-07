/**
 * The App Store listing (EAS Metadata), with the one field that cannot be in a
 * public repo added at push time.
 *
 * Apple requires a phone number for the review contact. Everything else lives
 * in store.config.json; this reads that and adds the number from the
 * environment, so pushing looks like:
 *
 *   KP_REVIEW_PHONE="+91 …" npx eas-cli metadata:push
 */
const config = require('./store.config.json');

const phone = process.env.KP_REVIEW_PHONE;
if (!phone) {
  throw new Error('Set KP_REVIEW_PHONE (the App Review contact number) before pushing metadata.');
}
config.apple.review.phone = phone;

module.exports = config;
