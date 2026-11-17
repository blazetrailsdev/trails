import { describe, expect, it } from "vitest";
import { Hash, NoMethodError, StringIO, Tempfile } from "@blazetrails/ruby-compat";
import { MessagePack } from "../lib/index.js";

const bytes = (string: string) => Uint8Array.from(string, (c) => c.charCodeAt(0));
const utf8enc = (str: string) => str;
const asciienc = (str: string) => bytes(str);

describe("MessagePack", () => {
  const tests: Record<string, [string, unknown, string][]> = {
    "constant values": [
      ["true", true, "\xC3"],
      ["false", false, "\xC2"],
      ["nil", null, "\xC0"],
    ],
    numbers: [
      ["zero", 0, "\x00"],
      ["127", 127, "\x7F"],
      ["128", 128, "\xCC\x80"],
      ["256", 256, "\xCD\x01\x00"],
      ["-1", -1, "\xFF"],
      ["-33", -33, "\xD0\xDF"],
      ["-129", -129, "\xD1\xFF\x7F"],
      ["small integers", 42, "*"],
      ["medium integers", 333, "\xCD\x01M"],
      ["large integers", 2 ** 31 - 1, "\xCE\x7F\xFF\xFF\xFF"],
      ["huge integers", 2n ** 64n - 1n, "\xCF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF"],
      ["negative integers", -1, "\xFF"],
      ["1.0", new Number(1.0), "\xcb\x3f\xf0\x00\x00\x00\x00\x00\x00"],
      ["small floats", 3.14, "\xCB@\t\x1E\xB8Q\xEB\x85\x1F"],
      [
        "big floats",
        new Number(Math.PI * 1_000_000_000_000_000_000),
        "\xCBC\xC5\xCC\x96\xEF\xD1\x19%",
      ],
      ["negative floats", -2.1, "\xCB\xC0\x00\xCC\xCC\xCC\xCC\xCC\xCD"],
    ],
    strings: [
      ["tiny strings", utf8enc("hello world"), "\xABhello world"],
      ["short strings", utf8enc("hello".repeat(5)), "\xB9hellohellohellohellohello"],
      ["empty strings", utf8enc(""), "\xA0"],
    ],
    "binary strings": [
      ["tiny strings", asciienc("hello world"), "\xC4\vhello world"],
      ["short strings", asciienc("hello".repeat(5)), "\xC4\x19hellohellohellohellohello"],
      ["empty strings", asciienc(""), "\xC4\x00"],
    ],
    arrays: [
      ["empty arrays", [], "\x90"],
      ["arrays with strings", [utf8enc("hello"), utf8enc("world")], "\x92\xA5hello\xA5world"],
      [
        "arrays with mixed values",
        [utf8enc("hello"), utf8enc("world"), 42],
        "\x93\xA5hello\xA5world*",
      ],
      ["arrays of arrays", [[[[1, 2], 3], 4]], "\x91\x92\x92\x92\x01\x02\x03\x04"],
      ["empty arrays", [], "\x90"],
    ],
    hashes: [
      ["empty hashes", {}, "\x80"],
      ["hashes", { [utf8enc("foo")]: utf8enc("bar") }, "\x81\xA3foo\xA3bar"],
      [
        "hashes with mixed keys and values",
        new Hash<unknown, unknown>()
          .set(utf8enc("foo"), utf8enc("bar"))
          .set(3, utf8enc("three"))
          .set(utf8enc("four"), 4)
          .set(utf8enc("x"), [utf8enc("y")])
          .set(utf8enc("a"), utf8enc("b")),
        "\x85\xA3foo\xA3bar\x03\xA5three\xA4four\x04\xA1x\x91\xA1y\xA1a\xA1b",
      ],
      [
        "hashes of hashes",
        new Hash<unknown, unknown>().set(
          { [utf8enc("x")]: { [utf8enc("y")]: utf8enc("z") } },
          utf8enc("s"),
        ),
        "\x81\x81\xA1x\x81\xA1y\xA1z\xA1s",
      ],
      ["hashes with nils", { [utf8enc("foo")]: null }, "\x81\xA3foo\xC0"],
    ],
  };

  for (const [ctx, its] of Object.entries(tests)) {
    describe(`with ${ctx}`, () => {
      for (const [desc, unpacked, packed] of its) {
        it(`encodes ${desc}`, () => {
          expect(MessagePack.pack(unpacked)).toEqual(bytes(packed));
        });

        it(`decodes ${desc}`, () => {
          expect(MessagePack.unpack(bytes(packed))).toEqual(unpacked);
        });
      }
    });
  }

  describe("using other names for .pack and .unpack", () => {
    it("can unpack with .load", () => {
      expect(MessagePack.load(bytes("\xABhello world"))).toBe("hello world");
    });

    it("can pack with .dump", () => {
      expect(MessagePack.dump(utf8enc("hello world"))).toEqual(bytes("\xABhello world"));
    });
  });

  describe("with symbols", () => {
    it("encodes symbols as strings", () => {
      expect(MessagePack.pack(":symbol")).toEqual(bytes("\xA6symbol"));
    });
  });

  describe("with different external encoding", () => {
    // PERMANENT-SKIP: a JS string has no encoding to transcode from (CLAUDE.md, "A String has no encoding tag either").
    it.skip("transcodes strings when encoding", () => {});
  });

  describe("with other things", () => {
    it("raises an error on #pack with an unsupported type", () => {
      expect(() => MessagePack.pack(new (class {})())).toThrow(
        expect.toSatisfy(
          (e) => e instanceof NoMethodError && /undefined method .*toMsgpack/.test(e.message),
        ),
      );
    });

    it("raises an error on #unpack with garbage", () => {
      expect(() => MessagePack.unpack("asdka;sd")).toThrow(MessagePack.UnpackError);
    });
  });

  describe("extensions", () => {
    it("can unpack hashes with symbolized keys", () => {
      const packed = MessagePack.pack({ hello: "world", nested: ["object", { structure: true }] });
      const unpacked = MessagePack.unpack(packed, { symbolizeKeys: true });
      expect(unpacked).toEqual({
        ":hello": "world",
        ":nested": ["object", { ":structure": true }],
      });
    });

    it("does not symbolize keys even if other options are present", () => {
      const packed = MessagePack.pack({ hello: "world", nested: ["object", { structure: true }] });
      const unpacked = MessagePack.unpack(packed, { otherOption: false });
      expect(unpacked).toEqual({ hello: "world", nested: ["object", { structure: true }] });
    });

    it("can unpack strings with a specified encoding", () => {
      const packed = MessagePack.pack({ [utf8enc("hello")]: utf8enc("world") });
      const unpacked = MessagePack.unpack(packed) as Record<string, unknown>;
      expect(typeof unpacked["hello"]).toBe("string");
    });

    // PERMANENT-SKIP: a JS string has no encoding to transcode from (CLAUDE.md, "A String has no encoding tag either").
    it.skip("can pack strings with a specified encoding", () => {});
  });

  describe("in compatibility mode", () => {
    it("does not use the bin types", () => {
      let packed = MessagePack.pack(bytes("hello"), { compatibilityMode: true });
      expect(packed).toEqual(bytes("\xA5hello"));
      packed = MessagePack.pack(bytes("hello".repeat(100)), { compatibilityMode: true });
      expect(packed!.subarray(0, 3)).toEqual(bytes("\xDA\x01\xF4"));
    });

    it("does not use the str8 type", () => {
      const packed = MessagePack.pack("x".repeat(32), { compatibilityMode: true });
      expect(packed!.subarray(0, 3)).toEqual(bytes("\xDA\x00\x20"));
    });
  });

  describe("when a Bignum has a small value", () => {
    for (const [desc, unpacked, packed] of tests["numbers"].slice(0, 10)) {
      it(`encodes ${desc} to the smallest representation`, () => {
        const bignum = BigInt(unpacked as number);
        expect(MessagePack.pack(bignum)).toEqual(bytes(packed));
      });
    }
  });

  describe("when the source is na IO-like object", () => {
    it("work with IO destination object as 2nd argument of MessagePack.pack", () => {
      Tempfile.create("pack-test", undefined, (io) => {
        const returnValue = MessagePack.pack(utf8enc("hello world"), io);
        expect(returnValue).toBeNull();

        io.rewind();
        expect(io.binmode().read()).toEqual(bytes("\xABhello world"));
      });
    });

    it("work with IO-like StringIO destination object as 2nd argument of MessagePack.pack", () => {
      const io = new StringIO();
      const returnValue = MessagePack.pack(utf8enc("hello world"), io);
      expect(returnValue).toBeNull();

      io.rewind();
      expect(bytes(io.read())).toEqual(bytes("\xABhello world"));
    });

    it("work with IO source object as source of MessagePack.unpack", () => {
      Tempfile.create("unpack-test", undefined, (io) => {
        MessagePack.pack(utf8enc("hello world"), io);
        io.rewind();

        const returnValue = MessagePack.unpack(io);
        expect(returnValue).toEqual(utf8enc("hello world"));
      });
    });

    it("work with IO-like StringIO object of MessagePack.unpack", () => {
      const io = new StringIO();
      MessagePack.pack(utf8enc("hello world"), io);
      io.rewind();

      const returnValue = MessagePack.unpack(io);
      expect(returnValue).toEqual(utf8enc("hello world"));
    });
  });
});
