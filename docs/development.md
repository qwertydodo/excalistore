# Development

## Setup
1. `npm install`
2. `npm run dev` — starts WXT dev; load `.output/chrome-mv3` as an unpacked
   extension at `chrome://extensions` (Developer mode on).

## Commands
- `npm run build` — production build.
- `npm test` — run Vitest once. `npm run test:watch` for watch mode.
- `npm run lint` / `npm run lint:fix` — Biome.
- `npm run compile` — TypeScript typecheck.
- `npm run knip` — dead-code check.

## Google OAuth (needed from Plan 2 on)
- Create a Google Cloud project, enable the Drive API and Picker API.
- Create an OAuth client ID of type "Chrome extension" with the extension ID.
- Add the client id to `wxt.config.ts` manifest `oauth2` with scope
  `https://www.googleapis.com/auth/drive.file`.

## Manual E2E checklist
_(Filled in as features land in Plans 2–3.)_

## Skills not yet installed

The following skills referenced by the project spec could not be installed
automatically and should be added manually when available:

- `biome` — from tenequm/skills (https://github.com/tenequm/skills). As of
  this writing, the tenequm/skills repo has no standalone `biome` skill folder;
  Biome guidance is currently folded into that repo's `typescript-dev` skill
  (`skills/typescript-dev/references/biome.md`). Install the dedicated `biome`
  skill here once/if it is published as its own skill folder.
