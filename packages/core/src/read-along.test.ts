import { describe, expect, it } from 'vitest';

import {
  DEFAULT_READ_ALONG_OPTIONS,
  parseReadAlongOptions,
  readAlongOptionsFromJson,
  verseGurmukhi,
} from './read-along';

describe('parseReadAlongOptions', () => {
  it('reads anything that is not an object as the defaults', () => {
    expect(parseReadAlongOptions(null)).toEqual(DEFAULT_READ_ALONG_OPTIONS);
    expect(parseReadAlongOptions('large')).toEqual(DEFAULT_READ_ALONG_OPTIONS);
  });

  it('keeps the good fields of a partly stale value', () => {
    expect(parseReadAlongOptions({ transliteration: true, textSize: 'huge' })).toEqual({
      transliteration: true,
      larivaar: false,
      textSize: 'medium',
    });
  });

  it('only takes a real true for a switch', () => {
    expect(parseReadAlongOptions({ larivaar: 'yes' }).larivaar).toBe(false);
  });
});

describe('readAlongOptionsFromJson', () => {
  it('reads a stored choice', () => {
    expect(readAlongOptionsFromJson('{"larivaar":true,"textSize":"large"}')).toEqual({
      transliteration: false,
      larivaar: true,
      textSize: 'large',
    });
  });

  it('reads nothing or bad JSON as the defaults', () => {
    expect(readAlongOptionsFromJson(undefined)).toEqual(DEFAULT_READ_ALONG_OPTIONS);
    expect(readAlongOptionsFromJson('{nope')).toEqual(DEFAULT_READ_ALONG_OPTIONS);
  });
});

describe('verseGurmukhi', () => {
  const line = {
    verse: { unicode: 'ਸਤਿ ਨਾਮੁ', gurmukhi: 'siq nwmu' },
    larivaar: { unicode: 'ਸਤਿਨਾਮੁ' },
  };

  it('shows the pad-chhed by default', () => {
    expect(verseGurmukhi(line, { larivaar: false })).toBe('ਸਤਿ ਨਾਮੁ');
  });

  it('shows larivaar when chosen', () => {
    expect(verseGurmukhi(line, { larivaar: true })).toBe('ਸਤਿਨਾਮੁ');
  });

  it('falls back to the pad-chhed when a verse has no larivaar', () => {
    expect(verseGurmukhi({ verse: line.verse }, { larivaar: true })).toBe('ਸਤਿ ਨਾਮੁ');
  });

  it('is empty rather than undefined for a verse with no text', () => {
    expect(verseGurmukhi({}, { larivaar: false })).toBe('');
  });
});
