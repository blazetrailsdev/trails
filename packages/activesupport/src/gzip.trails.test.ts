import { b } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import { Stream } from "./gzip.js";

describe("GzipTest", () => {
  it("stream supports write, read, and rewind", () => {
    const stream = new Stream();
    stream.write("hello ");
    stream.write("world");
    stream.rewind();

    expect(stream.read()).toEqual(b("hello world"));
    expect(stream.string()).toEqual(b("hello world"));
  });

  it("stream close rewinds instead of closing", () => {
    const stream = new Stream();
    stream.write("compress me!");
    stream.close();

    expect(stream.closed).toBe(false);
    expect(stream.read()).toEqual(b("compress me!"));
  });
});
