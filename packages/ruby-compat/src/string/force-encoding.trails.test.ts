import { describe, it, expect } from "vitest";
import { forceEncoding } from "./force-encoding.js";
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
});
