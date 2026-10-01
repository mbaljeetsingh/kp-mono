"""Titles from BaniDB lines: the Python copy of packages/core/src/shabad-name.ts.

A rendition with a shabad linked is named from its anchor line, in roman
(`name`) and in Gurmukhi (`name_gurmukhi`), and nobody types either (#77). The
workbench names a line in TypeScript; the scanner and fill_names.py name it
here. One line must not get two titles, so both copies answer to the same
cases: `python names.py` checks this one against shabad-name.cases.json (CI
runs it, with nothing but the standard library), and shabad-name.test.ts
checks the other. A rule changed in one place and not the other fails there.
"""

import json
import pathlib
import re

# JavaScript's `\b` (no u flag) knows only ASCII word characters; Python's
# knows every letter. Scoped to ASCII, the two find the same word ends.
_B = r"(?a:\b)"

# The order matters, and it is shabad-name.ts's, rule for rule: two rules
# merged into one alternation are not the same as two passes. The rahao rule
# runs first, while the marker is still spelled the way BaniDB spells it, and
# only right after a verse bar (rahaau is also a word). `[0-9]` rather than
# `\d`, because Python's `\d` also matches Devanagari digits and
# JavaScript's does not. (`\s` and strip() still differ from JavaScript's on
# U+FEFF and U+0085, which BaniDB does not send.)
ROMAN_RULES = [
    (r"([|॥।]\s*)rahaau(?:\s+dhoojaa)?" + _B, r"\1"),
    (r"\|+|॥|।", " "),
    (r"[0-9]+", ""),
    (r"\(n\)", "n"),
    (r"\(nn\)", "n"),
    (r"\(h\)", "h"),
    (r"aa", "a"),
    (r"oo", "u"),
    (r"ee", "i"),
    (r"dh" + _B, "d"),
    (_B + r"th" + _B, "t"),
    (r"\s+", " "),
]

# Bounded by bars, spaces or the end rather than `\b`, as in shabad-name.ts:
# a Gurmukhi vowel sign is not a word character to either regex engine. The
# marker must follow a bar, and ਰਹਾੳ is BaniDB's spelling of one of them.
GURMUKHI_RULES = [
    (r"([॥।|]\s*)ਰਹਾ[ਉੳ](?:\s+ਦੂਜਾ)?(?=[\s॥।|]|$)", r"\1"),
    (r"[॥।|]", " "),
    (r"[੦-੯0-9]+", ""),
    (r"\s+", " "),
]


def pretty_name(transliteration):
    """BaniDB's transliteration as the spelling people write: no verse bars,
    numbers or rahao marker, doubled vowels collapsed, title case."""
    out = transliteration or ""
    for pat, rep in ROMAN_RULES:
        out = re.sub(pat, rep, out, flags=re.IGNORECASE)
    # Title case; the rest of each word lowered, because BaniDB capitalises
    # mid-word to mark retroflex letters — meaningful there, noise in a title.
    # ASCII letters, as shabad-name.ts title-cases too.
    return re.sub(r"[A-Za-z][A-Za-z']*",
                  lambda m: m[0][0].upper() + m[0][1:].lower(), out).strip()


def pretty_gurmukhi(unicode):
    """BaniDB's verse.unicode as a title: the labels off, the spelling exact."""
    out = unicode or ""
    for pat, rep in GURMUKHI_RULES:
        out = re.sub(pat, rep, out)
    return out.strip()


def titles(verse, shabad_id):
    """(name, name_gurmukhi) for a rendition anchored on this BaniDB verse —
    titlesFor in shabad-name.ts. "Shabad N" stands in for a missing roman name
    (the column may not be empty); a missing Gurmukhi is None, which leaves the
    roman name as the rendition's only title."""
    tr = (verse.get("transliteration") or {}).get("english")
    return (pretty_name(tr) or f"Shabad {shabad_id}",
            pretty_gurmukhi((verse.get("verse") or {}).get("unicode")) or None)


CASES = (pathlib.Path(__file__).resolve().parent.parent
         / "core" / "src" / "shabad-name.cases.json")


if __name__ == "__main__":
    cases = json.loads(CASES.read_text(encoding="utf-8"))
    wrong = [(fn.__name__, line, want, fn(line))
             for key, fn in (("roman", pretty_name),
                             ("gurmukhi", pretty_gurmukhi))
             for line, want in cases[key]
             if fn(line) != want]
    for fn, line, want, got in wrong:
        print(f"{fn}({line!r}) = {got!r}, expected {want!r}")
    print(f"names.py: {len(wrong)} of "
          f"{len(cases['roman']) + len(cases['gurmukhi'])} cases differ "
          f"from shabad-name.ts")
    raise SystemExit(1 if wrong else 0)
