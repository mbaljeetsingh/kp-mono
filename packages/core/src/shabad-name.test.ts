import { describe, expect, it } from 'vitest';

import { prettyShabadName } from './shabad-name';

describe('prettyShabadName', () => {
  it('turns an academic transliteration into the spelling people write', () => {
    expect(prettyShabadName('man bairaagee jaa sabadh bhau khai ||')).toBe(
      'Man Bairagi Ja Sabad Bhau Khai'
    );
  });

  it('drops verse bars and ASCII verse numbers', () => {
    expect(prettyShabadName('dhan dhan raamadhaas gur ||1||')).not.toMatch(/[|\d]/);
    expect(prettyShabadName('kirtan ॥1॥')).toBe('Kirtan');
  });

  it('leaves Devanagari digits, which the transliteration never carries', () => {
    // `\d` is ASCII-only, so ॥२॥ keeps its numeral. Recorded rather than fixed:
    // this runs on BaniDB's *transliteration* field, which is roman, and
    // widening the rule to \p{Nd} would also strip digits from a name that
    // legitimately contains one.
    expect(prettyShabadName('kirtan ॥२॥')).toBe('Kirtan २');
  });

  it('resolves the nasal marker rather than leaving brackets in a title', () => {
    // (n) becomes a plain n, and the doubled vowel collapses around it.
    expect(prettyShabadName('too(n) thaakur')).toBe('Tun Thakur');
  });

  it('only softens a standalone th, leaving it inside words alone', () => {
    expect(prettyShabadName('thaakur')).toBe('Thakur');
    expect(prettyShabadName('saath')).toBe('Sath');
    expect(prettyShabadName('th man')).toBe('T Man');
  });

  it('lowercases mid-word capitals, which mark retroflex letters and are not emphasis', () => {
    // "kooR kapaT" arrived as "KuR KapaT" when the rest of the word was left
    // alone — meaningful in a transliteration scheme, noise in a title.
    expect(prettyShabadName('kooR kapaT')).toBe('Kur Kapat');
  });

  it('only softens a word-final dh, so dhan keeps its d-h', () => {
    expect(prettyShabadName('sabadh')).toBe('Sabad');
    expect(prettyShabadName('dhan')).toBe('Dhan');
  });

  it('capitalises after a hyphen', () => {
    expect(prettyShabadName('ik-oankaar')).toBe('Ik-Oankar');
  });

  it('collapses runs of whitespace', () => {
    expect(prettyShabadName('  man   bhaae  ')).toBe('Man Bhae');
  });

  it('survives an empty transliteration', () => {
    expect(prettyShabadName('')).toBe('');
  });
});
