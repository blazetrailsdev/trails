/**
 * Entries scoped to `package: "trailties"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

export const TRAILTIES_UNPORTED_FILES: UnportedFile[] = [
  {
    pattern: "generators/app_name.rb",
    package: "trailties",
    reason:
      "Validates and camelizes the application name for `rails new`; part of the generator " +
      "layer trails does not port.",
  },
];
