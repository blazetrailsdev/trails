import { beforeEach, describe, expect, it, vi } from "vitest";
import { EOFError, StringIO } from "@blazetrails/ruby-compat";
import { Buffer } from "../index.js";

function bin(s: string): Uint8Array {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

function str(bytes: Uint8Array | null): string | null {
  if (bytes == null) return null;
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return s;
}

const rand = (max: number) => Math.floor(Math.random() * max);

function same(bytes: Uint8Array, s: string): boolean {
  if (bytes.length !== s.length) return false;
  for (let i = 0; i < s.length; i++) if (bytes[i] !== s.charCodeAt(i)) return false;
  return true;
}

let pool = "";

function bytes(n: number): string {
  while (pool.length < 1024 * 1400 * 2) {
    pool += String.fromCharCode(...crypto.getRandomValues(new Uint8Array(0x8000)));
  }
  const offset = rand(pool.length - n);
  return pool.slice(offset, offset + n);
}

describe("MessagePack::Buffer", () => {
  let source: string;
  let io: StringIO;
  let buffer: Buffer;

  const setSource = (s: string) => {
    source = s;
    io = new StringIO(source);
    buffer = new Buffer(io);
  };

  beforeEach(() => {
    setSource("");
  });

  it("io returns internal io", () => {
    expect(buffer.io).toBe(io);
  });

  it("close closes internal io", () => {
    const close = vi.spyOn(io, "close");
    buffer.close();
    expect(close).toHaveBeenCalled();
  });

  it("short feed and read all", () => {
    setSource("aa");
    expect(str(buffer.read())).toEqual("aa");
  });

  it("short feed and read short", () => {
    setSource("aa");
    expect(str(buffer.read(1))).toEqual("a");
    expect(str(buffer.read(1))).toEqual("a");
    expect(buffer.read(1)).toEqual(null);
  });

  it("long feed and read all", () => {
    setSource(" ".repeat(1024 * 1024));
    const s = buffer.read()!;
    expect(s.length).toEqual(source.length);
    expect(str(s)).toEqual(source);
  });

  it("long feed and read mixed", () => {
    setSource(" ".repeat(1024 * 1024));
    for (let i = 0; i < 3; i++) {
      expect(str(buffer.read(10))).toEqual(source.slice(0, 10));
      source = source.slice(10);
    }
    const s = buffer.read()!;
    expect(s.length).toEqual(source.length);
    expect(str(s)).toEqual(source);
  });

  it("eof", () => {
    setSource("");
    expect(str(buffer.read())).toEqual("");
  });

  it("eof 2", () => {
    setSource("a");
    expect(str(buffer.read())).toEqual("a");
    expect(str(buffer.read())).toEqual("");
  });

  it("write short once and flush", () => {
    buffer.write("aa");
    buffer.flush();
    expect(io.string()).toEqual("aa");
  });

  it("write short twice and flush", () => {
    buffer.write("a");
    buffer.write("a");
    buffer.flush();
    expect(io.string()).toEqual("aa");
  });

  it("write long once and flush", () => {
    const s = " ".repeat(1024 * 1024);
    buffer.write(s);
    buffer.flush();
    expect(io.string().length).toEqual(s.length);
    expect(io.string()).toEqual(s);
  });

  it("write short multi and flush", () => {
    const s = " ".repeat(1024 * 1024);
    for (let i = 0; i < 1024; i++) {
      buffer.write(" ".repeat(1024));
    }
    buffer.flush();
    expect(io.string().length).toEqual(s.length);
    expect(io.string()).toEqual(s);
  });

  it("random read", () => {
    for (let i = 0; i < 50; i++) {
      const fragments: string[] = [];

      for (let j = rand(4); j > 0; j--) {
        const n = rand(1024 * 1400);
        const s = bytes(n);
        fragments.push(s);
      }

      const io = new StringIO(fragments.join(""));
      const b = new Buffer(io);

      for (const s of fragments) {
        const x = b.read(s.length)!;
        expect(x.length).toEqual(s.length);
        expect(same(x, s)).toEqual(true);
      }
      expect(b.isEmpty()).toEqual(true);
      expect(str(b.read())).toEqual("");
    }
  }, 30_000);

  it("random read_all", () => {
    for (let i = 0; i < 50; i++) {
      const fragments: string[] = [];
      bytes(0);

      for (let j = rand(4); j > 0; j--) {
        const n = rand(1024 * 1400);
        const s = bytes(n);
        fragments.push(s);
      }

      const io = new StringIO(fragments.join(""));
      const b = new Buffer(io);

      for (const s of fragments) {
        const x = b.readAll(s.length);
        expect(x.length).toEqual(s.length);
        expect(same(x, s)).toEqual(true);
      }
      expect(b.isEmpty()).toEqual(true);
      expect(() => {
        b.readAll(1);
      }).toThrow(EOFError);
    }
  }, 30_000);

  it("random skip", () => {
    for (let i = 0; i < 50; i++) {
      const fragments: string[] = [];

      for (let j = rand(4); j > 0; j--) {
        const n = rand(1024 * 1400);
        const s = bytes(n);
        fragments.push(s);
      }

      const io = new StringIO(fragments.join(""));
      const b = new Buffer(io);

      for (const s of fragments) {
        expect(b.skip(s.length)).toEqual(s.length);
      }
      expect(b.isEmpty()).toEqual(true);
      expect(b.skip(1)).toEqual(0);
    }
  }, 30_000);

  it("random skip_all", () => {
    for (let i = 0; i < 50; i++) {
      const fragments: string[] = [];

      for (let j = rand(4); j > 0; j--) {
        const n = rand(1024 * 1400);
        const s = bytes(n);
        fragments.push(s);
      }

      const io = new StringIO(fragments.join(""));
      const b = new Buffer(io);

      for (const s of fragments) {
        expect(() => {
          b.skipAll(s.length);
        }).not.toThrow();
      }
      expect(b.isEmpty()).toEqual(true);
      expect(() => {
        b.skipAll(1);
      }).toThrow(EOFError);
    }
  }, 30_000);

  it("random write and flush", () => {
    for (let i = 0; i < 50; i++) {
      let s = bytes(0);
      const io = new StringIO();
      const b = new Buffer(io);

      for (let j = rand(4); j > 0; j--) {
        const n = rand(1024 * 1400);
        const x = bytes(n);
        s += x;
        b.write(bin(x));
      }

      expect(io.string().length + b.size()).toEqual(s.length);

      b.flush();

      expect(io.string().length).toEqual(s.length);
      expect(io.string()).toEqual(s);
    }
  }, 30_000);

  it("random write and clear", () => {
    const b = new Buffer();

    for (let i = 0; i < 50; i++) {
      let s = bytes(0);

      for (let j = rand(4); j > 0; j--) {
        const n = rand(1024 * 1400);
        const x = bytes(n);
        s += x;
        b.write(bin(x));
      }

      expect(b.size()).toEqual(s.length);
      b.clear();
    }
  }, 30_000);
});
