import { describe, expect, it } from "vitest";
import "./support/dummy-application.js";
import "./test-helper.js";
import { SolidQueue, VERSION } from "../lib/index.js";

describe("SolidQueueTest", () => {
  it("it has a version number", () => {
    expect(VERSION).toBeTruthy();
  });

  it("time_zone defaults to the application's configured time zone, normalized to its IANA name", () => {
    expect(SolidQueue.timeZone).toEqual("Etc/UTC");
  });
});
