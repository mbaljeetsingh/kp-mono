"""Fill in the raag of every linked rendition from BaniDB.

Almost no rendition has one: the workbench leaves the field to whoever opens
"More", and nobody does. BaniDB knows it for every shabad, so this copies it
across for the rows that have none.

    SB_URL=<project>/rest/v1 SB_KEY=<service key> python fill_raags.py
    SB_URL=<project>/rest/v1 SB_KEY=<service key> python fill_raags.py --apply

The first lists what would change; the second changes it. SB_URL defaults to
the local stack, so leaving it out against prod reads your laptop instead.

A raag somebody typed is theirs and is never replaced. Safe to run again: a row
with a raag is not written. It only sees rows linked by the time it runs, so a
shabad tagged later has none until the next run.

Left alone, and listed: shabads BaniDB files under something that is not a raag
(Jap, So Dar and Sohila are sections of the Granth, and some are "No Raag"), and shabads it will not return.
"""

import sys
import urllib.error
from collections import defaultdict

from runtime import SB, api, banidb, paged


def raag_of(info):
    """BaniDB's English name, or None when its heading is not a raag at all."""
    name = ((info or {}).get("raag") or {}).get("english") or ""
    # "No Raag" is a heading BaniDB really uses, and says the opposite of a raag.
    lowered = name.lower()
    return name if "raag" in lowered and lowered != "no raag" else None


def plan():
    """(changes, not_raags, missing, total) — what --apply would write."""
    rows = paged(f"{SB}/renditions?shabad_id=not.is.null"
                 f"&select=id,shabad_id,raag,status&order=id")
    empty = defaultdict(list)
    for r in rows:
        if not (r["raag"] or "").strip():
            empty[r["shabad_id"]].append(r)

    changes, not_raags, missing = [], [], []
    # One fetch per shabad: the same shabad recurs across ragis, and BaniDB is
    # somebody else's API.
    for sid, group in sorted(empty.items()):
        try:
            info = banidb(f"/shabads/{sid}")["shabadInfo"]
        except urllib.error.HTTPError as e:
            # As fill_names.py: a 404 is an answer about this id. Anything else
            # says nothing about the shabad, so it stops the run.
            if e.code != 404:
                raise
            missing.append((sid, len(group), e.code))
            continue
        raag = raag_of(info)
        if raag is None:
            heading = ((info or {}).get("raag") or {}).get("english")
            not_raags.append((sid, len(group), heading))
            continue
        changes.extend((r, raag) for r in group)
    return changes, not_raags, missing, len(rows)


def write(r, raag):
    """One PATCH, guarded on the raag still being empty: somebody who typed one
    between the read and this write has the last word."""
    out = api(f"{SB}/renditions?id=eq.{r['id']}&or=(raag.is.null,raag.eq.)",
              method="PATCH", body={"raag": raag},
              extra={"Prefer": "return=representation"})
    return bool(out)


def main(apply):
    changes, not_raags, missing, total = plan()
    print(f"{total} renditions with a shabad linked; {len(changes)} to fill")
    for r, raag in changes:
        print(f"  {r['id'][:8]}  shabad {r['shabad_id']}  {r['status']}  -> {raag}")

    if not_raags:
        print("\nfiled under something that is not a raag, left alone:")
        for sid, n, heading in not_raags:
            print(f"  shabad {sid}: {heading}, {n} rendition(s)")
    if missing:
        print("\nshabads BaniDB did not return, left alone:")
        for sid, n, code in missing:
            print(f"  shabad {sid}: HTTP {code}, {n} rendition(s)")

    if not apply:
        if changes:
            print("\nDry run: nothing written. --apply writes the raags above.")
        return

    stale = [r for r, raag in changes if not write(r, raag)]
    print(f"\nwrote {len(changes) - len(stale)} of {len(changes)}")
    for r in stale:
        print(f"  {r['id'][:8]}: given a raag or deleted since it was read")


if __name__ == "__main__":
    main(apply="--apply" in sys.argv[1:])
