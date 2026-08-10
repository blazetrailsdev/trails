/**
 * Entries scoped to `package: "did-you-mean"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

export const DID_YOU_MEAN_UNPORTED_FILES: UnportedFile[] = [
  // --- did-you-mean: Ruby-only checkers ---
  // The DidYouMean port is scoped to the algorithms Rails consumes
  // (SpellChecker + Jaro/JaroWinkler/Levenshtein). The remaining files
  // patch Ruby's exception hierarchy (NameError#corrections via
  // core_ext/name_error.rb + formatter.rb), or implement checkers that
  // suggest names for Ruby-only failure modes — NoMethodError method
  // names, NameError class/variable names, KeyError keys,
  // NoMatchingPatternKeyError keys, $LOAD_PATH require targets. None of
  // these map onto JS errors.
  {
    package: "did-you-mean",
    pattern: "core_ext/name_error.rb",
    testFile: "core_ext/test_name_error_extension.rb",
    reason:
      "Patches Ruby's NameError with `corrections`, `original_message`, " +
      "`detailed_message`, `spell_checker`. JS has no NameError; trails " +
      "errors carry their own per-subclass `corrections` getter (see " +
      "ActionNotFound, ParameterMissing, AssociationNotFoundError, etc.).",
  },
  {
    package: "did-you-mean",
    pattern: "formatter.rb",
    reason:
      "Formats `Did you mean? …` suffix for Ruby's Exception#detailed_message " +
      "integration. JS error stringification is per-error, not via a stdlib hook.",
  },
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
    pattern: "spell_checkers/name_error_checkers.rb",
    reason: "Dispatcher for class/variable name checkers; both checkers are Ruby-only (see below).",
  },
  {
    package: "did-you-mean",
    pattern: "spell_checkers/name_error_checkers/class_name_checker.rb",
    testFile: "spell_checking/test_class_name_check.rb",
    reason:
      "Suggests constant/class names by walking Module#constants + ancestor scopes. " +
      "Ruby-only — JS has no equivalent constant introspection.",
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
    pattern: "spell_checkers/null_checker.rb",
    testFile: "spell_checking/test_uncorrectable_name_check.rb",
    reason:
      "Null-object fallback in Ruby's checker registry. Not needed in our " +
      "error-subclass approach.",
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
