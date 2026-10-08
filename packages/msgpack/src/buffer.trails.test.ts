import { describe, expect, it } from "vitest";
import { EOFError, StringIO } from "@blazetrails/ruby-compat";
import { Buffer } from "./index.js";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("MessagePack::Buffer", () => {
  it("skips and reports its size across chunks", () => {
    const b = new Buffer().append("short").append("short");
    expect(b.toA().length).toBe(2);
    expect(b.skip(3)).toBe(3);
    expect(() => b.skipAll(8)).toThrow(EOFError);
    expect(b.skipAll(2).toStr()).toEqual(bytes("short"));
    expect(b.isEmpty()).toBe(false);
  });

  it("flushes to and feeds from its io", () => {
    const io = new StringIO();
    const b = new Buffer(io);
    b.write("abc");
    expect(io.string()).toBe("");
    b.flush();
    expect([io.string(), b.size()]).toEqual(["abc", 0]);

    io.rewind();
    expect(b.ensureReadable(2)).toBe(true);
    expect(b.toStr()).toEqual(bytes("abc"));
    expect(() => b.skipAll(4)).toThrow(EOFError);
    b.clear();

    const sio = new StringIO();
    b.write("xy");
    expect(b.writeTo(sio)).toBe(2);
    expect(sio.string()).toBe("xy");
  });
});
