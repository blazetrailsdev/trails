import { describe, expect, it } from "vitest";
import "./helper.js";
import { Base } from "../lib/base.js";
import { TestAdapter } from "../lib/queue-adapters/test-adapter.js";

describe("QueueAdapter", () => {
  it("assigns queue_adapter= on a subclass without changing Base's adapter", () => {
    const baseAdapter = Base.queueAdapter;
    const childJob = class extends Base {};
    childJob.queueAdapter = "test";
    expect(childJob.queueAdapter).toBeInstanceOf(TestAdapter);
    expect(childJob.queueAdapterName).toBe("test");
    expect(new childJob().queueAdapter).toBe(childJob.queueAdapter);
    expect(Base.queueAdapter).toBe(baseAdapter);
  });
});
