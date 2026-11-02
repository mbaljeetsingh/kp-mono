import { describe, expect, it } from 'vitest';

import {
  parseRecentSearches,
  RECENT_SEARCH_LIMIT,
  withoutRecentSearch,
  withRecentSearch,
} from './recent-searches';

const none = { en: [], pa: [] };

describe('stored terms', () => {
  it('drops a term that is only whitespace, which would draw a blank chip', () => {
    expect(parseRecentSearches(JSON.stringify({ en: ['   ', 'japji'], pa: [] })).en).toEqual([
      'japji',
    ]);
  });
});

describe('withRecentSearch', () => {
  it('puts the term first and keeps the languages apart', () => {
    const next = withRecentSearch({ en: ['waheguru'], pa: ['hjm'] }, 'japji', 'en');
    expect(next).toEqual({ en: ['japji', 'waheguru'], pa: ['hjm'] });
  });

  it('moves a repeat to the front, ignoring English case', () => {
    expect(withRecentSearch({ en: ['a', 'Japji'], pa: [] }, 'japji', 'en').en).toEqual([
      'japji',
      'a',
    ]);
  });

  it('treats GurbaniLipi case as different letters', () => {
    expect(withRecentSearch({ en: [], pa: ['h'] }, 'H', 'pa').pa).toEqual(['H', 'h']);
  });

  it('drops the oldest past the limit', () => {
    let searches = withRecentSearch(none, 'term0', 'en');
    for (let i = 1; i <= RECENT_SEARCH_LIMIT; i++) {
      searches = withRecentSearch(searches, `term${i}`, 'en');
    }
    expect(searches.en).toHaveLength(RECENT_SEARCH_LIMIT);
    expect(searches.en).not.toContain('term0');
  });
});

describe('withoutRecentSearch', () => {
  it('removes the term from its own language only', () => {
    expect(withoutRecentSearch({ en: ['a', 'b'], pa: ['a'] }, 'a', 'en')).toEqual({
      en: ['b'],
      pa: ['a'],
    });
  });
});

describe('parseRecentSearches', () => {
  it('reads what was stored', () => {
    expect(parseRecentSearches('{"en":["a"],"pa":["b"]}')).toEqual({ en: ['a'], pa: ['b'] });
  });

  it('reads anything broken as no history', () => {
    for (const raw of [null, undefined, '', 'not json', 'null', '[]', '{"en":"a"}']) {
      expect(parseRecentSearches(raw)).toEqual(none);
    }
  });

  it('drops entries that are not terms', () => {
    expect(parseRecentSearches('{"en":["a",1,"",null]}').en).toEqual(['a']);
  });
});
