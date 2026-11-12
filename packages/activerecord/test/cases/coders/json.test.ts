import { describe, it, expect } from "vitest";
import { JSON } from "../../../lib/coders/json.js";

describe("JSONTest", () => {
  it("returns nil if empty string given", () => {
    expect(JSON.load("")).toBeNull();
  });

  it("returns nil if nil given", () => {
    expect(JSON.load(null)).toBeNull();
  });
});
