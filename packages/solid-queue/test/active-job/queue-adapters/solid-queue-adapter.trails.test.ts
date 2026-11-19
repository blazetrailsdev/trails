import { describe, expect, it } from "vitest";
import { QueueAdapters } from "@blazetrails/activejob";
import { SolidQueueAdapter } from "../../../lib/active-job/queue-adapters/solid-queue-adapter.js";

describe("SolidQueueAdapter", () => {
  it("is found by name, as queue_adapter = :solid_queue looks it up", () => {
    expect(QueueAdapters.lookup("solid_queue")).toBe(SolidQueueAdapter);
  });
});

describe("SolidQueueAdapter#stopping?", () => {
  it("reads the class-level stopping flag and ignores the job argument", () => {
    expect(new SolidQueueAdapter().isStopping()).toBe(false);
    SolidQueueAdapter.stopping = true;
    try {
      expect(new SolidQueueAdapter().isStopping({})).toBe(true);
    } finally {
      SolidQueueAdapter.stopping = false;
    }
  });
});
