import { describe, it } from "vitest";

describe("PluginForkTest", () => {
  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json" (Puma is not ported).
  it.skip("stop puma when solid queue's supervisor dies", () => {});
});
