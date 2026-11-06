import { describe, expect, it } from "vitest";
import { ArgumentError, StringIO } from "@blazetrails/ruby-compat";
import { Stream } from "../lib/stream.js";

class Chunks {
  closed = false;
  constructor(private chunks: string[]) {}
  read(): string | null {
    return this.chunks.shift() ?? null;
  }
  close(): void {
    this.closed = true;
  }
}

const text = (b: unknown) => new TextDecoder().decode(b as Uint8Array);

describe("Rackup::Stream", () => {
  it("reads everything without a length", () => {
    const stream = new Stream(new Chunks(["Hello ", "World"]), new StringIO());
    expect(text(stream.read())).toBe("Hello World");
  });

  it("reads at most length bytes and keeps the rest", () => {
    const stream = new Stream(new Chunks(["Hello ", "World"]), new StringIO());
    expect(text(stream.read(3))).toBe("Hel");
    expect(text(stream.read(100))).toBe("lo World");
    expect(stream.read(1)).toBeNull();
    expect(stream.read(0)).toBe("");
  });

  it("gets answers the next chunk", () => {
    const stream = new Stream(new Chunks(["a", "b"]), new StringIO());
    expect(text(stream.gets())).toBe("a");
    expect(text(stream.gets())).toBe("b");
    expect(stream.gets()).toBeNull();
  });

  it("each yields every chunk", () => {
    const stream = new Stream(new Chunks(["a", "b"]), new StringIO());
    const seen: string[] = [];
    stream.each((chunk) => seen.push(text(chunk)));
    expect(seen).toEqual(["a", "b"]);
  });

  it("read_nonblock slices the buffered chunk", () => {
    const stream = new Stream(new Chunks(["abcd"]), new StringIO());
    expect(text(stream.readNonblock(2))).toBe("ab");
    expect(text(stream.readNonblock(5))).toBe("cd");
    expect(stream.readNonblock(5)).toBeNull();
  });

  it("writes to the output and answers the byte size", () => {
    const output = new StringIO();
    const stream = new Stream(null, output);
    expect(stream.write("héllo")).toBe(6);
    expect(stream.append("!")).toBe(1);
    expect(output.string()).toBe("héllo!");
  });

  it("close with an error closes both halves", () => {
    const input = new Chunks([]);
    const stream = new Stream(input, new StringIO());
    expect(stream.close(new Error("boom"))).toBeNull();
    expect(stream.isClosed()).toBe(true);
    expect(input.closed).toBe(true);
    expect(() => stream.read()).toThrow("Stream is not readable, input has been closed!");
    expect(() => stream.write("x")).toThrow("Stream is not writable, output has been closed!");
  });

  it("raises on a non-writable output", () => {
    expect(() => new Stream(null, {} as never)).toThrow(ArgumentError);
    expect(() => new Stream(null, {} as never)).toThrow("Non-writable output!");
  });
});
