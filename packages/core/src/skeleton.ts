import type { Playable } from './types';

export const SKELETON_ROWS = 5;

/** Long enough that a fast load shows real rows without a flash of grey. */
export const SKELETON_DELAY_MS = 200;

/**
 * What a list's real row draws while its data loads, so a loading row has the
 * real row's size and cannot drift from it. Never shown or played: the text is
 * transparent and the row takes no input.
 */
export const PLACEHOLDER_PLAYABLE: Playable = {
  id: 'placeholder',
  title: 'Loading this shabad',
  artist: 'Loading this ragi',
  url: '',
};
