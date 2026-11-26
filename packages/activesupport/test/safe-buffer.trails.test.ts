import { describe, expect, it } from "vitest";
import { rbEql, rbEqual } from "@blazetrails/ruby-compat/rb-equal";
import { rbHash } from "@blazetrails/ruby-compat/rb-hash";
import { SafeBuffer } from "../lib/core-ext/string/output-safety.js";

describe("SafeBuffer as a String", () => {
  it("compares and hashes by its current contents after an in-place mutation", () => {
    const buffer = new SafeBuffer("a");
    buffer.concat("b");
    buffer.prepend("_");
    buffer.insert(1, "-");

    expect(rbEqual(buffer, "_-ab")).toBe(true);
    expect(rbEqual("_-ab", buffer)).toBe(true);
    expect(rbEqual(buffer, "a")).toBe(false);
    expect(rbEql(buffer, new SafeBuffer("_-ab"))).toBe(true);
    expect(rbHash(buffer)).toBe(rbHash("_-ab"));

    buffer.replace("z");
    expect(rbEqual(buffer, "z")).toBe(true);
    expect(rbHash(buffer)).toBe(rbHash("z"));
  });
});

describe("SafeBuffer#[]= with a regexp (rb_str_subpat_set)", () => {
  it("replaces a numbered, negative or named group", () => {
    const a = new SafeBuffer("abc");
    a.set(/(b)/, -1, "y");
    expect(a.toString()).toBe("ayc");
    const b = new SafeBuffer("abc");
    b.set(/(?<g>b)/, "g", "y");
    expect(b.toString()).toBe("ayc");
  });

  it("raises IndexError in rb_str_subpat_set's order", () => {
    const buffer = new SafeBuffer("abc");
    expect(() => buffer.set(/x/, "y")).toThrow("regexp not matched");
    expect(() => buffer.set(/(?<g>b)/, "h", "y")).toThrow("undefined group name reference: h");
    expect(() => buffer.set(/(b)/, 2, "y")).toThrow("index 2 out of regexp");
    expect(() => buffer.set(/(b)/, -2, "y")).toThrow("index -2 out of regexp");
    expect(() => buffer.set(/(b)|(x)/, 2, "y")).toThrow("regexp group 2 not matched");
  });
});
