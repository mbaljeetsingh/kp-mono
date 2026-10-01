"""Name every linked rendition from its anchor line (#77).

`name` and `name_gurmukhi` both come from one BaniDB verse — main_verse_id —
through names.titles, which is the workbench's naming in Python. Since
20261001030000_rendition_gurmukhi_names.sql the workbench and the scanner
write them that way; this brings the rows written before into line. A typed
name becomes BaniDB's, "...Rahau" loses the marker, and every empty
name_gurmukhi is filled, including one the anchor trigger cleared.

    SB_KEY=... python fill_names.py            # list what would change
    SB_KEY=... python fill_names.py --apply    # and change it

Dry unless told otherwise: it rewrites titles people typed, so the list gets
read before anything on prod is touched. Safe to run again — a row that
already matches is not written — and it needs nothing past the standard
library, so it runs without the ASR environment.

Every status, not only published: a scan draft accepted from the tag page is
published without anybody opening it, and goes out under whatever it holds.

Left alone, and listed: rows with no main_verse_id, or one the shabad no
longer has — which line is the title is a person's call, made by clicking it
in the workbench — and shabads BaniDB will not return. Rows with no shabad
are not read at all: the name their tagger typed is all they have.
"""

import sys
import urllib.error
from collections import defaultdict

from names import titles
from runtime import SB, api, banidb, paged


def plan():
    """(changes, unanchored, missing, rows) — what --apply would write."""
    rows = paged(f"{SB}/renditions?shabad_id=not.is.null"
                 f"&select=id,shabad_id,main_verse_id,name,name_gurmukhi,status"
                 f"&order=id")
    by_shabad = defaultdict(list)
    for r in rows:
        by_shabad[r["shabad_id"]].append(r)

    changes, unanchored, missing = [], [], []
    # One fetch per shabad, however many renditions share it: the same shabad
    # recurs across ragis, and BaniDB is somebody else's API.
    for sid, group in sorted(by_shabad.items()):
        try:
            verses = {v["verseId"]: v for v in banidb(f"/shabads/{sid}")["verses"]}
        except urllib.error.HTTPError as e:
            # banidb() retries what is worth retrying and raises the rest. A 4xx
            # is an answer — this id is not in BaniDB — so it is listed, not
            # fatal. Anything else (BaniDB down) stops the run: half a fill is
            # fine to resume, but not worth silently reporting as done.
            missing.append((sid, len(group), e.code))
            continue
        for r in group:
            verse = verses.get(r["main_verse_id"])
            if verse is None:
                unanchored.append(r)
                continue
            name, gurmukhi = titles(verse, sid)
            if name != r["name"] or gurmukhi != r["name_gurmukhi"]:
                changes.append((r, name, gurmukhi))
    return changes, unanchored, missing, rows


def show(r, name, gurmukhi):
    print(f"  {r['id'][:8]}  shabad {r['shabad_id']}  {r['status']}")
    if name != r["name"]:
        print(f"      name      {r['name']}\n"
              f"             -> {name}")
    if gurmukhi != r["name_gurmukhi"]:
        print(f"      gurmukhi  {r['name_gurmukhi'] or '(none)'}\n"
              f"             -> {gurmukhi or '(none)'}")


def write(r, name, gurmukhi):
    """One PATCH, guarded on the anchor it was computed from: a tagger who
    re-anchors the row between the read and this write has the last word, and
    the row is reported rather than overwritten with the old line's titles."""
    out = api(f"{SB}/renditions?id=eq.{r['id']}"
              f"&main_verse_id=eq.{r['main_verse_id']}",
              method="PATCH", body={"name": name, "name_gurmukhi": gurmukhi},
              extra={"Prefer": "return=representation"})
    return bool(out)


def main(apply):
    changes, unanchored, missing, rows = plan()
    print(f"{len(rows)} renditions with a shabad linked; "
          f"{len(changes)} to rename, "
          f"{len(rows) - len(changes) - len(unanchored)} already right")
    for c in changes:
        show(*c)

    if unanchored:
        print(f"\n{len(unanchored)} with no usable anchor line, left alone "
              f"(open each in the workbench and click the line it is known by):")
        for r in unanchored:
            print(f"  {r['id'][:8]}  shabad {r['shabad_id']}  "
                  f"main_verse_id {r['main_verse_id']}  {r['name']}")
    if missing:
        print("\nshabads BaniDB did not return, left alone:")
        for sid, n, code in missing:
            print(f"  shabad {sid}: HTTP {code}, {n} rendition(s)")

    if not apply:
        if changes:
            print("\nDry run: nothing written. --apply writes the renames above.")
        return

    stale = [r for r, name, gurmukhi in changes if not write(r, name, gurmukhi)]
    print(f"\nwrote {len(changes) - len(stale)} of {len(changes)}")
    for r in stale:
        print(f"  {r['id'][:8]}: re-anchored or deleted since it was read; "
              f"run again to pick it up")


if __name__ == "__main__":
    main(apply="--apply" in sys.argv[1:])
