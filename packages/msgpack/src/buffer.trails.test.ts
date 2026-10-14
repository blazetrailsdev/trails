import { describe, expect, it } from "vitest";
import { StringIO } from "@blazetrails/ruby-compat";
import { Buffer } from "./index.js";

describe("MessagePack::Buffer", () => {
  it("to_a returns its chunks and ensure_readable feeds from its io", () => {
    const b = new Buffer().append("a".repeat(600 * 1024)).append("short");
    expect(b.toA().map((chunk) => chunk.length)).toEqual([600 * 1024, 5]);
    const fed = new Buffer(new StringIO("short"));
    expect([fed.ensureReadable(5), fed.toA().length]).toEqual([true, 1]);
  });
});
