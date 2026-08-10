// Entries scoped to `package: "activerecord-test-support"`.
// The `package` field — not this file's name — is what scopes the match.
//
// See ./types.ts for the entry schema.

import type { UnportedFile } from "./types.js";

export const ACTIVERECORD_TEST_SUPPORT_UNPORTED_FILES: UnportedFile[] = [
  {
    pattern: "tools.rb",
    package: "activerecord-test-support",
    reason:
      "Rails' rake/minitest test-runner plumbing: prepends adapter globbing onto " +
      "Rails::TestUnit::Runner and invokes it with ARGV. vitest fills that role in " +
      "trails — no port intended.",
  },
];
