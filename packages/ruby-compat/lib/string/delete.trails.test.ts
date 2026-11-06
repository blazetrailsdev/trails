import { describe, it, expect } from "vitest";
import { stringDelete } from "./delete.js";

describe("stringDelete", () => {
  it("deletes every character in the set", () => {
    expect(stringDelete("a{b}c", "{}")).toBe("abc");
  });

  it("treats c1-c2 as a range", () => {
    expect(stringDelete("hello", "a-y")).toBe("");
    expect(stringDelete("a-c", "-")).toBe("ac");
  });

  it("negates a leading ^", () => {
    expect(stringDelete("hello", "^l")).toBe("ll");
    expect(stringDelete("a^b", "^")).toBe("ab");
    expect(stringDelete("a^b", "^a")).toBe("a");
  });

  it("intersects multiple selectors", () => {
    expect(stringDelete("hello", "l", "lo")).toBe("heo");
    expect(stringDelete("abcd", "a-c", "b-d")).toBe("ad");
  });

  it("deletes nothing for an empty selector", () => {
    expect(stringDelete("abc", "")).toBe("abc");
  });

  it("escapes with a backslash", () => {
    expect(stringDelete("he\\llo", "\\\\")).toBe("hello");
    expect(stringDelete("a-b", "a\\-b")).toBe("");
  });
});
