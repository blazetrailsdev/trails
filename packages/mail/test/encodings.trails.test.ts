import { describe, expect, it } from "vitest";
import { forceEncoding } from "@blazetrails/ruby-compat";
import { Encodings } from "../lib/encodings.js";

describe("Encodings.eachChunkByterange", () => {
  it("keeps a Shift_JIS character whole across chunks", () => {
    const str = forceEncoding(Uint8Array.of(0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea), "Shift_JIS");
    const chunks: unknown[] = [];
    Encodings.eachChunkByterange(str, 3, (chunk) => chunks.push(Array.from(chunk as never)));
    expect(chunks).toEqual([
      [0x93, 0xfa],
      [0x96, 0x7b],
      [0x8c, 0xea],
    ]);
  });

  it("keeps a UTF-8 character whole across chunks", () => {
    const chunks: unknown[] = [];
    Encodings.eachChunkByterange("日本", 4, (chunk) => chunks.push(chunk));
    expect(chunks).toEqual(["日", "本"]);
  });

  it("sizes each byte of an invalid sequence as its own character", () => {
    const str = forceEncoding(Uint8Array.of(0xe3, 0x81, 0x41), "UTF-8");
    const chunks: unknown[] = [];
    Encodings.eachChunkByterange(str, 1, (chunk) => chunks.push(Array.from(chunk as never)));
    expect(chunks).toEqual([[0xe3], [0x81], [0x41]]);
  });

  it("keeps an encoded U+FFFD whole", () => {
    const str = forceEncoding(Uint8Array.of(0x84, 0x31, 0xa4, 0x37), "GB18030");
    const chunks: unknown[] = [];
    Encodings.eachChunkByterange(str, 4, (chunk) => chunks.push(Array.from(chunk as never)));
    expect(chunks).toEqual([[0x84, 0x31, 0xa4, 0x37]]);
  });
});
