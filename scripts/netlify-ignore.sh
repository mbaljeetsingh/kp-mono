#!/usr/bin/env bash
# Netlify build-skip script. Ported from np-mono/scripts/netlify-ignore.sh.
# Exits 0 to skip the build, non-zero to run it.
#
# Usage in netlify.toml:
#   ignore = "bash scripts/netlify-ignore.sh <app-name>"
#
# Two sites share this repo; without this every push rebuilds both.
#
# The path list below is a hand-maintained copy of a graph that already exists
# in pnpm's workspace deps and each app's nuxt `extends`. A new edge — an app
# importing a new packages/* — must be mirrored here or that site's deploys go
# silently stale. `npx turbo-ignore @kp/player` would derive it from the real
# graph instead; it is not a drop-in yet because shared-theme/ sits outside
# every workspace glob (see turbo.json's globalDependencies for the same gap).

set -u

APP="${1:?app name required: player|admin}"

case "$APP" in
  player | admin) ;;
  *)
    echo "Unknown app: $APP" >&2
    exit 1
    ;;
esac

# Always rebuild on lockfile / turbo / repo-wide config changes. .nvmrc is here
# because nothing else watches it: a Node-version bump touches no app path, so
# without this entry the bump is skipped by both sites and never deploys until
# some unrelated change lands. (package.json earns its place too — it holds the
# packageManager pin and the build:* scripts Netlify invokes.)
COMMON=(
  "pnpm-lock.yaml"
  "turbo.json"
  "pnpm-workspace.yaml"
  "package.json"
  ".nvmrc"
)

# Both apps have the same closure today; `apps/$APP/` is the only difference.
# Split this back into a case if one app ever grows a dependency the other
# lacks — but keep them in sync until then, since a path added to one branch
# only would silently stop deploying the other.
PATHS=(
  "apps/$APP/"
  "packages/shared/"
  "layers/ui/"
  "shared-theme/"
)

# No usable cached ref → build (don't skip).
#
# Netlify signals "no cache" by setting CACHED_COMMIT_REF *equal to*
# COMMIT_REF, not by leaving it empty (docs: "When a build runs without
# cache, CACHED_COMMIT_REF will be the same as the COMMIT_REF"). Diffing a
# commit against itself is always empty, so checking only for the empty var
# cancelled every cache-less build — and a cancelled build saves no cache,
# which makes the next build cache-less too: one evicted/cleared cache then
# cancels every deploy from that point on. This wedged sb-mono's production
# for a month (sb-mono#10); np-mono carries the same guard for the same reason.
if [[ -z "${CACHED_COMMIT_REF:-}" || "${CACHED_COMMIT_REF}" == "${COMMIT_REF:-}" ]]; then
  echo "No usable cached commit ref — running build."
  exit 1
fi

# The diff paths below are repo-root-relative; make that true regardless of
# the directory Netlify invokes us from.
cd "$(git rev-parse --show-toplevel)" || exit 1

# git diff --quiet exits 0 if no diff (skip build), 1 if there are changes (build).
git diff --quiet "$CACHED_COMMIT_REF" "${COMMIT_REF:-HEAD}" -- "${COMMON[@]}" "${PATHS[@]}"
