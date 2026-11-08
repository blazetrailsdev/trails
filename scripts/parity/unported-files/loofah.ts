/**
 * Entries scoped to `package: "loofah"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

const NOT_YET_PORTED = "No TS test file ports this Ruby test file yet.";

export const LOOFAH_UNPORTED_FILES: UnportedFile[] = [
  { testFile: "/html5/test_sanitizer.rb", package: "loofah", reason: NOT_YET_PORTED },
  { testFile: "/integration/test_helpers.rb", package: "loofah", reason: NOT_YET_PORTED },
  { testFile: "/integration/test_html.rb", package: "loofah", reason: NOT_YET_PORTED },
  { testFile: "/integration/test_scrubbers.rb", package: "loofah", reason: NOT_YET_PORTED },
  { testFile: "/integration/test_xml.rb", package: "loofah", reason: NOT_YET_PORTED },
  { testFile: "/unit/test_api.rb", package: "loofah", reason: NOT_YET_PORTED },
  { testFile: "/unit/test_encoding.rb", package: "loofah", reason: NOT_YET_PORTED },
  { testFile: "/unit/test_helpers.rb", package: "loofah", reason: NOT_YET_PORTED },
  { testFile: "/unit/test_scrubber.rb", package: "loofah", reason: NOT_YET_PORTED },
  { testFile: "/unit/test_scrubbers.rb", package: "loofah", reason: NOT_YET_PORTED },
];
