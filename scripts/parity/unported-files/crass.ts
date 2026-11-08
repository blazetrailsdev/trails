/**
 * Entries scoped to `package: "crass"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

const NOT_YET_PORTED = "No TS test file ports this Ruby test file yet.";

export const CRASS_UNPORTED_FILES: UnportedFile[] = [
  { testFile: "/test_crass.rb", package: "crass", reason: NOT_YET_PORTED },
  { testFile: "/test_serialization.rb", package: "crass", reason: NOT_YET_PORTED },
];
