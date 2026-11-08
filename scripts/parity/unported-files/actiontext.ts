import type { UnportedFile } from "./types.js";

export const ACTIONTEXT_UNPORTED_FILES: UnportedFile[] = [
  {
    testFile: "javascript_package_test.rb",
    package: "actiontext",
    reason:
      "PERMANENT: tests the built app/javascript and app/assets bundles, a non-goal of RFC 0219-actiontext-port (taken from npm as trix and @rails/actiontext).",
  },
];
