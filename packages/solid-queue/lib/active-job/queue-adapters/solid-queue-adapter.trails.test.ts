import { describe, expect, it } from "vitest";
import { QueueAdapters } from "@blazetrails/activejob";
import { SolidQueueAdapter } from "./solid-queue-adapter.js";

describe("SolidQueueAdapter", () => {
  it("is found by name, as queue_adapter = :solid_queue looks it up", () => {
    expect(QueueAdapters.lookup("solid_queue")).toBe(SolidQueueAdapter);
  });
});
