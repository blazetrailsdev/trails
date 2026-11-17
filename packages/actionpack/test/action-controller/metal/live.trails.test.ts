import { describe, expect, it, vi } from "vitest";
import { Thread } from "@blazetrails/ruby-compat";
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
  it("build_buffer's writes past queue_size raise ClientDisconnected on their thread", async () => {
    const response = new LiveResponse();
    response.request = Request.empty();
    const before = new Set(Thread.list());
    response.body = Array.from({ length: LiveBuffer.queueSize! + 2 }, (_, i) => `part${i}`);
    const writer = Thread.list().find((t) => !before.has(t))!;
    writer.reportOnException = false;
    (response.stream as LiveBuffer).abort();
    await expect(writer.join()).rejects.toThrow(ClientDisconnected);
  });
});
