/**
 * Entries scoped to `package: "racc"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

const NOT_YET_PORTED = "No TS test file, under any name, ports a test of this Ruby file yet.";

export const RACC_UNPORTED_FILES: UnportedFile[] = [
  { testFile: "/test_chk_y.rb", package: "racc", reason: NOT_YET_PORTED },
  { testFile: "/test_grammar.rb", package: "racc", reason: NOT_YET_PORTED },
  { testFile: "/test_grammar_file_parser.rb", package: "racc", reason: NOT_YET_PORTED },
  { testFile: "/test_parser_text.rb", package: "racc", reason: NOT_YET_PORTED },
  { testFile: "/test_racc_command.rb", package: "racc", reason: NOT_YET_PORTED },
  { testFile: "/test_scan_y.rb", package: "racc", reason: NOT_YET_PORTED },
];
