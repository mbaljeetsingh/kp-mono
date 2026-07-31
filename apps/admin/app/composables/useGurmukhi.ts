/**
 * ASCII-key to Gurmukhi letter mapping (AnmolLipi / GurbaniAkhar layout).
 *
 * BaniDB's first-letter search expects the letters in this legacy font
 * encoding, which is why typing "qmp" finds ਤ ਮ ਪ. A tagger typing roman keys
 * has no way to tell whether they hit the right ones, so the query is echoed
 * back in Gurmukhi as they type — the same reassurance np-mono's virtual
 * keyboard gives, without needing the keyboard itself.
 */
const MAP: Record<string, string> = {
  a: 'ਅ',
  A: 'ਆ',
  e: 'ੲ',
  E: 'ਓ',
  u: 'ੳ',
  s: 'ਸ',
  S: 'ਸ਼',
  h: 'ਹ',
  k: 'ਕ',
  K: 'ਖ',
  g: 'ਗ',
  G: 'ਘ',
  '|': 'ਙ',
  c: 'ਚ',
  C: 'ਛ',
  j: 'ਜ',
  J: 'ਝ',
  W: 'ਞ',
  t: 'ਟ',
  T: 'ਠ',
  f: 'ਡ',
  F: 'ਢ',
  x: 'ਣ',
  q: 'ਤ',
  Q: 'ਥ',
  d: 'ਦ',
  D: 'ਧ',
  n: 'ਨ',
  p: 'ਪ',
  P: 'ਫ',
  b: 'ਬ',
  B: 'ਭ',
  m: 'ਮ',
  X: 'ਯ',
  r: 'ਰ',
  l: 'ਲ',
  v: 'ਵ',
  V: 'ੜ',
  z: 'ਜ਼',
  Z: 'ਗ਼',
  L: 'ਲ਼',
  '^': 'ਖ਼',
  '&': 'ਫ਼',
};

/** Echo of what BaniDB will actually search for. Characters with no mapping —
 *  spaces, digits, Gurmukhi already typed directly — pass through unchanged. */
export function toGurmukhiLetters(input: string): string {
  return [...input].map((ch) => MAP[ch] ?? ch).join('');
}

/** True when the input is already Gurmukhi, in which case echoing is pointless. */
export function isGurmukhi(input: string): boolean {
  return /[਀-੿]/.test(input);
}
