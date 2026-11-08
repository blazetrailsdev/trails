import { describe, expect, it } from "vitest";
import { Record } from "../lib/index.js";
import "./support/dummy-application.js";

describe("SolidQueue::Record", () => {
  it("connects to config.solidQueue.connectsTo when booted through the package entry", () => {
    expect(Record.connectionDbConfig().name).toBe("queue");
  });
});
