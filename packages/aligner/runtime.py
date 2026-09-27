"""What the two batch scripts must agree on, in one place.

The whole design depends on scan_track.py and write_timings.py scoring on the
IDENTICAL scale: the calibrated confidence bands (correct tags 0.82-0.92, a
wrong shabad ~0.52) hold only if both decode with the same ASR model and
decoding and gate on the same floor. Two copies of any of these
is how one script gets upgraded and the other keeps gating against a scale
that no longer exists — silently, since 0.6 stays a valid-looking number.
"""

import http.client
import json
import os
import time
import urllib.error
import urllib.request

# The scale. Bump MODEL or REVISION and the calibration below must be
# re-measured — see docs/line-alignment-prototype.md for how the bands were
# established. The revision is pinned because the upstream repo is a
# "preview": an unannounced push would move every score this gate reads.
MODEL = "karansea/indicconformer-stt-pa-ctc-shabad-preview"
REVISION = "5fd2e89e3a43d31f47b0fb55fdce5ed50a91283f"
# In every transcript cache key, local and in the bucket. Text from a
# different model is not a cache hit, it is a different scale — without this a
# model change would silently keep matching the old model's transcripts.
MODEL_TAG = f"ctc-{REVISION[:8]}"
# Below this mean best-match the audio does not plausibly contain the shabad.
# Measured under this model on our own tagged renditions: correct tags
# 0.82-0.92, the real mistag (shabad 3590) 0.525 — the same bands surt-small-v3
# gave (0.80-0.93 / 0.520), which is why the floor did not move in the swap.
# Used by write_timings to refuse aligning a suspect tag and by scan_track to
# refuse drafting one.
MIN_CONFIDENCE = 0.60

SR = 16000
SB = os.environ.get("SB_URL", "http://127.0.0.1:54521/rest/v1")

# The export fails past ~60s of input (its attention cannot broadcast longer),
# so long audio goes through in chunks, each with context either side whose
# frames are thrown away. 45 + 2x5 stays clear of the limit.
CHUNK, CONTEXT = 45.0, 5.0
BLANK = 256            # CTC blank: 256 Gurmukhi pieces, then blank
FRAME = 0.04           # seconds per output frame

_model = None


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


def _load():
    """The ONNX session and tokenizer, loaded once per process."""
    global _model
    if _model is None:
        import onnxruntime as ort
        import sentencepiece as spm
        from huggingface_hub import hf_hub_download
        print(f"  loading ASR ({MODEL}@{REVISION[:8]})", flush=True)
        onnx = hf_hub_download(MODEL, "model.int8.onnx", revision=REVISION)
        tok = hf_hub_download(MODEL, "tokenizer.model", revision=REVISION)
        sp = spm.SentencePieceProcessor()
        sp.Load(tok)
        _model = (ort.InferenceSession(onnx, providers=["CPUExecutionProvider"]),
                  sp)
    return _model


def _emissions(clip):
    import numpy as np
    sess, _ = _load()
    lp, n = sess.run(["log_probs", "out_len"], {
        "audio": clip[None, :],
        "audio_len": np.array([len(clip)], dtype=np.int64)})
    return lp[0, :int(n[0])]


def _decode(lp):
    """Greedy CTC: argmax per frame, collapse repeats, drop blanks."""
    _, sp = _load()
    ids, prev = [], -1
    for i in lp.argmax(-1).tolist():
        if i != prev and i != BLANK:
            ids.append(int(i))
        prev = i
    return sp.decode(ids).strip()


def _windows(dur, win, hop, starts=None):
    """Window grid. The last window is clamped to the real audio length:
    recording it as a full `win` wide would push every derived timing past the
    end of the rendition."""
    if starts is None:
        starts, t = [], 0.0
        while t + 1 < dur:
            starts.append(t)
            t += hop
    return [(s, min(s + win, dur)) for s in starts]


def transcribe_sliced(audio, win, hop):
    """One forward pass over the whole recording, then every window is a
    greedy decode of its slice of the frames. Costs ~RTF 0.075 on a CI runner
    however dense the grid is — windows are nearly free once the frames exist.

    What it trades: each slice's frames saw audio beyond the window's edges,
    and that context places transitions early (measured −1.5s). Right for the
    long pass, which transcribes and gates; wrong for the short pass, which
    localises — see transcribe_windows."""
    import numpy as np
    dur = len(audio) / SR
    parts, t = [], 0.0
    while t < dur:
        a0, a1 = max(0.0, t - CONTEXT), min(dur, t + CHUNK + CONTEXT)
        lp = _emissions(audio[int(a0 * SR):int(a1 * SR)])
        stride = (a1 - a0) / len(lp)
        parts.append(lp[int(round((t - a0) / stride)):
                        int(round((min(dur, t + CHUNK) - a0) / stride))])
        t += CHUNK
    lp = np.concatenate(parts)
    return [{"start": s, "end": e,
             "text": _decode(lp[int(s / FRAME):int(e / FRAME)])}
            for s, e in _windows(dur, win, hop)]


def transcribe_windows(audio, win, hop, starts=None, label="windows"):
    """Every window run through the model on its own, hearing only itself —
    so its text is evidence about exactly that span. ~RTF 0.16 on a runner for
    an 8s/2s grid. `starts` overrides the grid (the scan's sparse one)."""
    dur = len(audio) / SR
    grid = _windows(dur, win, hop, starts)
    out = []
    for i, (s, e) in enumerate(grid):
        out.append({"start": s, "end": e,
                    "text": _decode(_emissions(audio[int(s * SR):int(e * SR)]))})
        if i % 20 == 0:
            print(f"    {i}/{len(grid)} {label}", end="\r", flush=True)
    print(f"    {len(grid)}/{len(grid)} {label}", flush=True)
    return out


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


# BaniDB is a public API reached over the open internet, and the calls that
# need it come AFTER the expensive part of a run.
BANIDB_TIMEOUT = 20
BANIDB_TRIES = 4


def banidb(path):
    """BaniDB, with the retries a call over the open internet needs.

    A bare urlopen was enough until `RemoteDisconnected` arrived on the shabad
    fetch that follows ASR — 187 transcribed windows of accelerator time thrown
    away by one closed socket. Transient failures now get a widening pause; a
    4xx does not, because a shabad id that does not exist will not start
    existing, and retrying it four times only delays the real message.

    The timeout matters as much as the retry: urlopen without one can hang on a
    half-open socket indefinitely, which in a nightly run is indistinguishable
    from a wedged job.
    """
    last = None
    for attempt in range(BANIDB_TRIES):
        try:
            with urllib.request.urlopen(f"https://api.banidb.com/v2{path}",
                                        timeout=BANIDB_TIMEOUT) as r:
                return json.load(r)
        # HTTPError first: it subclasses URLError, which subclasses OSError, so
        # the broad clause below would otherwise swallow every status code.
        except urllib.error.HTTPError as e:
            # Rate limiting and server faults are worth waiting out. Anything
            # else in 4xx is an answer.
            if e.code != 429 and e.code < 500:
                raise
            last = e
        except (urllib.error.URLError, http.client.HTTPException,
                TimeoutError, OSError) as e:
            last = e
        if attempt < BANIDB_TRIES - 1:
            pause = 1.5 * (2 ** attempt)
            print(f"  banidb {path} failed ({last}); retrying in {pause:g}s",
                  flush=True)
            time.sleep(pause)
    raise RuntimeError(
        f"banidb {path} failed after {BANIDB_TRIES} attempts: {last}")


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
