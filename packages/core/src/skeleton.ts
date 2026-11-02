import type { Playable } from './types';

export const SKELETON_ROWS = 5;

/** Long enough that a fast load shows real rows without a flash of grey. */
export const SKELETON_DELAY_MS = 200;

/**
 * What a list's real row draws while its data loads, so a loading row has the
 * real row's size and cannot drift from it. Both scripts are here because a row
 * set in Gurmukhi is a different height. The text is about as long as a real
 * title, because each bar is as wide as its text, and the segment is there so
 * the row holds its time too. Never shown or played: the text is transparent and
 * the row takes no input.
 */
export const PLACEHOLDER_PLAYABLE: Playable = {
  id: 'placeholder',
  title: 'Loading this shabad from the archive for you',
  titleGurmukhi: 'ਸ਼ਬਦ ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ ਜੀ ਥੋੜ੍ਹੀ ਉਡੀਕ ਕਰੋ ਜੀ',
  artist: 'Loading this ragi for you',
  url: '',
  startSec: 0,
  endSec: 600,
};
