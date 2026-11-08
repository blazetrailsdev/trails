/**
 * Entries scoped to `package: "rails-dom-testing"`. The `package` field, not
 * this file's name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

export const RAILS_DOM_TESTING_UNPORTED_FILES: UnportedFile[] = [
  {
    testFile: "/dom_assertions_test.rb",
    package: "rails-dom-testing",
    reason: "`test/dom_assertions_test.rb` has no TS counterpart yet.",
  },
  {
    testFile: "/parser_selection_test.rb",
    package: "rails-dom-testing",
    reason: "`test/parser_selection_test.rb` has no TS counterpart yet.",
  },
];
