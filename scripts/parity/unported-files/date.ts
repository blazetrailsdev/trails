/**
 * Entries scoped to `package: "date"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

export const DATE_UNPORTED_FILES: UnportedFile[] = [
  {
    testFile: "test_date_ractor.rb",
    package: "date",
    reason:
      "Ractor is Ruby's actor-based parallelism primitive — the file exercises " +
      "`Ractor.make_shareable`/`Ractor.new` round-tripping of a Date across " +
      "isolated interpreter states. JS is single-threaded and has no analogue, " +
      "same reason `promise.rb` is excluded above.",
  },
  {
    testFile: "test_date_marshal.rb",
    package: "date",
    reason:
      "Ruby's Marshal binary object format — `Marshal.dump`/`Marshal.load` of a " +
      "Date, including the frozen-string and instance-variable round trip. " +
      "Not applicable: JS has no Marshal, and the wire format is Ruby-only.",
  },
];
