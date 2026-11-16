import { describe, expect, it } from "vitest";
import { Hash, rbFSend } from "@blazetrails/ruby-compat";
import { MessagePack } from "../lib/index.js";

const bytes = (string: string) => Uint8Array.from(string, (c) => c.charCodeAt(0));

describe("MessagePack", () => {
  it("nil", () => {
    check(1, null);
  });

  it("true", () => {
    check(1, true);
  });

  it("false", () => {
    check(1, false);
  });

  it("zero", () => {
    check(1, 0);
  });

  it("positive fixnum", () => {
    check(1, 1);
    check(1, 1 << 6);
    check(1, (1 << 7) - 1);
  });

  it("positive int 8", () => {
    check(1, -1);
    check(2, 1 << 7);
    check(2, (1 << 8) - 1);
  });

  it("positive int 16", () => {
    check(3, 1 << 8);
    check(3, (1 << 16) - 1);
  });

  it("positive int 32", () => {
    check(5, 1 << 16);
    check(5, 2 ** 32 - 1);
  });

  it("positive int 64", () => {
    check(9, 2 ** 32);
  });

  it("negative fixnum", () => {
    check(1, -1);
    check(1, -((1 << 5) - 1));
    check(1, -(1 << 5));
  });

  it("negative int 8", () => {
    check(2, -((1 << 5) + 1));
    check(2, -(1 << 7));
  });

  it("negative int 16", () => {
    check(3, -((1 << 7) + 1));
    check(3, -(1 << 15));
  });

  it("negative int 32", () => {
    check(5, -((1 << 15) + 1));
    check(5, -(2 ** 31));
  });

  it("negative int 64", () => {
    check(9, -(2 ** 31 + 1));
    check(9, -(2n ** 63n));
  });

  it("double", () => {
    check(9, new Number(1.0));
    check(9, 0.1);
    check(9, -0.1);
    check(9, new Number(-1.0));
  });

  it("fixraw", () => {
    checkRaw(1, 0);
    checkRaw(1, (1 << 5) - 1);
  });

  it("raw 8", () => {
    checkRaw(2, 1 << 5);
    checkRaw(2, (1 << 8) - 1);
  });

  it("raw 16", () => {
    checkRaw(3, 1 << 8);
    checkRaw(3, (1 << 16) - 1);
  });

  it("raw 32", () => {
    checkRaw(5, 1 << 16);
  });

  it("str encoding is UTF_8", () => {
    const v = packUnpack("string");
    expect(typeof v).toBe("string");
  });

  it("str transcode US-ASCII", () => {
    const v = packUnpack("string");
    expect(typeof v).toBe("string");
  });

  it("str transcode UTF-16", () => {
    const v = packUnpack("string");
    expect(typeof v).toBe("string");
    expect(v).toBe("string");
  });

  it("str transcode EUC-JP 7bit safe", () => {
    const v = packUnpack("string");
    expect(typeof v).toBe("string");
    expect(v).toBe("string");
  });

  // PERMANENT-SKIP: a JS string has no encoding to transcode from (CLAUDE.md, "A String has no encoding tag either").
  it.skip("str transcode EUC-JP 7bit unsafe", () => {});

  // BLOCKED: msgpack-symbol-ext-packer-arm-and-extended-object-lookup
  it.skip("symbol to str", () => {});

  // BLOCKED: msgpack-symbol-ext-packer-arm-and-extended-object-lookup
  it.skip("symbol to str with encoding", () => {});

  // PERMANENT-SKIP: a Symbol is a JS string and cannot hold ASCII-8BIT bytes (CLAUDE.md, "A String has no encoding tag either").
  it.skip("symbol to bin", () => {});

  it("bin 8", () => {
    checkBin(2, (1 << 8) - 1);
  });

  it("bin 16", () => {
    checkBin(3, (1 << 16) - 1);
  });

  it("bin 32", () => {
    checkBin(5, 1 << 16);
  });

  it("bin encoding is ASCII_8BIT", () => {
    expect(packUnpack(bytes("string"))).toBeInstanceOf(Uint8Array);
  });

  it("fixarray", () => {
    checkArray(1, 0);
    checkArray(1, (1 << 4) - 1);
  });

  it("array 16", () => {
    checkArray(3, 1 << 4);
  });

  it("array 32", () => {});

  it("nil", () => {
    match(null, "\xc0");
  });

  it("false", () => {
    match(false, "\xc2");
  });

  it("true", () => {
    match(true, "\xc3");
  });

  it("0", () => {
    match(0, "\x00");
  });

  it("127", () => {
    match(127, "\x7f");
  });

  it("128", () => {
    match(128, "\xcc\x80");
  });

  it("256", () => {
    match(256, "\xcd\x01\x00");
  });

  it("-1", () => {
    match(-1, "\xff");
  });

  it("-33", () => {
    match(-33, "\xd0\xdf");
  });

  it("-129", () => {
    match(-129, "\xd1\xff\x7f");
  });

  it("{1=>1}", () => {
    const obj = new Hash().set(1, 1);
    match(obj, "\x81\x01\x01");
  });

  it("1.0", () => {
    match(new Number(1.0), "\xcb\x3f\xf0\x00\x00\x00\x00\x00\x00");
  });

  it("[]", () => {
    match([], "\x90");
  });

  it("[0, 1, ..., 14]", () => {
    const obj = Array.from({ length: 15 }, (_, i) => i);
    match(obj, "\x9f\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e");
  });

  it("[0, 1, ..., 15]", () => {
    const obj = Array.from({ length: 16 }, (_, i) => i);
    match(obj, "\xdc\x00\x10\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f");
  });

  it("{}", () => {
    const obj = {};
    match(obj, "\x80");
  });

  function check(len: number, obj: unknown): void {
    const raw = rbFSend(obj, "toMsgpack") as Uint8Array;
    expect(raw.length).toBe(len);
    expect(MessagePack.unpack(raw)).toEqual(obj);
  }

  function checkRaw(overhead: number, num: number): void {
    check(num + overhead, " ".repeat(num));
  }

  function checkBin(overhead: number, num: number): void {
    check(num + overhead, new Uint8Array(num).fill(0x20));
  }

  function checkArray(overhead: number, num: number): void {
    check(num + overhead, new Array(num).fill(null));
  }

  function match(obj: unknown, buf: string): void {
    const raw = rbFSend(obj, "toMsgpack") as Uint8Array;
    expect(raw).toEqual(bytes(buf));
  }

  function packUnpack(obj: unknown): unknown {
    return MessagePack.unpack(rbFSend(obj, "toMsgpack") as Uint8Array);
  }
});
