import type { Playable } from './types';

export const SKELETON_ROWS = 5;

/** Long enough that a fast load shows real rows without a flash of grey. */
export const SKELETON_DELAY_MS = 200;

/**
 * What a list's real row draws while its data loads, so a loading row has the
 * real row's size and cannot drift from it. Both scripts are here because a row
 * set in Gurmukhi is a different height. Never shown or played: the text is
 * transparent and the row takes no input.
 */
export const PLACEHOLDER_PLAYABLE: Playable = {
  id: 'placeholder',
  title: 'Loading this shabad',
  titleGurmukhi: 'ਸ਼ਬਦ ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ',
  artist: 'Loading this ragi',
  url: '',
};
