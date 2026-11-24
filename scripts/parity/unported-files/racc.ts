/**
 * Entries scoped to `package: "racc"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

const COMPILER =
  "Tests racc's grammar compiler (GrammarFileParser, States, ParserFileGenerator, the racc " +
  "command). trails regenerates each grammar with Ruby's racc on a version bump and ports " +
  "the generated parser; the compiler is not ported. PERMANENT: CLAUDE.md § \"racc's grammar " +
  'compiler is not ported".';

export const RACC_UNPORTED_FILES: UnportedFile[] = [
  { testFile: "/test_chk_y.rb", package: "racc", reason: COMPILER },
  { testFile: "/test_grammar.rb", package: "racc", reason: COMPILER },
  { testFile: "/test_grammar_file_parser.rb", package: "racc", reason: COMPILER },
  { testFile: "/test_parser_text.rb", package: "racc", reason: COMPILER },
  { testFile: "/test_racc_command.rb", package: "racc", reason: COMPILER },
  { testFile: "/test_scan_y.rb", package: "racc", reason: COMPILER },
];
