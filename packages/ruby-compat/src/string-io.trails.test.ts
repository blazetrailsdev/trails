import { describe, expect, it } from "vitest";
import { StringIO } from "./string-io.js";

describe("StringIO", () => {
  it("reads the buffer forward and reports eof", () => {
    const io = new StringIO("abc");
    expect(io.read(2)).toBe("ab");
    expect(io.read()).toBe("c");
    expect(io.isEof()).toBe(true);
    expect(io.read()).toBe("");
    expect(io.read(1)).toBe(null);
  });

  it("rewinds to the start", () => {
    const io = new StringIO("abc");
    io.read();
    io.rewind();
    expect(io.read()).toBe("abc");
  });

  it("answers string and size regardless of position", () => {
    const io = new StringIO("abc");
    io.read();
    expect(io.string()).toBe("abc");
    expect(io.size).toBe(3);
  });

  it("counts bytes, not code points, in a binary string", () => {
    const io = new StringIO("\xff");
    expect(io.size).toBe(1);
    expect(io.read()).toBe("\xff");
  });

  it("writes from the current position", () => {
    const io = new StringIO("ab");
    expect(io.write("cd")).toBe(2);
    expect(io.string()).toBe("cd");

    const io2 = new StringIO("abcdef");
    io2.read(2);
    io2.write("XY");
    expect(io2.string()).toBe("abXYef");

    const io3 = new StringIO("ab");
    io3.read();
    io3.write("Z");
    expect(io3.string()).toBe("abZ");
  });

  it("closes", () => {
    const io = new StringIO();
    expect(io.closed).toBe(false);
    io.close();
    expect(io.closed).toBe(true);
  });
  it("round-trips an arbitrary byte sequence through read, sizing it in bytes", () => {
    const bytes = Array.from({ length: 256 }, (_, i) => i);
    const buffer = String.fromCharCode(...bytes);
    const io = new StringIO(buffer);

    expect(io.size).toBe(256);
    const read = io.read() as string;
    expect(Array.from(read, (c) => c.charCodeAt(0))).toEqual(bytes);
  });
  it("puts writes each argument on its own line, appending a newline only when absent", () => {
    const io = new StringIO();
    expect(io.puts("a\n", "b")).toBe(null);
    expect(io.string()).toBe("a\nb\n");
  });

  it("puts with no arguments or nil writes a bare newline", () => {
    const io = new StringIO();
    io.puts();
    io.puts(null);
    expect(io.string()).toBe("\n\n");
  });

  it("puts flattens an array and writes nothing for an empty one", () => {
    const io = new StringIO();
    io.puts([]);
    expect(io.string()).toBe("");
    io.puts([1, [2, 3]]);
    expect(io.string()).toBe("1\n2\n3\n");
  });

  it("puts writes [...] for a self-referential array", () => {
    const io = new StringIO();
    const ary: unknown[] = [1];
    ary.push(ary);
    io.puts(ary);
    expect(io.string()).toBe("1\n[...]\n");
  });
});
