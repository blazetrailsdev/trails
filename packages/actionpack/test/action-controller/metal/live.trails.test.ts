import { describe, expect, it, vi } from "vitest";
import {
  Buffer as LiveBuffer,
  ClientDisconnected,
  Response as LiveResponse,
} from "../../../lib/action-controller/metal/live.js";
import { Request } from "../../../lib/action-dispatch/http/request.js";

describe("ActionController::Live::Buffer", () => {
  it("queueSize defaults to 10", async () => {
    vi.resetModules();
    const live = await import("../../../lib/action-controller/metal/live.js");
    expect(live.Buffer.queueSize).toBe(10);
  });
});

describe("ActionController::Live::Response", () => {
  it("build_buffer's writes past queue_size raise ClientDisconnected to the setBody caller", async () => {
    const response = await LiveResponse.new();
    response.request = Request.empty();
    let checks = 0;
    const isConnected = vi
      .spyOn(LiveBuffer.prototype, "isConnected", "get")
      .mockImplementation(() => ++checks < LiveBuffer.queueSize!);
    try {
      await expect(
        response.setBody(Array.from({ length: LiveBuffer.queueSize! + 2 }, (_, i) => `part${i}`)),
      ).rejects.toThrow(ClientDisconnected);
      expect(checks).toBe(LiveBuffer.queueSize);
    } finally {
      isConnected.mockRestore();
    }
  });

  it("build_buffer writes every part ahead of a following close", async () => {
    const response = await LiveResponse.new();
    response.request = Request.empty();
    await response.setBody(["a", "b"]);
    await (response.stream as LiveBuffer).close();
    expect(response.bodyParts()).toEqual(["a", "b"]);
  });
});
