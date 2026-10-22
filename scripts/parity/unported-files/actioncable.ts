import type { UnportedFile } from "./types.js";

export const ACTIONCABLE_UNPORTED_FILES: UnportedFile[] = [
  {
    pattern: "subscription_adapter/redis.rb",
    testFile: "subscription_adapter/redis_test.rb",
    package: "actioncable",
    reason:
      "trails targets the Solid stack (Solid Cable); the Redis adapter is deferred by owner ruling (2026-10-17).",
  },
  {
    testFile: "/javascript_package_test.rb",
    package: "actioncable",
    reason:
      "Runs `yarn build` over Rails' own actioncable JS sources and diffs the bundle (javascript_package_test.rb:6-18); trails ships no Rails JS client.",
  },
];
