import { describe, it, expect } from "vitest";
import { Stream } from "./gzip.js";

describe("GzipTest", () => {
  it("stream supports write, read, and rewind", () => {
    const stream = new Stream();
    stream.write("hello ");
    stream.write("world");
    stream.rewind();

    expect(stream.read()).toBe("hello world");
    expect(stream.string()).toBe("hello world");
  });

  it("stream close rewinds instead of closing", () => {
    const stream = new Stream();
    stream.write("compress me!");
    stream.close();

    expect(stream.closed).toBe(false);
    expect(stream.read()).toBe("compress me!");
  });
});
