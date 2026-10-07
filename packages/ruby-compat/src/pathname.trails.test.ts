import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { Pathname } from "./pathname.js";

describe("Pathname (trails)", () => {
  it("answers the path it was built from", () => {
    expect(new Pathname("/usr/bin/ruby").toString()).toBe("/usr/bin/ruby");
    expect(new Pathname(new Pathname("a/b")).toString()).toBe("a/b");
  });

  it("is equal to another Pathname over the same string only", () => {
    expect(new Pathname("a/b").equals(new Pathname("a/b"))).toBe(true);
    expect(new Pathname("a/b").equals(new Pathname("a/b/"))).toBe(false);
    expect(new Pathname("a/b").equals("a/b")).toBe(false);
  });

  it("raises ArgumentError on a null byte", () => {
    expect(() => new Pathname("a\0b")).toThrow(ArgumentError);
    expect(() => new Pathname("a\0b")).toThrow("pathname contains null byte");
  });
});
