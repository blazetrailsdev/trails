import type { UnportedFile } from "./types.js";

export const ACTIONCABLE_UNPORTED_FILES: UnportedFile[] = [
  {
    testFile: "/javascript_package_test.rb",
    package: "actioncable",
    reason:
      "Runs `yarn build` over Rails' own actioncable JS sources and diffs the bundle (javascript_package_test.rb:6-18); trails ships no Rails JS client.",
  },
];
