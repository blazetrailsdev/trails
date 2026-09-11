import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Encoding } from "./encoding.js";
import { File } from "./file.js";
import { IO, puts } from "./io.js";
import { InvalidByteSequenceError } from "./invalid-byte-sequence-error.js";
import { stderr } from "./process-adapter.js";

describe("IO", () => {
  it("binwrite writes the string and answers its byte count", () => {
    const path = join(mkdtempSync(join(tmpdir(), "trails-io-")), "secret.enc");
    expect(IO.binwrite(path, "abc def")).toBe(7);
    expect(readFileSync(path, "utf-8")).toBe("abc def");
  });

  it("binread answers one character per byte, and binwrite writes them back", () => {
    const path = join(mkdtempSync(join(tmpdir(), "trails-io-")), "bytes.bin");
    writeFileSync(path, "héllo 日本");
    const bytes = IO.binread(path);
    expect(bytes.length).toBe(statSync(path).size);
    expect(bytes).not.toBe("héllo 日本");

    const copy = join(mkdtempSync(join(tmpdir(), "trails-io-")), "copy.bin");
    expect(IO.binwrite(copy, bytes)).toBe(bytes.length);
    expect(IO.binread(copy)).toBe(bytes);
    expect(readFileSync(copy, "utf-8")).toBe("héllo 日本");
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

  it("read fills the str buffer it is handed, and empties it at EOF", () => {
    // vendor/ruby/io.c:3778 — `read(length, str)` fills str; io.c:3800 resizes
    const path = join(mkdtempSync(join(tmpdir(), "trails-io-")), "buffered");
    writeFileSync(path, "abcdef");
    const str = new Uint8Array(3);
    File.open(path, "rb", (file) => {
      expect(file.read(3, str)).toBe("abc");
      expect([...str]).toEqual([0x61, 0x62, 0x63]);
      expect(file.read(null, str)).toBe("def");
      expect([...str]).toEqual([0x64, 0x65, 0x66]);
      expect(file.read(3, str)).toBe(null);
      expect([...str]).toEqual([0, 0, 0]);
    });
  });

  it("puts is one body, mixed into any receiver carrying a write", () => {
    const written: string[] = [];
    const out = { write: (string: string) => written.push(string) };
    expect(puts.call(out, "a", ["b", ["c"]], 1)).toBe(null);
    expect(written.join("")).toBe("a\nb\nc\n1\n");
  });

  it("read answers the external encoding, and ASCII-8BIT when given a length", () => {
    const path = join(mkdtempSync(join(tmpdir(), "trails-io-")), "utf8.txt");
    const file = File.open(path, "w+");
    expect(file.write("héllo")).toBe(6);
    file.rewind();
    expect(file.read()).toBe("héllo");
    file.rewind();
    expect(file.read(3)).toBe("h\u00c3\u00a9");
    file.close();
  });

  it("read keeps the bytes on a binary stream, and write sends them unchanged", () => {
    const path = join(mkdtempSync(join(tmpdir(), "trails-io-")), "bin.dat");
    const file = File.open(path, "w+");
    file.binmode();
    expect(file.write("h\u00c3\u00a9llo")).toBe(6);
    file.rewind();
    expect(file.read()).toBe("h\u00c3\u00a9llo");
    file.close();
    expect(File.binread(path)).toBe("h\u00c3\u00a9llo");
  });

  it("write sends a Uint8Array's bytes unchanged, whatever the stream's encoding", () => {
    const path = join(mkdtempSync(join(tmpdir(), "trails-io-")), "bytes.dat");
    const file = File.open(path, "w:UTF-8");
    expect(file.write(new Uint8Array([0x68, 0xc3, 0xa9, 0xff]))).toBe(4);
    file.close();
    expect(File.binread(path)).toBe("h\u00c3\u00a9\u00ff");
  });

  it("read answers the mode string's external encoding, and write transcodes to it", () => {
    // vendor/ruby/io.c:6883-6886 — everything after the mode's `:` is the encoding.
    const path = join(mkdtempSync(join(tmpdir(), "trails-io-")), "latin1.txt");
    writeFileSync(path, Uint8Array.from([0x68, 0xe9, 0x6c]));
    File.open(path, "r:ISO-8859-1", (file) => {
      expect(file.externalEncoding()).toBe(Encoding.find("ISO-8859-1"));
      expect(file.read()).toBe("hél");
    });
    const binary = File.open(path, "r", { externalEncoding: "ASCII-8BIT" });
    expect(binary.read()).toBe("h\u00e9l");
    binary.close();
  });

  it("write raises rather than sending the bytes of an encoding the stream did not ask for", () => {
    // vendor/ruby/io.c:1904 do_writeconv — TextEncoder produces UTF-8 and nothing else.
    const path = join(mkdtempSync(join(tmpdir(), "trails-io-")), "conv.txt");
    const file = File.open(path, "w:ISO-8859-1");
    expect(() => file.write("hél")).toThrow("code converter not found (UTF-8 to ISO-8859-1)");
    file.close();
  });

  it("read decodes the UTF-32 seats, and raises rather than leaking TextDecoder's RangeError", () => {
    // vendor/ruby/transcode.c:2097 rb_econv_open_exc — a converter this platform lacks.
    const dir = mkdtempSync(join(tmpdir(), "trails-io-"));
    const utf32le = join(dir, "u32le.bin");
    writeFileSync(
      utf32le,
      Uint8Array.from([0x68, 0, 0, 0, 0xe9, 0, 0, 0, 0x6c, 0, 0, 0, 0x6c, 0, 0, 0, 0x6f, 0, 0, 0]),
    );
    File.open(utf32le, "rb:UTF-32LE", (file) => {
      expect(file.read()).toBe("héllo");
    });

    const utf32be = join(dir, "u32be.bin");
    writeFileSync(utf32be, Uint8Array.from([0, 0, 0, 0x68, 0, 0, 0, 0xe9, 0, 0, 0, 0x6c]));
    File.open(utf32be, "rb:UTF-32BE", (file) => {
      expect(file.read()).toBe("hél");
    });

    const bad = join(dir, "u32bad.bin");
    writeFileSync(bad, Uint8Array.from([0x68, 0, 0, 0, 0, 0, 0x11, 0]));
    File.open(bad, "rb:UTF-32LE", (file) => {
      expect(file.read()).toBe("h\ufffd");
    });

    const euctw = join(dir, "euctw.bin");
    writeFileSync(euctw, Uint8Array.from([0xa1, 0xa1]));
    File.open(euctw, "rb:EUC-TW", (file) => {
      expect(() => file.read()).toThrow("code converter not found (EUC-TW to UTF-8)");
    });
  });

  it("read dispatches the UTF-16 and UTF-32 dummy seats on the BOM", () => {
    // vendor/ruby/enc/trans/utf_16_32.trans:278,327 fun_si_from_utf_16 / fun_si_from_utf_32.
    const dir = mkdtempSync(join(tmpdir(), "trails-io-"));
    const cases: [string, string, number[]][] = [
      ["u16be.bin", "UTF-16", [0xfe, 0xff, 0, 0x68, 0, 0x69]],
      ["u16le.bin", "UTF-16", [0xff, 0xfe, 0x68, 0, 0x69, 0]],
      ["u32be.bin", "UTF-32", [0, 0, 0xfe, 0xff, 0, 0, 0, 0x68, 0, 0, 0, 0x69]],
      ["u32le.bin", "UTF-32", [0xff, 0xfe, 0, 0, 0x68, 0, 0, 0, 0x69, 0, 0, 0]],
    ];
    for (const [name, encoding, bytes] of cases) {
      const path = join(dir, name);
      writeFileSync(path, Uint8Array.from(bytes));
      File.open(path, `rb:${encoding}`, (file) => {
        expect(file.read()).toBe("hi");
      });
    }

    const previousInternal = Encoding.defaultInternal;
    Encoding.defaultInternal = "UTF-8";
    try {
      const nobom = join(dir, "nobom.bin");
      writeFileSync(nobom, Uint8Array.from([0, 0x68, 0, 0x69]));
      File.open(nobom, "rb:UTF-16", (file) => {
        let error: unknown;
        try {
          file.read();
        } catch (e) {
          error = e;
        }
        expect(error).toBeInstanceOf(InvalidByteSequenceError);
        const invalid = error as InvalidByteSequenceError;
        expect(invalid.message).toBe('"\\x00h" on UTF-16');
        expect(invalid.errorBytes()).toBe("\x00h");
        expect(invalid.readagainBytes()).toBeNull();
        expect(invalid.isIncompleteInput()).toBe(false);
        expect(invalid.sourceEncodingName()).toBe("UTF-16");
        expect(invalid.destinationEncodingName()).toBe("UTF-8");
      });
      File.open(nobom, "rb:UTF-32", (file) => {
        expect(() => file.read()).toThrow('"\\x00h\\x00i" on UTF-32');
      });

      const one = join(dir, "one.bin");
      writeFileSync(one, Uint8Array.from([0]));
      File.open(one, "rb:UTF-16", (file) => {
        expect(() => file.read()).toThrow('incomplete "\\x00" on UTF-16');
      });
      File.open(one, "rb:UTF-32", (file) => {
        expect(() => file.read()).toThrow('incomplete "\\x00" on UTF-32');
      });

      const empty = join(dir, "empty.bin");
      writeFileSync(empty, Uint8Array.from([]));
      for (const encoding of ["UTF-16", "UTF-32"]) {
        File.open(empty, `rb:${encoding}`, (file) => {
          expect(file.read()).toBe("");
        });
      }
    } finally {
      Encoding.defaultInternal = previousInternal;
    }
  });

  it("read falls back to Encoding.default_external where the stream carries none", () => {
    // vendor/ruby/io.c:1010 io_read_encoding.
    const path = join(mkdtempSync(join(tmpdir(), "trails-io-")), "default.txt");
    writeFileSync(path, "héllo");
    const file = File.open(path, "r");
    expect(file.externalEncoding()).toBe(Encoding.defaultExternal);
    expect(file.read()).toBe("héllo");
    file.close();
  });

  it("set_encoding parses a one-argument 'enc2:enc' the way a mode string's encoding half is", () => {
    // vendor/ruby/io.c:11704-11707 io_encoding_set routes a String through parse_mode_enc.
    const path = join(mkdtempSync(join(tmpdir(), "trails-io-")), "pair.txt");
    writeFileSync(path, "hi");
    const cases: [string, string | null, string | null][] = [
      ["UTF-8:EUC-JP", "UTF-8", "EUC-JP"],
      ["UTF-8:-", "UTF-8", null],
      ["UTF-8:UTF-8", "UTF-8", null],
      ["EUC-JP", "EUC-JP", null],
      ["BINARY:EUC-JP", "ASCII-8BIT", null],
    ];
    for (const [argument, external, internal] of cases) {
      const file = File.open(path, "r");
      file.setEncoding(argument);
      expect([
        argument,
        file.externalEncoding()?.name ?? null,
        file.internalEncoding()?.name ?? null,
      ]).toEqual([argument, external, internal]);
      file.close();
    }
  });

  it("a bom| mode prefix opens under the encoding it names", () => {
    // vendor/ruby/io.c:6480-6483, 6671-6681
    const path = join(mkdtempSync(join(tmpdir(), "trails-io-")), "bom.txt");
    writeFileSync(path, "hi");
    File.open(path, "r:bom|utf-8", (file) => {
      expect(file.externalEncoding()).toBe(Encoding.find("UTF-8"));
    });
  });

  it("a bom| prefix on a non-UTF encoding warns and keeps that encoding", () => {
    // vendor/ruby/io.c:6678 — rb_enc_warn "BOM with non-UTF encoding %s is nonsense".
    const path = join(mkdtempSync(join(tmpdir(), "trails-io-")), "bom.txt");
    writeFileSync(path, "hi");
    const write = vi.spyOn(stderr, "write").mockReturnValue(true);
    try {
      File.open(path, "r:bom|euc-jp", (file) => {
        expect(file.externalEncoding()).toBe(Encoding.find("EUC-JP"));
      });
      expect(write).toHaveBeenCalledWith("BOM with non-UTF encoding euc-jp is nonsense\n");
    } finally {
      write.mockRestore();
    }
  });

  it("set_encoding('internal') leaves no external encoding while default_internal is unset", () => {
    const path = join(mkdtempSync(join(tmpdir(), "trails-io-")), "enc.txt");
    const file = File.open(path, "w+");
    expect(file.setEncoding("internal").externalEncoding()).toBeNull();
    expect(file.setEncoding("external").externalEncoding()).toBe(Encoding.defaultExternal);
    file.close();
  });
});
