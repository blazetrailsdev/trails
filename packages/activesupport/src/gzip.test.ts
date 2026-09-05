import { describe, it, expect } from "vitest";
import { Gzip } from "./gzip.js";
import { constants } from "node:zlib";
import { assertNot } from "./testing/assertions.js";

describe("GzipTest", () => {
  it("compress should decompress to the same value", () => {
    expect(Gzip.decompress(Gzip.compress("Hello World"))).toBe("Hello World");
    expect(Gzip.decompress(Gzip.compress("Hello World", constants.Z_NO_COMPRESSION))).toBe(
      "Hello World",
    );
    expect(Gzip.decompress(Gzip.compress("Hello World", constants.Z_BEST_SPEED))).toBe(
      "Hello World",
    );
    expect(Gzip.decompress(Gzip.compress("Hello World", constants.Z_BEST_COMPRESSION))).toBe(
      "Hello World",
    );
    expect(Gzip.decompress(Gzip.compress("Hello World", undefined, constants.Z_FILTERED))).toBe(
      "Hello World",
    );
    expect(Gzip.decompress(Gzip.compress("Hello World", undefined, constants.Z_HUFFMAN_ONLY))).toBe(
      "Hello World",
    );
    expect(Gzip.decompress(Gzip.compress("Hello World", undefined, undefined))).toBe("Hello World");
  });

  it("compress should return a binary string", () => {
    const compressed = Gzip.compress("");

    expect(typeof compressed).toBe("string");
    assertNot(!compressed, "a compressed blank string should not be blank");
  });

  it("compress should return gzipped string by compression level", () => {
    const sourceString = "Hello World".repeat(100);

    const gzippedBySpeed = Gzip.compress(sourceString, constants.Z_BEST_SPEED);
    expect(Gzip.decompress(gzippedBySpeed)).toBe(sourceString);

    const gzippedByBestCompression = Gzip.compress(sourceString, constants.Z_BEST_COMPRESSION);
    expect(Gzip.decompress(gzippedByBestCompression)).toBe(sourceString);

    expect(gzippedByBestCompression.length < gzippedBySpeed.length).toBe(true);
  });

  it("decompress checks crc", () => {
    const compressed = Gzip.compress("test");
    const buf = Buffer.from(compressed, "latin1");
    buf[buf.length - 1] ^= 0xff;
    expect(() => Gzip.decompress(buf.toString("latin1"))).toThrow();
  });
});
