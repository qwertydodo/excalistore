import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
if (branch !== "main") process.exit(0);

const mergeHeadPath = execSync("git rev-parse --git-path MERGE_HEAD").toString().trim();
if (existsSync(mergeHeadPath)) process.exit(0);

console.error(
  "Direct commits to main are forbidden. Create a feature branch, then merge it into main.",
);
process.exit(1);
