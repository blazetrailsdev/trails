import { describe, it } from "vitest";

describe("TouchTest", () => {
  it.skip("many updates", () => {
    // BLOCKED: mixin — needs mixins table fixture (lft, updated_at, created_at) + vi.useFakeTimers for travel
  });
  it.skip("create turned off", () => {
    // BLOCKED: mixin — needs mixins table fixture; recordTimestamps=false path is implemented
  });
});
