import { describe, expect, it } from "vitest";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { File } from "./file.js";
import { Zlib } from "./zlib.js";

/**
 * Expected values are MRI's, from
 * `ruby -rzlib -e 'puts Zlib.crc32(...)'` against
 * `vendor/ruby/ext/zlib/zlib.c:507`.
 */
describe("Zlib.crc32", () => {
  it("answers 0 for no argument and for the empty string", () => {
    expect(Zlib.crc32()).toBe(0);
    expect(Zlib.crc32("")).toBe(0);
  });

  it("answers MRI's checksum for an ASCII string", () => {
    expect(Zlib.crc32("hello")).toBe(907060870);
    expect(Zlib.crc32("The quick brown fox")).toBe(3074782430);
    expect(Zlib.crc32("blog_development")).toBe(434552276);
    expect(Zlib.crc32("logo.png")).toBe(2915011424);
  });

  it("checksums the bytes of a multibyte string", () => {
    expect(Zlib.crc32("héllo")).toBe(2654700086);
  });

  it("continues from the given crc", () => {
    expect(Zlib.crc32("abc", 42)).toBe(16679668);
    expect(Zlib.crc32("lo", Zlib.crc32("hel"))).toBe(Zlib.crc32("hello"));
  });
});

/**
 * `Zlib::GzipWriter.open` / `Zlib::GzipReader.open`
 * (`vendor/ruby/ext/zlib/zlib.c:3661,3871`, both `gzfile_s_open`), the pair
 * `SchemaCache.read` and `#dump_to` open a `.gz` through.
 */
describe("Zlib::GzipFile.open", () => {
  it("round-trips a string through a gzip file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trails-zlib-"));
    try {
      const filename = join(dir, "schema_cache.json.gz");
      await Zlib.GzipWriter.open(filename, (gz) => gz.write('{"version":1}'));

      expect(await Zlib.GzipReader.open(filename, (gz) => gz.read())).toBe('{"version":1}');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("closes the stream on the way out of the block", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trails-zlib-"));
    try {
      const filename = join(dir, "empty.gz");
      await Zlib.GzipWriter.open(filename, (gz) => gz.write(""));

      expect(File.size(filename) > 0).toBe(true);
      expect(await Zlib.GzipReader.open(filename, (gz) => gz.read())).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
