import { describe, expect, it } from 'vitest';

import { ilikePattern } from './queries';

describe('ilikePattern', () => {
  it('quotes the pattern so a comma cannot end the or() filter', () => {
    // `or=(a.ilike.X,b.ilike.X)` is comma-separated in PostgREST's own grammar.
    // Unquoted, a comma in the term ended the filter early and the request
    // came back 400 — a search for "jag,jivan" failed outright.
    expect(ilikePattern('jag,jivan')).toBe('"%jag,jivan%"');
  });

  it('escapes ILIKE wildcards, so an underscore means an underscore', () => {
    // Doubled: the quoting layer unescapes one backslash on the way in, and
    // ILIKE sees the other.
    expect(ilikePattern('jag_jivan')).toBe('"%jag\\\\_jivan%"');
    expect(ilikePattern('100%')).toBe('"%100\\\\%%"');
  });

  it('escapes a double quote, which would otherwise close the pattern', () => {
    expect(ilikePattern('say "hello"')).toBe('"%say \\"hello\\"%"');
  });

  it('leaves an ordinary term alone but for the quotes', () => {
    expect(ilikePattern('gurwinder')).toBe('"%gurwinder%"');
  });
});
