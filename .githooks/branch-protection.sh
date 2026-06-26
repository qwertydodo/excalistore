#!/bin/sh
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ "$branch" = "main" ]; then
    merge_head="$(git rev-parse --git-dir)/MERGE_HEAD"
    if [ ! -f "$merge_head" ]; then
        printf 'Direct commits to main are forbidden.\nCreate a feature branch, work there, then merge.\n' >&2
        exit 1
    fi
fi
