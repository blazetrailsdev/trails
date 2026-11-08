import { describe, expect, it, vi } from "vitest";

describe("ActionController::Live::Buffer", () => {
  it("queueSize defaults to 10", async () => {
    vi.resetModules();
    const live = await import("../../../lib/action-controller/metal/live.js");
    expect(live.Buffer.queueSize).toBe(10);
  });
});
