import fsd from "@feature-sliced/steiger-plugin";
import { defineConfig } from "steiger";

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // entrypoints/ (background, content, popup) is this project's App layer
    // but sits outside ./src, which is all steiger scans — every entity and
    // feature slice looks "unreferenced" to it even though entrypoints/ is
    // the real consumer. See CLAUDE.md's Architecture (FSD) section.
    rules: {
      "fsd/insignificant-slice": "off",
    },
  },
]);
