import { describe, it, expect } from "vitest";
import { ArgumentError } from "../argument-error.js";
import { ConverterNotFoundError } from "../converter-not-found-error.js";
import { Encoding } from "../encoding.js";
import { InvalidByteSequenceError } from "../invalid-byte-sequence-error.js";
import { UndefinedConversionError } from "../undefined-conversion-error.js";
import { encode } from "./encode.js";
import { forceEncoding, rbObjEncoding } from "./force-encoding.js";

const replace = { invalid: ":replace", undef: ":replace" } as const;
const binary = (...b: number[]) => Uint8Array.of(...b);

describe("String#encode", () => {
  it("converts a leading byte-order mark like any other character", () => {
    expect(encode("\u{feff}a", "US-ASCII", replace)).toBe("?a");
  });

  it("replaces what the destination cannot hold", () => {
    expect(encode(binary(0x68, 0xe9, 0x6c), "US-ASCII", replace)).toBe("h?l");
    expect(encode(binary(0x68, 0xe9, 0x6c), "UTF-8", replace)).toBe("h�l");
    expect(encode("héllo", "US-ASCII", replace)).toBe("h?llo");
    expect(encode("h\udce9l\udcff", "US-ASCII", replace)).toBe("h?l?");
  });

  it("returns the receiver between two equal encodings, scrubbed when invalid: is given", () => {
    expect(encode("héllo", "UTF-8")).toBe("héllo");
    expect(encode("h\udce9l", "UTF-8", { invalid: ":replace" })).toBe("h�l");
    const bytes = binary(0xe9);
    expect(encode(bytes, "BINARY", replace)).toBe(bytes);
    const latin1 = forceEncoding(binary(0x68, 0xe9), "ISO-8859-1");
    expect(encode(latin1, "ISO-8859-1", { invalid: ":replace" })).toBe(latin1);
    const ascii = forceEncoding(binary(0x68, 0xe9), "US-ASCII");
    expect(encode(ascii, "US-ASCII")).toBe(ascii);
    expect(encode(ascii, "US-ASCII", { invalid: ":replace" })).toBe("h?");
  });

  it("answers a non-UTF-8 result as bytes associated with the encoding", () => {
    const latin1 = encode("\u{1F600}é", "ISO-8859-1", { undef: ":replace" }) as Uint8Array;
    expect(Array.from(latin1)).toEqual([63, 233]);
    expect(rbObjEncoding(latin1)).toBe(Encoding.find("ISO-8859-1"));
    expect(encode(latin1, "UTF-8")).toBe("?é");
    expect(rbObjEncoding(encode("abc", "BINARY"))).toBe(Encoding.ASCII_8BIT);
  });

  it("raises UndefinedConversionError with MRI's message", () => {
    expect(() => encode(binary(0x68, 0xe9), "UTF-8")).toThrow(UndefinedConversionError);
    expect(() => encode(binary(0x68, 0xe9), "UTF-8")).toThrow('"\\xE9" from ASCII-8BIT to UTF-8');
    expect(() => encode("héllo", "US-ASCII")).toThrow("U+00E9 from UTF-8 to US-ASCII");
    expect(() => encode(binary(0xe9), "US-ASCII")).toThrow(
      '"\\xE9" to UTF-8 in conversion from ASCII-8BIT to UTF-8 to US-ASCII',
    );
    expect(() => encode(forceEncoding(binary(0xe9), "ISO-8859-1"), "US-ASCII")).toThrow(
      "U+00E9 to US-ASCII in conversion from ISO-8859-1 to UTF-8 to US-ASCII",
    );
  });

  it("raises InvalidByteSequenceError with MRI's message", () => {
    expect(() => encode("h\udce9l", "US-ASCII")).toThrow(InvalidByteSequenceError);
    expect(() => encode("h\udce9l", "US-ASCII")).toThrow('"\\xE9" followed by "l" on UTF-8');
    expect(() => encode("\udce9\udc80l", "US-ASCII")).toThrow(
      '"\\xE9\\x80" followed by "l" on UTF-8',
    );
    expect(() => encode("h\udce9", "US-ASCII")).toThrow('incomplete "\\xE9" on UTF-8');
    expect(() => encode("\udc80l", "US-ASCII")).toThrow('"\\x80" on UTF-8');
    expect(() => encode("\udcc0l", "US-ASCII")).toThrow('"\\xC0" on UTF-8');
    expect(() => encode(forceEncoding(binary(0x68, 0xe9), "US-ASCII"), "UTF-8")).toThrow(
      '"\\xE9" on US-ASCII',
    );
  });

  it("raises for an unknown option value and for a pair with no converter", () => {
    expect(() => encode("a", "UTF-8", { invalid: ":x" as never })).toThrow(ArgumentError);
    expect(() => encode("a", "UTF-8", { invalid: ":x" as never })).toThrow(
      "unknown value for invalid character option",
    );
    expect(() => encode("a", "UTF-8", { undef: ":x" as never })).toThrow(
      "unknown value for undefined character option",
    );
    expect(() => encode("é", "EUC-TW")).toThrow(ConverterNotFoundError);
    expect(() => encode("é", "EUC-TW")).toThrow("code converter not found (UTF-8 to EUC-TW)");
  });
});

describe("encode to ISO-2022-JP", () => {
  const ascii = (b: unknown) => String.fromCharCode(...(b as Uint8Array));

  it("shifts into JIS X 0208 and back to ASCII", () => {
    const encoded = encode("aあb", "ISO-2022-JP") as Uint8Array;
    expect(ascii(encoded)).toBe('a\x1b$B$"\x1b(Bb');
    expect(rbObjEncoding(encoded).name).toBe("ISO-2022-JP");
  });

  it("uses MRI's mapping where WHATWG's differs", () => {
    expect(ascii(encode("〜", "ISO-2022-JP"))).toBe("\x1b$B!A\x1b(B");
    expect(() => encode("～", "ISO-2022-JP")).toThrow(
      "U+FF5E to EUC-JP in conversion from UTF-8 to EUC-JP to stateless-ISO-2022-JP to ISO-2022-JP",
    );
  });

  it("refuses the bytes that would forge a charset shift", () => {
    expect(() => encode("\x1b", "ISO-2022-JP")).toThrow(
      '"\\e" to stateless-ISO-2022-JP in conversion from UTF-8 to EUC-JP to stateless-ISO-2022-JP to ISO-2022-JP',
    );
    expect(() => encode("\x0e", "ISO-2022-JP")).toThrow(UndefinedConversionError);
  });

  it("refuses a fallback the destination cannot hold", () => {
    expect(() => encode("é", "ISO-2022-JP", { fallback: (c) => c })).toThrow(
      "too big fallback string",
    );
  });

  it("refuses a replacement the destination cannot hold", () => {
    expect(() => encode("é", "ISO-2022-JP", { undef: ":replace", replace: "é" })).toThrow(
      ConverterNotFoundError,
    );
  });

  it("replaces an undefined character in ASCII mode", () => {
    expect(ascii(encode("あéa", "ISO-2022-JP", { undef: ":replace" }))).toBe('\x1b$B$"\x1b(B?a');
  });
});
