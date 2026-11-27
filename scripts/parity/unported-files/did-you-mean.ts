/**
 * Entries scoped to `package: "did-you-mean"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

export const DID_YOU_MEAN_UNPORTED_FILES: UnportedFile[] = [
  // --- did-you-mean: Ruby-only checkers ---
  // The remaining files implement checkers that suggest names for
  // Ruby-only failure modes — NoMethodError method names, NameError
  // variable names, KeyError keys,
  // NoMatchingPatternKeyError keys, $LOAD_PATH require targets. None of
  // these map onto JS errors.
  {
    package: "did-you-mean",
    pattern: "spell_checkers/key_error_checker.rb",
    testFile: "spell_checking/test_key_name_check.rb",
    reason: "Suggests Hash/ENV keys on Ruby KeyError. JS Map/object access doesn't raise.",
  },
  {
    package: "did-you-mean",
    pattern: "spell_checkers/method_name_checker.rb",
    testFile: "spell_checking/test_method_name_check.rb",
    reason:
      "Suggests method names on Ruby NoMethodError using receiver.methods. " +
      "JS has no NoMethodError; undefined property access returns undefined.",
  },
  {
    package: "did-you-mean",
    pattern: "spell_checkers/name_error_checkers/variable_name_checker.rb",
    testFile: "spell_checking/test_variable_name_check.rb",
    reason:
      "Suggests local/instance/class variable names from Binding#local_variables, " +
      "Object#instance_variables, etc. Ruby-only introspection surface.",
  },
  {
    package: "did-you-mean",
    pattern: "spell_checkers/pattern_key_name_checker.rb",
    testFile: "spell_checking/test_pattern_key_name_check.rb",
    reason:
      "Suggests keys on Ruby NoMatchingPatternKeyError (one-liner pattern matching). " +
      "No JS equivalent.",
  },
  {
    package: "did-you-mean",
    pattern: "spell_checkers/require_path_checker.rb",
    testFile: "spell_checking/test_require_path_check.rb",
    reason:
      "Suggests $LOAD_PATH targets on Ruby LoadError. JS module resolution is " +
      "engine-handled and doesn't surface this kind of typo suggestion.",
  },
  {
    package: "did-you-mean",
    pattern: "tree_spell_checker.rb",
    testFile: "test_tree_spell_checker.rb",
    reason:
      "Path-segment spell checker used by Rails::TestUnit::InvalidTestError to " +
      "suggest test file paths. Pre-1.0 scope: trails doesn't yet port " +
      "`bin/rails test` runner wiring, and the algorithm has no other consumer " +
      "in the call sites we target.",
  },
];
