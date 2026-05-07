import { describe, it } from "vitest";

describe("ReloadModelsTest", () => {
  it.skip("has one with reload", () => {
    // BLOCKED: GVL — class reloading via ActiveSupport::Dependencies / Zeitwerk, no Node.js equivalent
    // ROOT-CAUSE: Node.js has no Zeitwerk autoload or ActiveSupport::Dependencies class reload
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
});
