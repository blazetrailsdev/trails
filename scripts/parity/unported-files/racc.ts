/**
 * Entries scoped to `package: "racc"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

const COMPILER =
  'PERMANENT: CLAUDE.md § "racc\'s grammar compiler is not ported (`bin/racc`, `Racc::Grammar`)".';

const COMPILER_FILES = [
  "grammarfileparser.rb",
  "grammar.rb",
  "state.rb",
  "iset.rb",
  "statetransitiontable.rb",
  "parserfilegenerator.rb",
  "logfilegenerator.rb",
  "sourcetext.rb",
  "debugflags.rb",
  "info.rb",
  "static.rb",
];

export const RACC_UNPORTED_FILES: UnportedFile[] = [
  ...COMPILER_FILES.map((file) => ({
    pattern: `racc/${file}`,
    package: "racc",
    reason: `Part of the racc grammar compiler. ${COMPILER}`,
  })),
  {
    testFile: "/test_chk_y.rb",
    package: "racc",
    reason: `Compiles test/assets/chk.y. ${COMPILER}`,
  },
  { testFile: "/test_grammar.rb", package: "racc", reason: `Builds a Racc::Grammar. ${COMPILER}` },
  {
    testFile: "/test_grammar_file_parser.rb",
    package: "racc",
    reason: `Drives Racc::GrammarFileParser. ${COMPILER}`,
  },
  {
    testFile: "/test_parser_text.rb",
    package: "racc",
    reason: `Evals Racc::PARSER_TEXT, the runtime source the generator embeds. ${COMPILER}`,
  },
  {
    testFile: "/test_racc_command.rb",
    package: "racc",
    reason: `Every test runs the racc command. ${COMPILER}`,
  },
  {
    testFile: "/test_scan_y.rb",
    package: "racc",
    reason: `Compiles test/assets/scan.y. ${COMPILER}`,
  },
];
