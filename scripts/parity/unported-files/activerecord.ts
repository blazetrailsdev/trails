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
  {
    testFile: "has_many_through_disable_joins_associations_test.rb",
    tests: [
      "empty on disable joins through",
      "empty on disable joins through using custom foreign key",
    ],
    reason:
      "Asserts the through-id pluck runs at scope build; it is awaited on the way to SQL " +
      '(packages/activerecord/CLAUDE.md, "`Relation` is evaluated by an async query").',
  },
  {
    testFile: "destroy_association_async_job_test.rb",
    tests: [
      "destroy_association_async_job error shows a missing parent job class, as if ActiveJob were missing",
    ],
    reason:
      "Relies on `autoload` deferring a class body that references an undefined parent; an ES " +
      'import evaluates it eagerly (CLAUDE.md, "Call-time constant resolution").',
  },
  {
    testFile: "has_one_associations_test.rb",
    tests: ["has one proxy should not respond to private methods"],
    reason:
      "Asserts `respond_to?` differs for private methods; visibility has no runtime residue " +
      '(CLAUDE.md, "Method visibility is compile-time only").',
  },
];
