"""What the two batch scripts must agree on, in one place.

The whole design depends on scan_track.py and write_timings.py scoring on the
IDENTICAL scale: the calibrated confidence bands (correct tags 0.76-0.87, a
wrong shabad ~0.51) hold only if both decode with the same ASR model and
generation parameters and gate on the same floor. Two copies of any of these
is how one script gets upgraded and the other keeps gating against a scale
that no longer exists — silently, since 0.6 stays a valid-looking number.
"""

import json
import os
import urllib.request

# The scale. Bump MODEL and the calibration below must be re-measured — see
# docs/line-alignment-prototype.md for how the bands were established.
MODEL = "surindersinghssj/surt-small-v3"
GEN = {"language": "punjabi", "task": "transcribe",
       "condition_on_prev_tokens": False, "max_new_tokens": 96}
# Below this mean best-match the audio does not plausibly contain the shabad:
# correct tags measured 0.76-0.87, a real mistag 0.52. Used by write_timings
# to refuse aligning a suspect tag and by scan_track to refuse drafting one.
MIN_CONFIDENCE = 0.60

SR = 16000
SB = os.environ.get("SB_URL", "http://127.0.0.1:54321/rest/v1")

_pipe = None


def _key():
    """Read lazily, not at import: `import runtime` must work without any
    environment (tests, tooling, offline matching against cached transcripts).
    Only actually talking to the database requires the key."""
    try:
        return os.environ["SB_KEY"]
    except KeyError:
        raise SystemExit(
            "SB_KEY is not set. Point SB_URL/SB_KEY at the Supabase project "
            "(the local stack's key comes from `npx supabase status`).")


def load_pipe():
    """The ASR pipeline, loaded once per process."""
    global _pipe
    if _pipe is None:
        import torch
        from transformers import pipeline
        dev = "mps" if torch.backends.mps.is_available() else "cpu"
        print(f"  loading ASR ({MODEL}) on {dev}", flush=True)
        _pipe = pipeline("automatic-speech-recognition", model=MODEL,
                         device=dev)
    return _pipe


def free_accelerator():
    import torch
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()


def api(url, method="GET", body=None, extra=None):
    """Supabase REST with the service key. Returns parsed JSON, or None on an
    empty body. Callers that need write-back proof pass
    extra={"Prefer": "return=representation"} and check the result."""
    key = _key()
    headers = {"apikey": key, "Authorization": f"Bearer {key}",
               "Content-Type": "application/json"}
    headers.update(extra or {})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers,
                                 method=method)
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def banidb(path):
    with urllib.request.urlopen(f"https://api.banidb.com/v2{path}") as r:
        return json.load(r)


# ── transcript store ─────────────────────────────────────────────────────────
# Local disk in front, the private `transcripts` bucket behind it. Disk keeps
# laptop runs fast and offline; the bucket is what survives a CI runner, so a
# re-run (matcher improvement, re-cut boundaries, model upgrade) costs seconds
# of matching instead of minutes of ASR. Keys mirror the local filenames, so
# the boundary-keyed naming keeps doing its job remotely too.

def _object_url(key):
    base = SB[:-len("/rest/v1")] if SB.endswith("/rest/v1") else SB
    return f"{base}/storage/v1/object/transcripts/{key}"


def fetch_transcript(key):
    """The stored windows for `key`, or None. Any storage failure means
    'not cached' — the caller transcribes, which is always safe."""
    k = _key()
    req = urllib.request.Request(_object_url(key), headers={
        "apikey": k, "Authorization": f"Bearer {k}"})
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except Exception:
        return None


def store_transcript(key, payload):
    """Best-effort: a failed upload costs a future re-ASR, never this run."""
    k = _key()
    req = urllib.request.Request(
        _object_url(key),
        data=json.dumps(payload, ensure_ascii=False).encode(),
        headers={"apikey": k, "Authorization": f"Bearer {k}",
                 "Content-Type": "application/json",
                 "x-upsert": "true"},
        method="POST")
    try:
        urllib.request.urlopen(req).read()
    except Exception as e:
        print(f"  (transcript upload failed, disk cache only: {e})", flush=True)
