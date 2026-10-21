import { describe, it, expect } from "vitest";
import { b } from "./b.js";
import { forceEncoding } from "./force-encoding.js";
import { Encoding } from "../encoding.js";
import { EncodingError } from "../encoding-error.js";
import { rbFSend } from "../object.js";
import { rbEqual } from "../rb-equal.js";
import { StringIO } from "../string-io.js";

describe("b", () => {
  it("copies the receiver rather than re-encoding it in place", () => {
    const str = "café";
    expect(b(str)).not.toBe(str);
    expect(str).toBe("café");
  });

  it("answers the receiver's bytes", () => {
    expect(b("café")).toEqual(new Uint8Array([0x63, 0x61, 0x66, 0xc3, 0xa9]));
  });

  it("answers a copy of a String held as its bytes", () => {
    const bin = new Uint8Array([0x63, 0xc3, 0xa9, 0xff]);
    expect(b(bin)).toEqual(bin);
    expect(b(bin)).not.toBe(bin);
  });

  it("answers 7-bit ASCII byte for character", () => {
    expect(b("Content-Disposition")).toEqual(new TextEncoder().encode("Content-Disposition"));
  });

  it("preserves the receiver's bytes, so reading them back under UTF-8 restores it", () => {
    expect(forceEncoding(b("café"), Encoding.UTF_8)).toBe("café");
    expect(forceEncoding(b("café"), Encoding.BINARY)).toEqual(b("café"));
  });

  it("answers a surrogate-carried invalid byte as that byte", () => {
    expect(b("\udcff\udcd8\udcff")).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });
});

describe("an ASCII-8BIT String's methods", () => {
  it("answers bytesize as its byte count", () => {
    expect(rbFSend(b("ÐÏ"), "bytesize")).toBe(4);
    expect(rbFSend(Uint8Array.of(0xd0, 0xcf), "bytesize")).toBe(2);
  });

  it("compares by bytes for == and eql?", () => {
    expect(rbFSend(b("ab"), "equals", "ab")).toBe(true);
    expect(rbFSend(b("ab"), "eql", b("ab"))).toBe(true);
    expect(rbFSend(Uint8Array.of(0xff), "equals", Uint8Array.of(0xfe))).toBe(false);
  });

  it("joins bytes with +, and raises for a non-ASCII UTF-8 operand", () => {
    expect(rbFSend(b("a"), "plus", b("b"))).toEqual(b("ab"));
    expect(rbFSend(b("a"), "plus", "b")).toEqual(b("ab"));
    expect(() => rbFSend(Uint8Array.of(0xff), "plus", "é")).toThrow(EncodingError);
  });

  it("slices by byte", () => {
    expect(rbFSend(Uint8Array.of(0xff, 0xfe), "byteslice", 0, 1)).toEqual(Uint8Array.of(0xff));
    expect(rbFSend(b("ab"), "isStartWith", "a")).toBe(true);
    expect(rbFSend(Uint8Array.of(0xff), "isEmpty")).toBe(false);
  });

  it("is what a length read of a binary IO answers", () => {
    const io = new StringIO(Uint8Array.of(0xd0, 0xcf, 0x11));
    const read = io.read(2)!;
    expect(rbFSend(read, "bytesize")).toBe(2);
    expect(rbEqual(read, Uint8Array.of(0xd0, 0xcf))).toBe(true);
  });
});
