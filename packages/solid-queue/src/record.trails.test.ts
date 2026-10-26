import { describe, expect, it } from "vitest";
import { Record } from "./index.js";
import "./test-helpers/dummy-application.js";

describe("SolidQueue::Record", () => {
  it("connects to config.solidQueue.connectsTo when booted through the package entry", async () => {
    await Promise.resolve();
    expect(Record.connectionDbConfig().name).toBe("queue");
  });
});
