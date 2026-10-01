import { describe, expect, it } from 'vitest';

import cases from './shabad-name.cases.json';
import { prettyGurmukhiName, prettyShabadName, titlesFor } from './shabad-name';

describe('titlesFor', () => {
  it('names a rendition from one line, in both scripts', () => {
    expect(
      titlesFor(
        {
          verse: { unicode: 'ਜਿਉ ਭਾਵੈ ਤਿਉ ਰਾਖਹੁ ਸੁਆਮੀ ਮਾਰਗੁ ਗੁਰਹਿ ਪਠਾਇਆ ॥੧॥ ਰਹਾਉ ॥' },
          transliteration: {
            english: 'jiau bhaavai tiau raakhahu suaamee maarag gureh paThaiaa ||1|| rahaau ||',
          },
        },
        2852
      )
    ).toEqual({
      name: 'Jiau Bhavai Tiau Rakhahu Suami Marag Gureh Pathaia',
      gurmukhi: 'ਜਿਉ ਭਾਵੈ ਤਿਉ ਰਾਖਹੁ ਸੁਆਮੀ ਮਾਰਗੁ ਗੁਰਹਿ ਪਠਾਇਆ',
    });
  });

  it('never leaves the roman name empty, and leaves a missing Gurmukhi null', () => {
    // `name` is NOT NULL and a blank one is an unclickable row; a missing
    // Gurmukhi is what the player's fallback to roman is for.
    expect(titlesFor({}, 4064)).toEqual({ name: 'Shabad 4064', gurmukhi: null });
  });
});

/*
 * The cases file is shared with packages/aligner/names.py, which checks the
 * same pairs in CI: the workbench names a line here and the scanner names it
 * there, and both have to land on the same title.
 */
describe('the shared cases', () => {
  it.each(cases.roman)('roman: %s', (line, title) => {
    expect(prettyShabadName(line)).toBe(title);
  });

  it.each(cases.gurmukhi)('gurmukhi: %s', (line, title) => {
    expect(prettyGurmukhiName(line)).toBe(title);
  });
});

describe('prettyGurmukhiName', () => {
  it('takes the rahao marker off, and the second one', () => {
    expect(prettyGurmukhiName('ਹੁਕਮੁ ਪਛਾਣਿ ਤਾ ਖਸਮੈ ਮਿਲਣਾ ॥੧॥ ਰਹਾਉ ਦੂਜਾ ॥')).not.toMatch(
      /ਰਹਾਉ|ਦੂਜਾ/
    );
  });

  it('leaves a word that only starts like the marker', () => {
    expect(prettyGurmukhiName('ਘਰੇ ਰਹਾਵੈ ॥੪੭॥')).toBe('ਘਰੇ ਰਹਾਵੈ');
  });

  it('keeps the spelling exactly, matras and all', () => {
    // Scripture, not a transliteration: nothing but the labels comes off.
    expect(prettyGurmukhiName('ਪ੍ਰਭ ਕਿਰਪਾ ਤੇ ਸਾਧਸੰਗਿ ਮੇਲਾ ॥')).toBe('ਪ੍ਰਭ ਕਿਰਪਾ ਤੇ ਸਾਧਸੰਗਿ ਮੇਲਾ');
  });

  it('survives an empty line', () => {
    expect(prettyGurmukhiName('')).toBe('');
  });
});

describe('prettyShabadName', () => {
  it('drops the rahao marker rather than ending a title with "Rahau"', () => {
    expect(prettyShabadName('aap mukat moh taarai ||1|| rahaau ||')).toBe('Ap Mukat Moh Tarai');
  });

  it('drops a single bar, which Bhai Gurdas Ji’s lines end in', () => {
    // "Kahavai|" is what the scanner wrote before this.
    expect(prettyShabadName('satiguroo kahaavai|')).toBe('Satiguru Kahavai');
  });

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
