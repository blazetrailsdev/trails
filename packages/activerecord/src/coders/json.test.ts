import { describe, it, expect } from "vitest";
import { JSON } from "./json.js";

// Mirrors: activerecord/test/cases/coders/json_test.rb — these exercise the
// coder's `load` directly (Rails: `assert_nil JSON.load("")` / `JSON.load(nil)`),
// not a model round-trip.
describe("JSONTest", () => {
  it("returns nil if empty string given", () => {
    expect(JSON.load("")).toBeNull();
  });

  it("returns nil if nil given", () => {
    expect(JSON.load(null)).toBeNull();
  });
});
