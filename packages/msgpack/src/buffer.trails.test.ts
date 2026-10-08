import { describe, expect, it } from "vitest";
import { EOFError, StringIO } from "@blazetrails/ruby-compat";
import { Buffer } from "./index.js";

describe("MessagePack::Buffer", () => {
  it("skips across chunks, flushes to its io and feeds from it", () => {
    const io = new StringIO();
    const b = new Buffer(io).append("short").append("short");
    expect([b.toA().length, b.skip(3), b.isEmpty()]).toEqual([2, 3, false]);
    expect([b.flush().size(), io.string()]).toEqual([0, "rtshort"]);
    io.rewind();
    expect(b.skipAll(2).ensureReadable(5)).toBe(true);
    expect(() => b.skipAll(6)).toThrow(EOFError);
    const sio = new StringIO();
    expect([b.writeTo(sio), sio.string()]).toEqual([5, "short"]);
  });
});
