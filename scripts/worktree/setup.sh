#!/bin/bash
# setup.sh — SessionStart hook for worktrees.
#
# A git worktree brings across tracked files and nothing else, so a fresh one
# has no node_modules and none of the `.env` files listed in `.worktreeinclude`
# — the player then boots to a 500 reading "supabaseKey is required", and
# `pnpm dev:player` fails with "turbo: command not found". This closes both
# gaps. Ported from np-mono, which solves the same problem the same way.
#
# Skipped when running in the main checkout (checked by the caller).

set -e

# `cut -d' ' -f2` would truncate at the first space, so a checkout under a path
# like "~/My Code/kp-mono" would resolve to "~/My" and silently link nothing.
MAIN_REPO=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')
WORKTREE_DIR=$(git rev-parse --show-toplevel)

# 1. Symlink the gitignored files listed in .worktreeinclude. Symlinks rather
#    than copies so a key rotated in the main checkout is picked up here too,
#    instead of leaving stale credentials behind in every worktree.
#
#    Deliberately outside the done-marker guard below. Linking is idempotent
#    and costs nothing, and gating it meant a worktree whose first session ran
#    before `.worktreeinclude` existed on main was marked done and never linked
#    anything afterwards — as was any worktree predating a newly added entry.
if [ -f "$MAIN_REPO/.worktreeinclude" ]; then
  while IFS= read -r file || [ -n "$file" ]; do
    [[ -z "$file" || "$file" == \#* ]] && continue
    if [ -f "$MAIN_REPO/$file" ] && [ ! -L "$WORKTREE_DIR/$file" ]; then
      mkdir -p "$WORKTREE_DIR/$(dirname "$file")"
      ln -sf "$MAIN_REPO/$file" "$WORKTREE_DIR/$file"
      echo "  Linked $file" >&2
    fi
  done < "$MAIN_REPO/.worktreeinclude"
fi

# 2. The expensive half stays gated — the hook fires on every session start.
if [ -f "$WORKTREE_DIR/.worktree-setup-done" ]; then
  exit 0
fi

echo "Setting up worktree: $(basename "$WORKTREE_DIR")" >&2

# 3. A real pnpm install — a node_modules SYMLINK to the main checkout breaks
#    pnpm workspace resolution: package imports resolve through main's
#    node_modules to main's packages/*, while app-local resolution hits the
#    worktree's copies, so a workspace package like @kp/shared loads TWICE.
#    A real install is cheap (pnpm hardlinks from the global store) and keeps
#    resolution self-contained.
if [ -L "$WORKTREE_DIR/node_modules" ]; then
  rm "$WORKTREE_DIR/node_modules"
  echo "  Removed node_modules symlink (breaks pnpm workspace resolution)" >&2
fi
echo "  Running pnpm install..." >&2
(cd "$WORKTREE_DIR" && CI=true pnpm install --prefer-offline --silent) >&2

touch "$WORKTREE_DIR/.worktree-setup-done"
echo "  Done." >&2
