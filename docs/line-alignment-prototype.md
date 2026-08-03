# Line alignment prototype — syncing the lyrics panel without manual timestamps

Can we highlight the line being sung, in the player, without a human typing
timestamps? Yes — **95.5% frame accuracy held-out**. This documents a working
prototype, what it cost, and what is still weak.

Scored against the [Live Captioning for Gurbani Kirtan benchmark
v1](https://github.com/karanbirsingh/live-gurbani-captioning-benchmark-v1)
(annotations CC BY 4.0), then run end-to-end on our own tagged renditions.

## The problem we have is the easy corner of the problem that app solves

[bani.karanbirsingh.com](https://bani.karanbirsingh.com) is **live + blind**: a
phone in a gurdwara, rolling window, no idea what shabad is coming. Its paper
reports 57.9% frame accuracy, and most of its error is *identifying* the
shabad, not following the line.

We are **offline + oracle**. Renditions already carry `shabad_id` from tagging
we do anyway, audio is a file we can process at leisure, and the output is rows
of timestamps. That skips the part their system spends its error budget on. It
is forced alignment, not captioning — a batch job, no microphone, no model at
runtime, no latency budget.

It is also the *only* option available: sgpc.net sends no CORS headers, so the
browser cannot read archive audio at all. A server-side job fetches it fine.

## Results

| Configuration | Frame acc. |
|---|---|
| null everywhere (benchmark's floor) | 26.0% |
| regex-derived rahao line, held all recording | 18.7% |
| human-picked refrain line, held all recording | 43.1% |
| the paper's live + blind system | 57.9% |
| GT delayed 5s — "perfect tracking with lag" | 85.5% |
| **this prototype, all 12 cases** | **97.2%** |
| **this prototype, leave-one-recording-out** | **95.5%** |

**95.5% is the number to quote**, and only for the benchmark's audio. There are
4 recordings, not 12 cases — the cold-start variants reuse the same audio, so
tuning on all of them and reporting 97.2% would be training accuracy. Held-out
per recording: 99.3%, 95.6%, 94.7%, 92.1%.

**Exact protocol.** The held-out loop re-selects the null floor and the
scale weight on the other three recordings for each fold. The IDF blend was
fixed at 0.4, chosen while looking at all four — so it is not held out. It was
flat across 0.3–0.5, so the effect is likely negligible, but the number is not
purely out-of-sample. Model choice and window sizes were also fixed up front.

At n=4 recordings this is the practical ceiling. Further tuning against this
benchmark would be overfitting; the way to get closer to 100% is more annotated
renditions, not more knobs.

## Pipeline

1. [`surindersinghssj/surt-small-v3`](https://huggingface.co/surindersinghssj/surt-small-v3)
   — whisper-small finetune, Apache-2.0, ~660h Gurbani. No training, no NeMo.
2. **Two sliding-window ASR passes**, each window decoded independently;
   Whisper's own timestamps are never trusted.
   - 15s window / 5s hop — transcribes well, localises poorly
   - 8s window / 2s hop — the reverse
3. Phonetic folding of ASR output **and** canonical text: NFD, strip nukta and
   vowel signs, fold retroflex/dental pairs.
4. Per-window score against each line = `0.6 × char similarity
   (rapidfuzz.partial_ratio) + 0.4 × IDF-weighted fuzzy word recall`, where IDF
   is computed over *this shabad's own lines*, so the words that distinguish a
   line from its neighbour dominate.
5. Average over covering windows, combine the two scales, argmax over
   non-heading lines, floor → null.

Cost: two passes, RTF 0.27 + 0.56 ≈ **0.83 × audio duration**, one-off per
track. 28 min of benchmark audio took ~19 min wall-clock on Apple Silicon.

One non-obvious performance fix: `max_new_tokens=96`. Whisper's default 448
lets it loop on the ragi's genuine repetition until it hits the cap — a 10x
runtime difference on its own.

## What helped, and what didn't

| Change | Effect |
|---|---|
| baseline: folding + per-frame argmax | 91.6% LOO |
| + IDF-weighted word recall blended in | **94.9%** LOO |
| + second, shorter-window ASR pass | **95.5%** LOO |
| HMM: monotonic antras, anchor-return, null state | −10pt |
| triangular window weighting | −0.5pt |
| centre-cropping window text | −1pt |
| any constant time shift | flat — no systematic lag |
| prompting the ASR with the shabad's vocabulary | −3.1pt LOO |

Two are worth dwelling on.

**The HMM lost badly to plain argmax.** Its transition prior fought per-frame
evidence that was already right, and penalising refrain returns cost more than
the smoothing gained. The refrain comes back constantly; a model that treats
that as unlikely is wrong about kirtan.

**Prompting the ASR backfired.** It raised the mean match score against every
line (0.816 → 0.853), but accuracy *fell*, because it lifted the wrong lines
too and flattened the contrast the argmax depends on. It would also have broken
per-track ASR caching, since the prompt is per-shabad.

## Headings: detect by metadata, not by position or length

`verses[0]` is usually a raag/author heading that is never sung, so excluding
it is free precision — that holds for all four benchmark shabads. But it is
**not** a safe rule. In shabad 3590, `verses[0]` is real sung content and is
exactly what the tagger anchored `main_verse_id` to.

Word count looked like the fix and is also wrong, in both directions. In shabad
4214 the sung verse `[10]` folds to 2 tokens while the mangal heading `[1]`
folds to 3 — a real verse *shorter* than a heading. No threshold on either
tokenisation separates them; at `<4` it excludes five genuine verses. This was
live during the real-audio run, silently making verse [10] unpredictable.

Headings are not short, they are **made of metadata** — raag name, author,
ghar/metre markers, plus the invocation. BaniDB supplies `shabadInfo.raag` and
`.writer`, so the rule is: a line whose folded tokens are *all* drawn from that
vocabulary is a heading, whatever its length.

Verified on all eight shabads tested (4 benchmark, 4 production): drops exactly
index 0 on every benchmark shabad, so accuracy is unchanged at 97.2% / 95.5%
LOO; keeps `verses[0]` in 3590; on 4214 excludes the mangal and keeps verse
[10]. The failure mode is the safe direction — an unrecognised heading merely
competes in the pool, whereas an excluded verse can never win.

## `main_verse_id` is not needed for alignment

The winning decoder never reads it. It only ever helped inside the HMM, and the
HMM loses to argmax. `shabad_id` alone is enough.

Keep setting it anyway — it names the rendition, anchors the panel before
alignment exists, and it independently agreed with the aligner's dominant line
on every correctly-tagged rendition tested. It is a useful cross-check, not an
input.

## Validity checks

- **Wrong-shabad control** — feed a recording another shabad's text: **14.8%**,
  *below* the 26% null floor. Rules out leakage; the score tracks the real
  audio-to-text match. Re-run on the final config, not just the simple one.
- **`line_idx` → BaniDB** — confirmed exact against `/shabads/4377`:
  `verseId = verses[line_idx].verseId`, heading included as `verses[0]`. No
  off-by-one, so timings can be keyed on `verseId`.

## On our own audio

All four tagged renditions, fetched from sgpc.net server-side, scored with the
final matcher at the recommended operating point:

| rendition | shabad | lines used | dominant | tagger `main_verse` | blank | confidence |
|---|---|---|---|---|---|---|
| Dekh phool phool phoole | 4214 | 10/18 | 2 | 2 ✓ | 3% | 0.866 |
| Pria Ki Sobh Suhavani Niki | 4589 | 5/6 | 1 | 1 ✓ | 4% | 0.762 |
| Tere Gun Gava Dheh Bujhaii | 2990 | 8/12 | 4 | 4 ✓ | 0% | 0.824 |
| Dhan Dhan Ramdas Gur | 3590 | 4/9 | 5 | 0 ✗ | 92% | **0.515** |

Three of four align cleanly and the aligner's dominant line matches the
tagger's anchor in each. On shabad 2990 the output is textbook: refrain, rahao
line, refrain, antra 2, antra 3 in order, refrain.

**Partial shabads are handled naturally** — on 4214 only 10 of 18 lines are
ever sung; unsung lines simply never win the argmax. No special casing.

## It detects a wrong `shabad_id`

Mean best-match confidence separates good tags from bad ones sharply:
correctly-tagged renditions sit at **0.76–0.87**, a mismatch at **~0.51**.
Cross-scoring against other candidate shabads makes it starker — a correct tag
beats the alternatives by +0.22 to +0.30, a wrong one by +0.013.

This already found one error. "Dekh phool phool phoole" was tagged shabad 118,
which contains no such line; the correct shabad is **4214** (verse 50909),
scoring 0.842 against 0.520. Since corrected in admin.

"Dhan Dhan Ramdas Gur" shows the same signature at 0.515, over its whole
483-second span rather than just the sampled portion — the audio is a different
composition from shabad 3590. Worth checking in admin.

A margin below ~0.05, or absolute confidence below ~0.6, is a reliable
"needs review" flag, and it costs nothing beyond the ASR pass we already run.

## The real weak spot: it rarely shows nothing

At peak accuracy the aligner almost never blanks — it fills 265 of 290 gap
frames with a line. The benchmark hides this, because GT gaps *accept* the
adjacent line. The player would not: alaap, tabla solos, and katha between
verses should clear the panel.

The floor is the knob, and this is a product decision, not a technical wall:

| floor | bench acc. | blanks when silent | wrongly blanked |
|---|---|---|---|
| 0.30 | 97.2% | 9% | 0 frames |
| **0.40** | **96.6%** | **28%** | **29 frames** |
| 0.45 | 95.3% | 39% | 61 frames |
| 0.50 | 93.4% | 54% | 107 frames |

**Recommend floor 0.40 with scale weight 0.5 for the player.** That scores
96.6% on all 12, and two of the four held-out folds selected exactly this pair
on their own. It trades 0.6pt of benchmark accuracy for triple the correct
blanking. A stale line on screen is a worse failure than a blank one — most of
all when a rendition opens with 45s of alaap.

## Structure of kirtan, from the annotations

- 0 of 4 recordings are monotonic; the refrain returns 5–7 times.
- The refrain is a **span** — line 1 through the ਰਹਾਉ marker — not a single
  line, and it is 62–70% of sung time.
- Strip the refrain and the antras are **perfectly monotonic** in all three
  shabads that have one.
- 1 of 4 has no ਰਹਾਉ marker at all.

## Separate finding: our default anchor is off by one

`ShabadDisplay.vue` picks the default main verse by regex on ਰਹਾਉ. In all four
benchmark recordings that regex lands on the **last** line of the rahao couplet
while the ragi dwells on the **first**. As a predictor it scores 18.7% against
43.1% for the human choice — worse than predicting nothing.

Confirmed on our own data: for shabad 2990 the tagger chose line 4 and the
aligner found line 4, while the regex would pick line 5; for 4214 both landed
on line 2, regex would pick 3.

So the default is systematically one line late. Any rendition where a tagger
accepted it without listening likely has the wrong anchor. Worth a query before
building on that column — and worth changing the default to the line *before*
the marker.

## Not evaluated

- **Blind identification.** The benchmark ships only the correct shabad's text,
  so there is nothing to confuse the matcher against. Moot for the player since
  tagging supplies `shabad_id`. Note BaniDB `searchtype=2` accepts Gurmukhi
  Unicode, so an ASR-driven search is possible without a corpus download.
- **Live radio.** The 40 stations are the hard quadrant and out of scope.
- **Multi-shabad renditions, katha, simran.** The benchmark excludes these; our
  archive has them.
- **Beam search decoding.** The one untried ASR lever. 3–5× decode cost across
  two passes, and it does not touch the gap frames that dominate remaining
  error, so it was judged not worth it.

## Independent review of the architecture

Four alternative designs were reviewed independently against the 95.5%
baseline. All four came back **clearly worse**:

| approach | verdict | decisive fact |
|---|---|---|
| classic CTC forced alignment | clearly worse | monotonicity is structural to the DP; kirtan violates it |
| IndicConformer CTC head | clearly worse | its own model card puts surt-small-v3 ahead |
| audio-to-audio via TTS references | clearly worse | no IDF equivalent in embedding space |
| sentence embeddings as the scorer | clearly worse, **measured** 92.6% LOO | semantic similarity is anti-informative within one shabad |

The embedding result was re-run on the cached transcripts rather than argued:
it reproduced 95.5% exactly, then swapped only the scorer. On *clean* canonical
text the best **wrong** line scores 0.908 under e5 against 0.406 under the
lexical scorer — almost no headroom, because the lines of a shabad rhyme alike
and mean nearly the same thing. It also collapses the wrong-`shabad_id`
detector margin from +0.312 to +0.031, so scorer changes should be judged on
that margin as well as on accuracy.

**A simplification that looked right and was not: dropping the 8s/2s pass.**
It buys only 0.6 points of frame accuracy for 3× the compute, so on the metric
it is obviously cuttable. Cutting it was wrong — see *What the benchmark could
not see* below. Window *overlap* genuinely cannot go: the label grid is
precisely the set of change points of the covering-window set.

Notably, the textbook approach (CTC forced alignment) would have failed. This
design was reached by measurement, not foresight — four of six ideas tried
during development also lost. The load-bearing observation was that 0 of 4
recordings are monotonic; everything downstream follows from it.

## What the benchmark could not see

Running this in the player surfaced something 12 benchmark cases could not: the
highlight was reported as "5–7 seconds fast" within a minute of listening.

Three candidate causes were ruled out by measurement rather than argument —
ffmpeg seek accuracy (cross-correlating input-seek against output-seek
extraction: lag 0.00s, correlation 1.000), VBR drift (the files are 64 kbps
CBR), and an ID3 offset (no tag; the file opens on a raw frame sync).

A first attempt to measure the lag probed segment interiors and came back
**flat and useless** — the refrain returns constantly and occupies 62–70% of
sung time, so a probe taken 12s later usually lands on the same line. Only
*boundaries* discriminate. Scoring both the outgoing and incoming line across a
range of lags and finding where the difference crosses zero locates the true
transition.

The result was not what the report suggested:

| | single scale | two scale |
|---|---|---|
| mean error | +0.4s | −1.0s |
| **mean absolute error** | **4.91s** | **3.52s** |
| within ±3s | 3/10 | 6/10 |
| excluding one boundary that fails in both | MAE 4.57s, sd 4.96 | **MAE 2.58s, sd 2.88** |

**There is no constant offset — there is ±5.6s of unbiased jitter.** A blanket
correction would have made things worse. Half the boundaries land early, and an
early jump is far more noticeable than a late one because you see a line before
you hear it; symmetric jitter therefore *sounds* like a systematic lead.

And the fix is the pass this document previously recommended cutting. Frame
accuracy is dominated by segment interiors — a 40-second line contributes 40
frames and its boundary contributes one — so the metric is nearly blind to the
only property a listener perceives. The second pass halves boundary error while
moving frame accuracy by 0.6 points.

**Revised recommendation: keep both scales.** 0.83 RTF, not 0.27. The earlier
advice optimised a number instead of the experience.

### Boundary refinement: the crossing method as estimator

The instrument that measured the jitter also fixes it. For each contiguous
transition A→B, re-place the boundary where `score(B) − score(A)` crosses zero
across the cached short-pass windows (interpolated between window centers,
clamped inside the two segments, gap edges left alone). No new ASR — it reruns
in seconds off the cached transcripts.

| | MAE | within ±3s | **early by >3s** | late by >3s |
|---|---|---|---|---|
| single scale | 4.91s | 3/10 | 4 | 3 |
| two scale | 3.52s | 6/10 | 1 | 3 |
| two scale + refine | **2.61s** | **8/11** | **0** | 3 |

The perceptual column is the third: an early highlight shows a line before it
is sung, which is what a listener reports as "running fast"; a late one merely
lingers, which ears forgive. After refinement no boundary lands early by more
than 3s (worst +2.4s).

The residual misses are all late, at transitions between lines that end on the
same rhyme — every line of shabad 4589 ends "…ਾਵਨੀ ਨੀਕੀ" — where the two
candidates genuinely score alike and no timing method can separate them. That
is the floor for lexically self-similar shabads.

The general lesson is worth keeping: every conclusion here that came from a
metric or from reasoning was wrong about half the time — the HMM, prompting,
triangular weighting, the heading rule, and this. Every conclusion that came
from measuring against the real thing held.

## Prototype code

Nothing in this repo has changed except this document — no migrations, no
dependencies, nothing wired into the player or admin. The code lives in the
session scratchpad, which **does not survive the session**.

```
bench/  asr_pass.py       sliding-window ASR → cached JSON per track
        align.py          folding, char scoring, segment building
        matcher.py        the consolidated aligner (IDF blend, heading rule)
        multiscale.py     two-scale combination + LOO
        final_eval.py     all-12 and leave-one-out grids
        control.py        wrong-shabad control + null diagnostic
        errors.py         error bucketing
        real_all.py       end-to-end on kp-mono renditions
        confidence.py     wrong-shabad_id detector
```
