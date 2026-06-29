#!/bin/sh
# Block direct commits to main (allow merge commits). Run by lefthook pre-commit.
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ "$branch" = "main" ] && [ ! -f "$(git rev-parse --git-dir)/MERGE_HEAD" ]; then
  printf 'Direct commits to main are forbidden.\nCreate a feature branch, work there, then merge.\n' >&2
  exit 1
fi
