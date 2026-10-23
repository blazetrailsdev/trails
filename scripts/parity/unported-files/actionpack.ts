import type { UnportedFile } from "./types.js";

export const ACTIONPACK_UNPORTED_FILES: UnportedFile[] = [
  {
    testFile: "dispatch/session/mem_cache_store_test.rb",
    package: "actionpack",
    reason:
      "every test drives a live memcached through Dalli; trails targets the Solid stack and memcached is deferred by owner ruling (2026-10-17).",
  },
];
