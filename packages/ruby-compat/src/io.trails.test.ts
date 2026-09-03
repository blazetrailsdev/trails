import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { File } from "./file.js";
import { IO, puts } from "./io.js";

describe("IO", () => {
  it("binwrite writes the string and answers its byte count", () => {
    const path = join(mkdtempSync(join(tmpdir(), "trails-io-")), "secret.enc");
    expect(IO.binwrite(path, "abc def")).toBe(7);
    expect(readFileSync(path, "utf-8")).toBe("abc def");
  });

  it("readlines answers every line, each keeping its separator", () => {
    const path = join(mkdtempSync(join(tmpdir(), "trails-io-")), "a.rb");
    writeFileSync(path, "one\ntwo\n");
    expect(IO.readlines(path)).toEqual(["one\n", "two\n"]);
  });

  it("read answers nil rather than an empty String once the stream is at EOF", () => {
    // vendor/ruby/io.c:3774 — a positive length past the end is nil.
    const path = join(mkdtempSync(join(tmpdir(), "trails-io-")), "bytes");
    writeFileSync(path, "abcdef");
    File.open(path, "rb", (file) => {
      expect(file.seek(2)).toBe(0);
      expect(file.read(3)).toBe("cde");
      expect(file.read(3)).toBe("f");
      expect(file.read(3)).toBe(null);
    });
  });

  it("puts is one body, mixed into any receiver carrying a write", () => {
    const written: string[] = [];
    const out = { write: (string: string) => written.push(string) };
    expect(puts.call(out, "a", ["b", ["c"]], 1)).toBe(null);
    expect(written.join("")).toBe("a\nb\nc\n1\n");
  });
});
