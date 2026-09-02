// Ruby files intentionally excluded from parity:api / parity:test.
//
// Two kinds of exclusions:
//   - pre-1.0 scope: features we haven't committed to porting yet
//     (migration compatibility shims, legacy adapters, etc.)
//   - not-applicable: Ruby-only concerns that don't map to JS
//     (thread-pool plumbing, Marshal/Psych/MessagePack formats, etc.)
//
// Each entry must set at least one of:
//   `pattern`  — substring match against the Ruby SOURCE file path
//                (from extract-ruby-api.rb, e.g. "promise.rb").
//                Consumed by isSourceUnported() → parity:api.
//                A leading "/" anchors it to a path boundary, exactly as in
//                `testFile` below: "/version.rb" matches the top-level
//                `version.rb` and `<dir>/version.rb`, but NOT `gem_version.rb`.
//                Omit for test-only entries where the source IS being ported.
//   `testFile` — substring match against the Ruby TEST file path
//                (from extract-ruby-tests.rb, e.g. "message_pack_test.rb").
//                Consumed by isTestFileUnported() → parity:test.
//                Omit when there is no corresponding Rails test file.
//   `package`  — (optional) scopes a `pattern` (source-path) or whole-file
//                `testFile` (test-path) match to one package. Required when the
//                same basename exists in more than one package — e.g.
//                `core_ext/name_error.rb` lives in both activesupport and
//                did_you_mean, and `railtie_test.rb` at the test-root of both
//                globalid and activemodel — where the exclusion applies to only
//                one. Unscoped entries match across all packages.
//
// Most entries set both (source and test excluded together).
// Test-only entries (GVL, Rake, dbconsole, Ruby serialization) set only
// `testFile` because their TS source counterparts either don't exist or
// are being actively ported.

export type UnportedFile = { reason: string } &
  // `package` scopes a source-path (`pattern`) or whole-file test-path
  // (`testFile` without `tests`) match to one package. Per-test entries
  // (`tests:`) match on the test description, so scoping is pointless there.
  (| { pattern: string; testFile?: string; tests?: never; package?: string }
    | { pattern?: string; testFile: string; tests?: never; package?: string }
    // `className` narrows a per-test exclusion to one Ruby *Test class within
    // the file, so a GVL-only subclass can be dropped while a portable sibling
    // sharing a test name stays counted. Per-test entries never touch parity:api.
    //
    // `liveTsCounterpart` is the receipt for the one shape that otherwise reads
    // as a contradiction: a LIVE TS test carries this exact name, and is
    // deliberately not this Rails test. It states what the TS test asserts
    // instead and why the Rails assertion is unreachable, and
    // unported-live-test.test.ts requires one wherever such a test exists —
    // and, in the other direction, refuses one that no longer matches any live
    // test, so the receipt cannot outlive its reason.
    | {
        pattern?: never;
        testFile: string;
        className?: string;
        tests: string[];
        liveTsCounterpart?: string;
        package?: never;
      }
  );
