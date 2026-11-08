/**
 * Entries scoped to `package: "image-processing"`. The `package` field, not
 * this file's name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

export const IMAGE_PROCESSING_UNPORTED_FILES: UnportedFile[] = [
  {
    testFile: "/test_helper.rb",
    package: "image-processing",
    reason:
      "`test/test_helper.rb` reopens `Minitest::Test` for its fixture and similarity helpers; " +
      "it is support code, ported as `packages/image-processing/test/support/`, not a test file.",
  },
];
