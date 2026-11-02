"""Keep shabad_lines holding the lines of every linked shabad, for search.

    SB_URL=<project>/rest/v1 SB_KEY=<service key> python fill_lines.py
    SB_URL=<project>/rest/v1 SB_KEY=<service key> python fill_lines.py --refresh

The first fetches only shabads with no lines yet, so it is cheap enough to run
ahead of every align. The second fetches them all, which is how a correction in
BaniDB reaches search; the read-along reads BaniDB live and needs no such thing.
SB_URL defaults to the local stack, so leaving it out against prod reads your
laptop instead.

Every status, not only published: a draft accepted from the tag page should be
findable the moment it goes out. Safe to run again, since a row is keyed on its
BaniDB verse id. It needs nothing past the standard library, so it runs without
the ASR environment.

A verse BaniDB has stopped returning is listed, not deleted: `line_timings` points
at the same ids, so a person should see it.

The letters follow matchesLineStart in packages/core/src/line-match.ts, which is
what marks them in the result.
"""

import sys
import unicodedata
import urllib.error

from runtime import SB, api, banidb, paged

# BaniDB indexes first letters on the vowel carriers, so ਇ and ਈ both count as ੲ.
VOWEL_CARRIERS = {"ਇ": "ੲ", "ਈ": "ੲ", "ਏ": "ੲ", "ਉ": "ੳ", "ਊ": "ੳ",
                  "ਆ": "ਅ", "ਐ": "ਅ", "ਔ": "ਅ"}


def first_letters(line, gurmukhi):
    """The first letter of each word. Verse bars and numbers are not words."""
    letters = []
    for word in line.split():
        if not any(c.isalpha() for c in word):
            continue
        if gurmukhi:
            plain = "".join(c for c in unicodedata.normalize("NFD", word)
                            if not unicodedata.category(c).startswith("M"))
            letters.append(VOWEL_CARRIERS.get(plain[0], plain[0]))
        else:
            letters.append(word[0].lower())
    return "".join(letters)


def row(verse, shabad_id):
    gurmukhi = verse["verse"]["unicode"]
    roman = verse["transliteration"]["english"]
    return {"verse_id": verse["verseId"], "shabad_id": shabad_id,
            "gurmukhi": gurmukhi, "gurmukhi_keys": verse["verse"]["gurmukhi"],
            "roman": roman, "letters_pa": first_letters(gurmukhi, True),
            "letters_en": first_letters(roman, False)}


def main(refresh):
    linked = {r["shabad_id"] for r in paged(
        f"{SB}/renditions?shabad_id=not.is.null&select=id,shabad_id&order=id")}
    held = paged(f"{SB}/shabad_lines?select=verse_id,shabad_id&order=verse_id")
    have = {r["shabad_id"] for r in held}
    todo = sorted(linked if refresh else linked - have)
    print(f"{len(linked)} linked shabads, {len(have)} with lines, fetching {len(todo)}")

    written, missing, gone, odd = 0, [], [], []
    for sid in todo:
        try:
            verses = banidb(f"/shabads/{sid}")["verses"]
        except urllib.error.HTTPError as e:
            # As in fill_names.py: a 404 answers for this id, and any other
            # refusal says nothing about the shabad, so it stops the run.
            if e.code != 404:
                raise
            missing.append(sid)
            continue
        rows = []
        for v in verses:
            # One odd line should not cost the shabad, or every shabad after it.
            try:
                rows.append(row(v, sid))
            except (KeyError, TypeError):
                odd.append(v.get("verseId"))
        api(f"{SB}/shabad_lines?on_conflict=verse_id", method="POST", body=rows,
            extra={"Prefer": "resolution=merge-duplicates"})
        written += len(rows)
        ids = {v["verseId"] for v in verses}
        gone += [r["verse_id"] for r in held
                 if r["shabad_id"] == sid and r["verse_id"] not in ids]

    print(f"wrote {written} lines")
    if missing:
        print(f"shabads BaniDB did not return: {missing}")
    if odd:
        print(f"verses missing a field, left out: {odd}")
    if gone:
        print(f"verses BaniDB no longer has, left alone: {gone}")


if __name__ == "__main__":
    main(refresh="--refresh" in sys.argv[1:])
