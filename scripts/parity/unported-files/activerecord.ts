/**
 * Per-test activerecord entries: Rails tests that are permanently unportable.
 * Each keeps its `it.skip` stub in the TS file. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

export const ACTIVERECORD_UNPORTED_FILES: UnportedFile[] = [
  {
    testFile: "normalized_attribute_test.rb",
    tests: ["normalizes changed-in-place value before validation", "normalizes value on demand"],
    reason:
      "Both call `@aircraft.name.downcase!`, mutating a String in place; a JS string is an " +
      'immutable primitive (CLAUDE.md, "Ruby Strings are JS string primitives").',
  },
  {
    testFile: "finder_test.rb",
    tests: ["symbols table ref"],
    reason:
      "Counts `Symbol.all_symbols`; a Ruby Symbol is a JS string, so there is no symbol " +
      'table (CLAUDE.md, "Ruby idioms that do not translate literally").',
  },
  {
    testFile: "base_test.rb",
    tests: ["resetting column information doesn't remove attribute methods"],
    reason:
      "Relies on `method_missing` regenerating an undefined attribute method on read " +
      '(packages/activerecord/CLAUDE.md, "Records are not Proxies").',
  },
  {
    testFile: "marshal_serialization_test.rb",
    tests: [
      "deserializing rails 6 1 marshal basic",
      "deserializing rails 6 1 marshal with loaded association cache",
      "deserializing rails 7 1 marshal basic",
      "deserializing rails 7 1 marshal with loaded association cache",
    ],
    reason:
      "Unmarshals Marshal blobs written by real Ruby Rails 6.1/7.1 processes; loading " +
      'Ruby-written Marshal data is out of scope (CLAUDE.md, "Runtime facts Node does not expose").',
  },
];
