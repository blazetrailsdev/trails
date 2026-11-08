/**
 * Entries scoped to `package: "rails-html-sanitizer"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

const NOT_YET_PORTED = "No TS test file, under any name, ports a test of this Ruby file yet.";

export const RAILS_HTML_SANITIZER_UNPORTED_FILES: UnportedFile[] = [
  { testFile: "/scrubbers_test.rb", package: "rails-html-sanitizer", reason: NOT_YET_PORTED },
];
