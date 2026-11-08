import { describe, expect, it } from "vitest";
import { VERSION } from "./index.js";

describe("SolidQueueTest", () => {
  it("it has a version number", () => {
    expect(VERSION).toBeTruthy();
  });
});
