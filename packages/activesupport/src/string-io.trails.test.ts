import { describe, expect, it } from "vitest";
import { StringIO } from "./string-io.js";

// Ruby stdlib shim, so there is no Rails test to mirror; the expectations below
// are MRI's (`ruby -rstringio`).
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

  it("appends written characters", () => {
    const io = new StringIO("ab");
    expect(io.write("cd")).toBe(2);
    expect(io.string()).toBe("abcd");
  });

  it("closes", () => {
    const io = new StringIO();
    expect(io.closed).toBe(false);
    io.close();
    expect(io.closed).toBe(true);
  });
});
