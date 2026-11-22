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
});
