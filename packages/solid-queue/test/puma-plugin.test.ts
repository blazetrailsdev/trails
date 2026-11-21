import { describe, it } from "vitest";

describe("PumaPluginTest", () => {
  for (const error of ["Errno::EIO", "Errno::EPIPE", "Errno::EBADF"]) {
    // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json" (Puma is not ported).
    it.skip(`monitor still stops the process when shutdown logging fails with ${error}`, () => {});
  }
});
