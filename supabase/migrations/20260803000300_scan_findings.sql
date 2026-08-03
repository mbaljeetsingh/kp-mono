-- What the scanner saw but refused to say: below-gate regions, kept.
--
-- The scan gates are precision-first on purpose — a 0.60/+0.03 region is not
-- confident enough to draft, because a wrong draft is wrong sacred text. But
-- refusing to DRAFT should not mean refusing to TELL: on a real broadcast the
-- scanner located a second shabad across six minutes and the only record was
-- a CI log line nobody reads. These findings are the pointer the tagger needs
-- ("possible: shabad 294 around 12:00, conf 0.60") to jump there and confirm
-- by ear — the human does the asserting, the machine only points.
--
-- Shape, written by the scanner alongside done_at:
--   [{"shabad_id": 294, "name": "Ot Pot Sevak Sang Rata",
--     "start": 720, "end": 1095, "confidence": 0.60, "margin": 0.03}, ...]
--
-- On the request row rather than anywhere grander because findings share the
-- request's lifecycle exactly: they describe one scan of one track, go stale
-- with it, and are replaced wholesale when a re-request re-scans.

alter table scan_requests
  add column findings jsonb;

comment on column scan_requests.findings is
  'Regions the scan saw but refused to draft (below the confidence/margin '
  'gates): [{shabad_id, name, start, end, confidence, margin}], track-clock '
  'seconds. Shown in the tagger as listen-here pointers. Replaced on re-scan.';
