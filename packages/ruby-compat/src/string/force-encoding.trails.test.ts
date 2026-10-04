import { describe, it, expect } from "vitest";
import { forceEncoding, rbObjEncoding } from "./force-encoding.js";
import { Encoding } from "../encoding.js";
import { ArgumentError } from "../argument-error.js";

describe("forceEncoding", () => {
  it("returns the buffer unchanged for a binary encoding", () => {
    const bytes = "cafÃ©";
    expect(forceEncoding(bytes, "BINARY")).toBe(bytes);
    expect(forceEncoding(bytes, "ASCII-8BIT")).toBe(bytes);
    expect(forceEncoding(bytes, "binary")).toBe(bytes);
  });

  it("reads the buffer's bytes back under the named encoding", () => {
    expect(forceEncoding("cafÃ©", "UTF-8")).toBe("café");
    expect(forceEncoding("é", "ISO-8859-1")).toBe("é");
  });

  it("masks each character to its low byte", () => {
    expect(forceEncoding("Ł", "BINARY")).toBe("Ł");
    expect(forceEncoding("Ã©", "UTF-8")).toBe("é");
  });
});

describe("forceEncoding resolves its argument through the Ruby registry", () => {
  it("decodes under a Ruby name TextDecoder does not take", () => {
    const sjis = String.fromCharCode(0x82, 0xa0);
    expect(forceEncoding(sjis, "CP932")).toBe("あ");
    expect(forceEncoding(sjis, "Windows-31J")).toBe("あ");
  });

  it("raises ArgumentError for a name outside the registry, as rb_to_encoding does", () => {
    expect(() => forceEncoding("abc", "no-such-encoding")).toThrow(ArgumentError);
  });

  it("spells bytes valid in the encoding as the string they encode", () => {
    expect(forceEncoding(new TextEncoder().encode("café"), "UTF-8")).toBe("café");
  });

  it("keeps bytes broken in the encoding and associates them with it", () => {
    const bytes = Uint8Array.of(0x78, 0x9c, 0xff);
    expect(rbObjEncoding(bytes)).toBe(Encoding.ASCII_8BIT);
    expect(forceEncoding(bytes, "UTF-8")).toBe(bytes);
    expect(rbObjEncoding(bytes)).toBe(Encoding.UTF_8);
    expect(forceEncoding(bytes, "ASCII-8BIT")).toBe(bytes);
    expect(rbObjEncoding(bytes)).toBe(Encoding.ASCII_8BIT);
  });

  it("reads a JS string as UTF-8", () => {
    expect(rbObjEncoding("café")).toBe(Encoding.UTF_8);
  });
});
