import { describe, expect, it } from 'vitest';

import {
  parseTitleScript,
  playableTile,
  showsGurmukhi,
  TITLE_SCRIPTS,
  titleIn,
  titleInitials,
  titleScriptOption,
} from './title-script';

const linked = { title: 'Jag Jivan Aisa Supane Jaisa', titleGurmukhi: 'ਜਗਿ ਜੀਵਨੁ ਐਸਾ ਸੁਪਨੇ ਜੈਸਾ' };
const unlinked = { title: 'Simran', titleGurmukhi: null };

describe('titleIn', () => {
  it('shows the Gurmukhi to a listener who chose it', () => {
    expect(titleIn(linked, 'pa')).toBe('ਜਗਿ ਜੀਵਨੁ ਐਸਾ ਸੁਪਨੇ ਜੈਸਾ');
    expect(titleIn(linked, 'en')).toBe('Jag Jivan Aisa Supane Jaisa');
  });

  it('falls back to the roman title where there is no Gurmukhi', () => {
    // An unlinked rendition, or a queue persisted before the column existed.
    expect(titleIn(unlinked, 'pa')).toBe('Simran');
    expect(titleIn({ title: 'Old queue' }, 'pa')).toBe('Old queue');
    expect(showsGurmukhi(unlinked, 'pa')).toBe(false);
  });
});

describe('titleInitials', () => {
  it('takes the first letter of the first two Gurmukhi words', () => {
    expect(titleInitials(linked, 'pa')).toBe('ਜਜ');
    // A word opening on a vowel keeps the vowel, not a matra.
    expect(titleInitials({ title: 'x', titleGurmukhi: 'ਆਪਿ ਮੁਕਤੁ' }, 'pa')).toBe('ਆਮ');
  });

  it('keeps the roman initials the tile always had otherwise', () => {
    expect(titleInitials(linked, 'en')).toBe('JJ');
    expect(titleInitials(unlinked, 'pa')).toBe('S');
  });
});

describe('parseTitleScript', () => {
  it('reads anything but "pa" as roman', () => {
    expect(parseTitleScript('pa')).toBe('pa');
    expect(parseTitleScript('hi')).toBe('en');
    expect(parseTitleScript(null)).toBe('en');
  });
});

describe('TITLE_SCRIPTS', () => {
  it('reads back every script it offers, and nothing else', () => {
    for (const { value } of TITLE_SCRIPTS) expect(parseTitleScript(value)).toBe(value);
    expect(parseTitleScript('hi')).toBe('en');
  });

  it('names the current one, English for anything unknown', () => {
    expect(titleScriptOption('pa').label).toBe('ਪੰਜਾਬੀ');
    expect(titleScriptOption('en').short).toBe('En');
  });
});

describe('playableTile', () => {
  it("keeps the shabad's colour in either script, and letters it as shown", () => {
    const item = { ...linked, shabadId: 1234 };
    expect(playableTile(item, 'pa')).toEqual({ seed: '1234', initials: 'ਜਜ', gurmukhi: true });
    expect(playableTile(item, 'en')).toMatchObject({ seed: '1234', gurmukhi: false });
  });

  it('falls back to the title for the colour when no shabad is linked', () => {
    expect(playableTile(unlinked, 'pa')).toMatchObject({ seed: 'Simran', gurmukhi: false });
  });
});
