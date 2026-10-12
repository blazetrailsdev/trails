import { describe, expect, it } from "vitest";
import { rbEql, rbEqual, rbHash } from "@blazetrails/ruby-compat";
import { SafeBuffer } from "./core-ext/string/output-safety.js";

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
