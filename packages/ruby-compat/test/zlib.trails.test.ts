import { describe, expect, it } from "vitest";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { File } from "../lib/file.js";
import { StringIO } from "../lib/string-io.js";
import { Zlib } from "../lib/zlib.js";
import { GzipWriter } from "../lib/zlib-adapter.js";

/**
 * Expected values are MRI's, from
 * `ruby -rzlib -e 'puts Zlib.crc32(...)'` against
 * `vendor/ruby/v3.3.11/ext/zlib/zlib.c:507`.
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
 * (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3661,3871`, both `gzfile_s_open`), the pair
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

  it("streams a payload spanning many writes and read chunks", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trails-zlib-"));
    try {
      const filename = join(dir, "large.gz");
      const lines = Array.from({ length: 5000 }, (_, i) => `line ${i} ${Math.sin(i)}\n`);
      await Zlib.GzipWriter.open(filename, (gz) => {
        for (const line of lines) gz.write(line);
      });

      expect(File.size(filename) > 2048).toBe(true);
      expect(await Zlib.GzipReader.open(filename, (gz) => gz.read())).toBe(lines.join(""));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("answers an empty string once the stream is read to the end", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trails-zlib-"));
    try {
      const filename = join(dir, "twice.gz");
      await Zlib.GzipWriter.open(filename, (gz) => gz.write("once"));

      expect(
        await Zlib.GzipReader.open(filename, async (gz) => [await gz.read(), await gz.read()]),
      ).toEqual(["once", ""]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses mtime= once the header is written", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trails-zlib-"));
    try {
      await Zlib.GzipWriter.open(join(dir, "late.gz"), (gz) => {
        gz.write("x");
        expect(() => {
          gz.mtime = 0;
        }).toThrow(Zlib.GzipFile.Error);
      });
      const seam = new GzipWriter({ write() {} });
      seam.write(new Uint8Array([120]));
      expect(() => {
        seam.mtime = 0;
      }).toThrow("header is already written");
      await seam.finish();
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

  it("does not close again a stream the block closed itself", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trails-zlib-"));
    try {
      const implicit = join(dir, "implicit.gz");
      const explicit = join(dir, "explicit.gz");
      await Zlib.GzipWriter.open(implicit, (gz) => {
        gz.mtime = 0;
        gz.write('{"version":1}');
      });
      await Zlib.GzipWriter.open(explicit, async (gz) => {
        gz.mtime = 0;
        gz.write('{"version":1}');
        await gz.close();
      });

      expect(File.size(explicit)).toBe(File.size(implicit));
      expect(await Zlib.GzipReader.open(explicit, (gz) => gz.read())).toBe('{"version":1}');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * `gzfile_write` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2808-2820`), `gzfile_read`
 * (`zlib.c:2894`) and `gzfile_check_footer` (`zlib.c:2780-2805`), checked against
 * `ruby -rzlib -rstringio`.
 */
describe("Zlib::GzipWriter and GzipReader streaming", () => {
  const gzipped = (payload: string): Uint8Array => {
    const io = new StringIO(new Uint8Array(0));
    const gz = new Zlib.GzipWriter(io);
    gz.write(payload);
    gz.finish();
    return io.string();
  };

  it("hands the io the compressed bytes when a sync write returns", () => {
    const io = new StringIO(new Uint8Array(0));
    const gz = new Zlib.GzipWriter(io);
    gz.sync = true;
    gz.write("hello");
    const written = io.string().length;
    gz.write(" world");

    expect(written > 10).toBe(true);
    expect(io.string().length > written).toBe(true);
  });

  it("reads a length at a time, answering nil at the end", async () => {
    const gz = new Zlib.GzipReader(new StringIO(gzipped("hello world")));

    expect([gz.read(5), gz.read(100), gz.read(1)]).toEqual(["hello", " world", null]);
    await gz.close();
  });

  it("raises NoFooter, CRCError and LengthError at the footer", async () => {
    const bytes = gzipped("hello world");
    const truncated = bytes.slice(0, bytes.length - 8);
    const badCrc = bytes.slice();
    badCrc[bytes.length - 8] ^= 0xff;
    const badLength = bytes.slice();
    badLength[bytes.length - 4] ^= 0xff;

    const noFooter = new Zlib.GzipReader(new StringIO(truncated));
    expect(noFooter.read(100)).toBe("hello world");
    expect(() => noFooter.read(1)).toThrow(new Zlib.GzipFile.NoFooter("footer is not found"));
    const crcError = new Zlib.GzipReader(new StringIO(badCrc));
    expect(crcError.read(100)).toBe("hello world");
    expect(() => crcError.read(1)).toThrow(Zlib.GzipFile.CRCError);
    const gz = new Zlib.GzipReader(new StringIO(badLength));
    gz.read();
    await expect(async () => gz.close()).rejects.toThrow("invalid compressed data -- length error");
  });
});
