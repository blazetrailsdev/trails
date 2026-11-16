import { beforeEach, describe, expect, it } from "vitest";
import {
  defineModule,
  EOFError,
  Hash,
  rbObjRespondTo,
  RuntimeError,
  StringIO,
  Tempfile,
  Zlib,
  rbFSend,
  rbObjIsKindOf,
} from "@blazetrails/ruby-compat";
import {
  ExtensionValue,
  Factory,
  MalformedFormatError,
  MessagePack,
  Packer,
  UnexpectedTypeError,
  Unpacker,
} from "../lib/index.js";

const pack = (...c: number[]) => Uint8Array.from(c);
const bytes = (string: string) => Uint8Array.from(string, (c) => c.charCodeAt(0));
const cat = (a: Uint8Array, s: string) => Uint8Array.from([...a, ...bytes(s)]);

class DummyIO {
  private buf = new Uint8Array(0);
  private pos = 0;

  write(val: Uint8Array): void {
    const buf = new Uint8Array(this.buf.length + val.length);
    buf.set(this.buf);
    buf.set(val, this.buf.length);
    this.buf = buf;
  }

  read(length: number | null = null): Uint8Array | null {
    if (this.pos === this.buf.length) {
      return null;
    } else if (length == null) {
      const val = this.buf.slice(this.pos, this.buf.length + 1);
      this.pos = this.buf.length;
      return val;
    } else {
      const val = this.buf.slice(this.pos, this.pos + length + 1);
      this.pos += val.length;
      if (this.pos > this.buf.length) this.pos = this.buf.length;
      return val;
    }
  }

  flush(): void {}

  close(): void {}
}

class ValueOne {
  constructor(readonly data: Uint8Array) {}

  static fromMsgpackExt(data: Uint8Array): ValueOne {
    return new this(data);
  }
}

class ValueTwo extends ValueOne {}

describe("MessagePack::Unpacker", () => {
  let unpacker: Unpacker;
  beforeEach(() => {
    unpacker = new Unpacker();
  });

  it("gets options to specify how to unpack values", () => {
    const u1 = new Unpacker();
    expect(u1.isSymbolizeKeys()).toEqual(false);
    expect(u1.isFreeze()).toEqual(false);
    expect(u1.isAllowUnknownExt()).toEqual(false);

    const u2 = new Unpacker({ symbolizeKeys: true, freeze: true, allowUnknownExt: true });
    expect(u2.isSymbolizeKeys()).toEqual(true);
    expect(u2.isFreeze()).toEqual(true);
    expect(u2.isAllowUnknownExt()).toEqual(true);
  });

  // PERMANENT-SKIP: a JS string has no identity, so dedup and frozenness have no observable arm (CLAUDE.md, "Ruby Strings are JS string primitives").
  it.skip("ensure string hash keys are deduplicated", () => {});

  // PERMANENT-SKIP: a JS string has no identity, so dedup and frozenness have no observable arm (CLAUDE.md, "Ruby Strings are JS string primitives").
  it.skip("ensure strings are not deduplicated", () => {});

  it("gets IO or object which has #read to read data from it", async () => {
    const sampleData = { message: "morning!", num: 1 };
    const samplePacked = MessagePack.pack(sampleData);

    Tempfile.open("for_io", undefined, (file) => {
      file.sync = true;
      file.write(samplePacked);
      file.rewind();

      const u1 = new Unpacker(file);
      u1.each((obj) => {
        expect(obj).toEqual(sampleData);
      });
      file.unlink();
    });

    const sio = new StringIO(samplePacked);
    const u2 = new Unpacker(sio);
    u2.each((obj) => {
      expect(obj).toEqual(sampleData);
    });

    const dio = new StringIO(new Uint8Array(0));
    await Zlib.GzipWriter.wrap(dio, (gz) => gz.write(samplePacked));
    const reader = new Zlib.GzipReader(new StringIO(dio.string()));
    const u3 = new Unpacker(reader);
    u3.each((obj) => {
      expect(obj).toEqual(sampleData);
    });

    const dio4 = new DummyIO();
    dio4.write(samplePacked);
    const u4 = new Unpacker(dio4);
    u4.each((obj) => {
      expect(obj).toEqual(sampleData);
    });
  });

  it("read_array_header succeeds", () => {
    unpacker.feed(Uint8Array.of(0x91));
    expect(unpacker.readArrayHeader()).toEqual(1);
  });

  it("read_array_header fails", () => {
    unpacker.feed(Uint8Array.of(0x81));
    expect(() => unpacker.readArrayHeader()).toThrow(
      expect.toSatisfy((e) => rbObjIsKindOf(e, MessagePack.TypeError)),
    );
    expect(() => unpacker.readArrayHeader()).toThrow(UnexpectedTypeError);
  });

  it("read_map_header converts an map to key-value sequence", () => {
    const packer = new Packer();
    packer.writeArrayHeader(2);
    packer.write("e");
    packer.write(1);
    const unpacker = new Unpacker();
    unpacker.feed(packer.toS());
    expect(unpacker.readArrayHeader()).toBe(2);
    expect(unpacker.read()).toBe("e");
    expect(unpacker.read()).toBe(1);
  });

  it("read_map_header succeeds", () => {
    unpacker.feed(Uint8Array.of(0x81));
    expect(unpacker.readMapHeader()).toEqual(1);
  });

  it("read_map_header converts an map to key-value sequence", () => {
    const packer = new Packer();
    packer.writeMapHeader(1);
    packer.write("k");
    packer.write("v");
    const unpacker = new Unpacker();
    unpacker.feed(packer.toS());
    expect(unpacker.readMapHeader()).toBe(1);
    expect(unpacker.read()).toBe("k");
    expect(unpacker.read()).toBe("v");
  });

  it("read_map_header fails", () => {
    unpacker.feed(Uint8Array.of(0x91));
    expect(() => unpacker.readMapHeader()).toThrow(
      expect.toSatisfy((e) => rbObjIsKindOf(e, MessagePack.TypeError)),
    );
    expect(() => unpacker.readMapHeader()).toThrow(UnexpectedTypeError);
  });

  it("read raises EOFError before feeding", () => {
    expect(() => unpacker.read()).toThrow(EOFError);
  });

  // BLOCKED: msgpack-unpacker-read-loop-the-engine-hides
  it.skip("feed and each continue internal state", () => {});

  // BLOCKED: msgpack-unpacker-read-loop-the-engine-hides
  it.skip("feed and each empty string", () => {});

  // BLOCKED: msgpack-unpacker-read-loop-the-engine-hides
  it.skip("feed_each continues internal state", () => {});

  // BLOCKED: msgpack-unpacker-read-loop-the-engine-hides
  it.skip("feed_each enumerator", () => {});

  it("reset clears internal buffer", () => {
    unpacker.feed(Uint8Array.of(0x91));
    unpacker.reset();
    unpacker.feed(Uint8Array.of(0x01));

    expect(unpacker.read()).toEqual(1);
  });

  it("reset clears internal state", () => {
    unpacker.feed(Uint8Array.of(0x91));
    expect([...unpacker.each()]).toEqual([]);

    unpacker.reset();

    unpacker.feed(Uint8Array.of(0x01));
    expect([...unpacker.each()]).toEqual([1]);
  });

  // BLOCKED: msgpack-unpacker-read-loop-the-engine-hides
  it.skip("frozen short strings", () => {});

  // BLOCKED: msgpack-unpacker-read-loop-the-engine-hides
  it.skip("frozen long strings", () => {});

  it("read raises invalid byte error", () => {
    unpacker.feed(Uint8Array.of(0xc1));
    expect(() => unpacker.read()).toThrow(MalformedFormatError);
  });

  // BLOCKED: msgpack-unpacker-read-loop-the-engine-hides
  it.skip("gc mark", () => {});

  it("buffer", () => {
    const orig = "a".repeat(32 * 1024 * 4);
    const raw = rbFSend(orig, "toMsgpack") as Uint8Array;

    const n = 655;
    const times = Math.ceil(raw.length / n);

    let off = 0;
    let parsed = false;

    for (let i = 0; i < times; i++) {
      expect(parsed).toBe(false);

      const seg = raw.subarray(off, off + n);
      off += seg.length;

      unpacker.feedEach(seg, (obj) => {
        expect(parsed).toBe(false);
        expect(obj).toBe(orig);
        parsed = true;
      });
    }

    expect(parsed).toBe(true);
  });

  it("MessagePack.unpack symbolize_keys", () => {
    const symbolizedHash = { ":a": "b", ":c": "d" };
    expect(MessagePack.load(MessagePack.pack({ a: "b", c: "d" }), { symbolizeKeys: true })).toEqual(
      symbolizedHash,
    );
    expect(
      MessagePack.unpack(MessagePack.pack({ a: "b", c: "d" }), { symbolizeKeys: true }),
    ).toEqual(symbolizedHash);
  });

  it("MessagePack.unpack symbolize_keys preserve encoding", () => {
    const hash = { ":ascii": 1, ":utf8_é": 2 };
    const loadedHash = MessagePack.load(MessagePack.pack({ ascii: 1, utf8_é: 2 }), {
      symbolizeKeys: true,
    }) as Record<string, unknown>;

    expect(Object.keys(loadedHash)[0]).toBe(Object.keys(hash)[0]);
    expect(Object.keys(loadedHash)[1]).toBe(Object.keys(hash)[1]);

    expect(
      MessagePack.unpack(MessagePack.pack({ ascii: 1, utf8_é: 2 }), { symbolizeKeys: true }),
    ).toEqual(hash);
  });

  it("Unpacker#unpack symbolize_keys", () => {
    const unpacker = new Unpacker({ symbolizeKeys: true });
    const symbolizedHash = { ":a": "b", ":c": "d" };
    expect(unpacker.feed(MessagePack.pack({ a: "b", c: "d" })).read()).toEqual(symbolizedHash);
  });

  it("msgpack str 8 type", () => {
    expect(MessagePack.unpack(pack(0xd9, 0x00))).toBe("");
    expect(typeof MessagePack.unpack(pack(0xd9, 0x00))).toBe("string");
    expect(MessagePack.unpack(cat(pack(0xd9, 0x01), "a"))).toBe("a");
    expect(MessagePack.unpack(cat(pack(0xd9, 0x02), "aa"))).toBe("aa");
  });

  it("msgpack str 16 type", () => {
    expect(MessagePack.unpack(pack(0xda, 0x00, 0x00))).toBe("");
    expect(typeof MessagePack.unpack(pack(0xda, 0x00, 0x00))).toBe("string");
    expect(MessagePack.unpack(cat(pack(0xda, 0x00, 0x01), "a"))).toBe("a");
    expect(MessagePack.unpack(cat(pack(0xda, 0x00, 0x02), "aa"))).toBe("aa");
  });

  it("msgpack str 32 type", () => {
    expect(MessagePack.unpack(pack(0xdb, 0x00, 0x00, 0x00, 0x00))).toBe("");
    expect(typeof MessagePack.unpack(pack(0xdb, 0x00, 0x00, 0x00, 0x00))).toBe("string");
    expect(MessagePack.unpack(cat(pack(0xdb, 0x00, 0x00, 0x00, 0x01), "a"))).toBe("a");
    expect(MessagePack.unpack(cat(pack(0xdb, 0x00, 0x00, 0x00, 0x02), "aa"))).toBe("aa");
  });

  it("msgpack bin 8 type", () => {
    expect(MessagePack.unpack(pack(0xc4, 0x00))).toEqual(bytes(""));
    expect(MessagePack.unpack(pack(0xc4, 0x00)) instanceof Uint8Array).toBe(true);
    expect(MessagePack.unpack(cat(pack(0xc4, 0x01), "a"))).toEqual(bytes("a"));
    expect(MessagePack.unpack(cat(pack(0xc4, 0x02), "aa"))).toEqual(bytes("aa"));
  });

  it("msgpack bin 16 type", () => {
    expect(MessagePack.unpack(pack(0xc5, 0x00, 0x00))).toEqual(bytes(""));
    expect(MessagePack.unpack(pack(0xc5, 0x00, 0x00)) instanceof Uint8Array).toBe(true);
    expect(MessagePack.unpack(cat(pack(0xc5, 0x00, 0x01), "a"))).toEqual(bytes("a"));
    expect(MessagePack.unpack(cat(pack(0xc5, 0x00, 0x02), "aa"))).toEqual(bytes("aa"));
  });

  it("msgpack bin 32 type", () => {
    expect(MessagePack.unpack(pack(0xc6, 0x00, 0x00, 0x00, 0x00))).toEqual(bytes(""));
    expect(MessagePack.unpack(pack(0xc6, 0x0, 0x00, 0x00, 0x000)) instanceof Uint8Array).toBe(true);
    expect(MessagePack.unpack(cat(pack(0xc6, 0x00, 0x00, 0x00, 0x01), "a"))).toEqual(bytes("a"));
    expect(MessagePack.unpack(cat(pack(0xc6, 0x00, 0x00, 0x00, 0x02), "aa"))).toEqual(bytes("aa"));
  });

  describe("#type_registered?", () => {
    it("receive Class or Integer, and return bool", () => {
      expect(unpacker.isTypeRegistered(0x00)).toBeFalsy();
      expect(unpacker.isTypeRegistered(0x01)).toBeFalsy();
      expect(unpacker.isTypeRegistered(ValueOne)).toBeFalsy();
    });

    it("returns true if specified type or class is already registered", () => {
      unpacker.registerType(0x30, ValueOne, "fromMsgpackExt");
      unpacker.registerType(0x31, ValueTwo, "fromMsgpackExt");

      expect(unpacker.isTypeRegistered(0x00)).toBeFalsy();
      expect(unpacker.isTypeRegistered(0x01)).toBeFalsy();

      expect(unpacker.isTypeRegistered(0x30)).toBeTruthy();
      expect(unpacker.isTypeRegistered(0x31)).toBeTruthy();
      expect(unpacker.isTypeRegistered(ValueOne)).toBeTruthy();
      expect(unpacker.isTypeRegistered(ValueTwo)).toBeTruthy();
    });

    it("cannot detect unpack rule with block, not method", () => {
      unpacker.registerType(0x40, null, null, (data: Uint8Array) => ValueOne.fromMsgpackExt(data));

      expect(unpacker.isTypeRegistered(0x40)).toBeTruthy();
      expect(unpacker.isTypeRegistered(ValueOne)).toBeFalsy();
    });
  });

  describe("with ext definitions", () => {
    it("get type and class mapping for packing", () => {
      let unpacker = new Unpacker();
      unpacker.registerType(0x01, null, null, () => ValueOne.fromMsgpackExt(new Uint8Array()));
      unpacker.registerType(0x02, null, null, (data: Uint8Array) => ValueTwo.fromMsgpackExt(data));

      unpacker = new Unpacker();
      unpacker.registerType(0x01, ValueOne, "fromMsgpackExt");
      unpacker.registerType(0x02, ValueTwo, "fromMsgpackExt");
    });

    it("returns a Array of Hash which contains :type, :class and :unpacker", () => {
      const unpacker = new Unpacker();
      unpacker.registerType(0x02, ValueTwo, "fromMsgpackExt");
      unpacker.registerType(0x01, ValueOne, "fromMsgpackExt");

      const list = unpacker.registeredTypes();

      expect(list).toBeInstanceOf(Array);
      expect(list.length).toEqual(2);

      const one = list[0];
      expect(Object.keys(one).sort()).toEqual(["type", "class", "unpacker"].sort());
      expect(one.type).toEqual(0x01);
      expect(one.class).toEqual(ValueOne);
      expect(one.unpacker).toBeInstanceOf(Function);

      const two = list[1];
      expect(Object.keys(two).sort()).toEqual(["type", "class", "unpacker"].sort());
      expect(two.type).toEqual(0x02);
      expect(two.class).toEqual(ValueTwo);
      expect(two.unpacker).toBeInstanceOf(Function);
    });
  });

  describe("with ext definitions", () => {
    it("returns a Array of Hash, which contains nil for class if block unpacker specified", () => {
      const unpacker = new Unpacker();
      unpacker.registerType(0x01, null, null, () => ValueOne.fromMsgpackExt(new Uint8Array()));
      unpacker.registerType(0x02, null, null, ValueTwo.fromMsgpackExt.bind(ValueTwo));

      const list = unpacker.registeredTypes();

      expect(list).toBeInstanceOf(Array);
      expect(list.length).toEqual(2);

      const one = list[0];
      expect(Object.keys(one).sort()).toEqual(["type", "class", "unpacker"].sort());
      expect(one.type).toEqual(0x01);
      expect(one.class).toBeNull();
      expect(one.unpacker).toBeInstanceOf(Function);

      const two = list[1];
      expect(Object.keys(two).sort()).toEqual(["type", "class", "unpacker"].sort());
      expect(two.type).toEqual(0x02);
      expect(two.class).toBeNull();
      expect(two.unpacker).toBeInstanceOf(Function);
    });

    describe("registering an ext type for a module", () => {
      it('is expected to eq "unpacked module"', () => {
        const Mod = defineModule({});
        Object.defineProperty(Mod, "fromMsgpackExt", {
          value: (data: Uint8Array) => `unpacked ${new TextDecoder().decode(data)}`,
          enumerable: false,
        });
        unpacker.registerType(0x00, Mod, "fromMsgpackExt");
        expect(unpacker.feed(bytes("\xc7\x06\x00module")).unpack()).toBe("unpacked module");
      });
    });
  });

  describe("ext formats", () => {
    for (const [n, b] of [
      [1, 0xd4],
      [2, 0xd5],
      [4, 0xd6],
      [8, 0xd7],
      [16, 0xd8],
    ] as const) {
      it(`msgpack fixext ${n} format`, () => {
        const unpacker = new Unpacker({ allowUnknownExt: true });
        const a = new TextEncoder().encode("a".repeat(n));
        expect(unpacker.feed(Uint8Array.of(b, 1, ...a)).unpack()).toEqual(new ExtensionValue(1, a));
        expect(unpacker.feed(Uint8Array.of(b, 0xff, ...a)).unpack()).toEqual(
          new ExtensionValue(-1, a),
        );
      });
    }

    const ext = (header: number[], type: number, n: number) =>
      Uint8Array.of(...header, type & 0xff, ...new TextEncoder().encode("a".repeat(n)));
    const a = (n: number) => new TextEncoder().encode("a".repeat(n));

    it("msgpack ext 8 format", () => {
      const unpacker = new Unpacker({ allowUnknownExt: true });
      expect(unpacker.feed(ext([0xc7, 0], 1, 0)).unpack()).toEqual(new ExtensionValue(1, a(0)));
      expect(unpacker.feed(ext([0xc7, 255], -1, 255)).unpack()).toEqual(
        new ExtensionValue(-1, a(255)),
      );
    });

    it("msgpack ext 16 format", () => {
      const unpacker = new Unpacker({ allowUnknownExt: true });
      expect(unpacker.feed(ext([0xc8, 0, 0], 1, 0)).unpack()).toEqual(new ExtensionValue(1, a(0)));
      expect(unpacker.feed(ext([0xc8, 1, 0], -1, 256)).unpack()).toEqual(
        new ExtensionValue(-1, a(256)),
      );
    });

    it("msgpack ext 32 format", () => {
      const unpacker = new Unpacker({ allowUnknownExt: true });
      expect(unpacker.feed(ext([0xc9, 0, 0, 0, 0], 1, 0)).unpack()).toEqual(
        new ExtensionValue(1, a(0)),
      );
      expect(unpacker.feed(ext([0xc9, 0, 0, 1, 0], -1, 256)).unpack()).toEqual(
        new ExtensionValue(-1, a(256)),
      );
      expect(unpacker.feed(ext([0xc9, 0, 1, 0, 0], -1, 65536)).unpack()).toEqual(
        new ExtensionValue(-1, a(65536)),
      );
    });
  });

  const buffer1 = MessagePack.pack({ foo: "bar" });
  const buffer2 = MessagePack.pack({ hello: { world: [1, 2, 3] } });
  const buffer3 = MessagePack.pack({ x: "y" });
  const expected = [{ foo: "bar" }, { hello: { world: [1, 2, 3] } }, { x: "y" }];

  describe("#read", () => {
    describe("with a buffer", () => {
      it("reads objects", () => {
        const objects: unknown[] = [];
        unpacker.feed(buffer1);
        unpacker.feed(buffer2);
        unpacker.feed(buffer3);
        objects.push(unpacker.read());
        objects.push(unpacker.read());
        objects.push(unpacker.read());
        expect(objects).toEqual(expected);
      });

      it("reads map header", () => {
        unpacker.feed(rbFSend({}, "toMsgpack") as Uint8Array);
        expect(unpacker.readMapHeader()).toEqual(0);
      });

      it("reads array header", () => {
        unpacker.feed(rbFSend([], "toMsgpack") as Uint8Array);
        expect(unpacker.readArrayHeader()).toEqual(0);
      });
    });
  });

  describe("#each", () => {
    describe("with a buffer", () => {
      it("yields each object in the buffer", () => {
        const objects: unknown[] = [];
        unpacker.feed(buffer1);
        unpacker.feed(buffer2);
        unpacker.feed(buffer3);
        unpacker.each((obj) => objects.push(obj));
        expect(objects).toEqual(expected);
      });

      it("returns an enumerator when no block is given", () => {
        for (const buffer of [buffer1, buffer2, buffer3]) unpacker.feed(buffer);
        const enumerator = unpacker.each();
        expect([...enumerator].map((obj) => Object.keys(obj as object)[0])).toEqual([
          "foo",
          "hello",
          "x",
        ]);
      });
    });

    describe("with a stream passed to the constructor", () => {
      it("yields each object in the stream", () => {
        const objects: unknown[] = [];
        const io = new StringIO();
        for (const buffer of [buffer1, buffer2, buffer3]) io.write(buffer);
        io.rewind();
        new Unpacker(io).each((obj) => objects.push(obj));
        expect(objects).toEqual(expected);
      });
    });
  });

  describe("#each", () => {
    describe("with a stream and symbolize_keys passed to the constructor", () => {
      it("yields each object in the stream, with symbolized keys", () => {
        const objects: unknown[] = [];
        const io = new StringIO();
        for (const buffer of [buffer1, buffer2, buffer3]) io.write(buffer);
        io.rewind();
        new Unpacker(io, { symbolizeKeys: true }).each((obj) => objects.push(obj));
        expect(objects).toEqual([
          { ":foo": "bar" },
          { ":hello": { ":world": [1, 2, 3] } },
          { ":x": "y" },
        ]);
      });
    });
  });

  describe("#feed_each", () => {
    it("feeds the buffer then runs #each", () => {
      const objects: unknown[] = [];
      unpacker.feedEach(Uint8Array.from([...buffer1, ...buffer2, ...buffer3]), (obj) => {
        objects.push(obj);
      });
      expect(objects).toEqual(expected);
    });

    it("handles chunked data", () => {
      const objects: unknown[] = [];
      for (const ch of [...buffer1, ...buffer2, ...buffer3]) {
        unpacker.feedEach(Uint8Array.of(ch), (obj) => objects.push(obj));
      }
      expect(objects).toEqual(expected);
    });
  });

  describe("regressions", () => {
    it("handles massive arrays (issue #2)", () => {
      const array = new Array(10_000).fill("foo");
      expect((MessagePack.unpack(MessagePack.pack(array)) as unknown[]).length).toBe(10_000);
    });

    it("preserves string encoding (issue #200)", () => {
      let string = "a";
      expect(typeof MessagePack.unpack(MessagePack.pack(string))).toBe("string");

      string = string.repeat(256);
      expect(typeof MessagePack.unpack(MessagePack.pack(string))).toBe("string");
    });

    it("returns correct size for array16 (issue #127)", () => {
      unpacker.feed(Uint8Array.of(0xdc, 0x00, 0x01, 0x01));
      expect(unpacker.readArrayHeader()).toEqual(1);
    });

    it("returns correct size for map16 (issue #127)", () => {
      unpacker.feed(Uint8Array.of(0xde, 0x00, 0x02, 0x01, 0x02, 0x03, 0x04));
      expect(unpacker.readMapHeader()).toEqual(2);
    });
  });

  describe("extensions", () => {
    describe("symbolized keys", () => {
      const buffer = MessagePack.pack({ hello: "world", nested: ["object", { structure: true }] });
      let unpacker: Unpacker;
      beforeEach(() => {
        unpacker = new Unpacker({ symbolizeKeys: true });
      });

      it("can symbolize keys when using #each", () => {
        const objs: unknown[] = [];
        unpacker.feed(buffer);
        unpacker.each((obj) => objs.push(obj));
        expect(objs).toEqual([
          { ":hello": "world", ":nested": ["object", { ":structure": true }] },
        ]);
      });

      it("can symbolize keys when using #feed_each", () => {
        const objs: unknown[] = [];
        unpacker.feedEach(buffer, (obj) => objs.push(obj));
        expect(objs).toEqual([
          { ":hello": "world", ":nested": ["object", { ":structure": true }] },
        ]);
      });
    });

    describe("freeze", () => {
      type Struct = { hello: string; nested: [string, { structure: boolean }] };
      const struct: Struct = { hello: "world", nested: ["object", { structure: true }] };
      const buffer = MessagePack.pack(struct);
      let unpacker: Unpacker;
      beforeEach(() => {
        unpacker = new Unpacker({ freeze: true });
      });

      // PERMANENT-SKIP: a JS string has no identity, so dedup and frozenness have no observable arm (CLAUDE.md, "Ruby Strings are JS string primitives").
      it.skip("dedups strings", () => {});

      it("can freeze objects when using .unpack", () => {
        const parsedStruct = MessagePack.unpack(buffer, { freeze: true }) as Struct;
        expect(parsedStruct).toEqual(struct);

        expect(Object.isFrozen(parsedStruct)).toBe(true);
        expect(Object.isFrozen(parsedStruct.hello)).toBe(true);
        expect(Object.isFrozen(parsedStruct.nested)).toBe(true);
        expect(Object.isFrozen(parsedStruct.nested[0])).toBe(true);
        expect(Object.isFrozen(parsedStruct.nested[1])).toBe(true);
      });

      it("can freeze objects when using #each", () => {
        const objs: unknown[] = [];
        unpacker.feed(buffer);
        unpacker.each((obj) => objs.push(obj));

        const parsedStruct = objs[0] as Struct;
        expect(parsedStruct).toEqual(struct);

        expect(Object.isFrozen(parsedStruct)).toBe(true);
        expect(Object.isFrozen(parsedStruct.hello)).toBe(true);
        expect(Object.isFrozen(parsedStruct.nested)).toBe(true);
        expect(Object.isFrozen(parsedStruct.nested[0])).toBe(true);
        expect(Object.isFrozen(parsedStruct.nested[1])).toBe(true);
      });

      it("can freeze objects when using #feed_each", () => {
        const objs: unknown[] = [];
        unpacker.feedEach(buffer, (obj) => objs.push(obj));

        const parsedStruct = objs[0] as Struct;
        expect(parsedStruct).toEqual(struct);

        expect(Object.isFrozen(parsedStruct)).toBe(true);
        expect(Object.isFrozen(parsedStruct.hello)).toBe(true);
        expect(Object.isFrozen(parsedStruct.nested)).toBe(true);
        expect(Object.isFrozen(parsedStruct.nested[0])).toBe(true);
        expect(Object.isFrozen(parsedStruct.nested[1])).toBe(true);
      });
    });

    describe("binary encoding", () => {
      // BLOCKED: msgpack-unpacker-read-loop-the-engine-hides
      it.skip("decodes binary as ascii-8bit when using #feed", () => {});

      // BLOCKED: msgpack-unpacker-read-loop-the-engine-hides
      it.skip("decodes binary as ascii-8bit when using #feed_each", () => {});
    });

    describe("string encoding", () => {
      const buffer = MessagePack.pack({ hello: "world", nested: ["object", { structure: true }] });

      it("decodes string as utf-8 when using #feed", () => {
        const objs: unknown[] = [];
        unpacker.feed(buffer);
        unpacker.each((obj) => objs.push(obj));
        const strings = flatten(objs).filter((s) => typeof s === "string");
        expect(strings).toEqual(["hello", "world", "nested", "object", "structure"]);
      });

      it("decodes binary as ascii-8bit when using #feed_each", () => {
        const objs: unknown[] = [];
        unpacker.feedEach(buffer, (obj) => objs.push(obj));
        const strings = flatten(objs).filter((s) => typeof s === "string");
        expect(strings).toEqual(["hello", "world", "nested", "object", "structure"]);
      });
    });
  });

  it("doesn't allow #dup or #clone", () => {
    expect(rbObjRespondTo(unpacker, "dup")).toBe(false);
    expect(rbObjRespondTo(unpacker, "clone")).toBe(false);
  });

  it("doesn't crash when marking an uninitialized buffer", () => {
    void new Unpacker().buffer;
  });

  it("doesn't leak when a recursive unpacker raises", () => {
    class HashWithIndifferentAccess extends Hash<unknown, unknown> {}
    const msgpack = new Factory();
    msgpack.registerType(0x02, HashWithIndifferentAccess, {
      packer: (value: HashWithIndifferentAccess, packer: Packer) => {
        packer.write(value.toH());
      },
      unpacker: () => {
        throw new RuntimeError("Ooops");
      },
      recursive: true,
    });

    const data = [[[[[[[new HashWithIndifferentAccess()]]]]]]];
    const payload = msgpack.dump(data);

    const unpacker = msgpack.unpacker();
    for (let i = 0; i < 2; i++) {
      unpacker.buffer.clear();
      unpacker.feed(payload);
      expect(() => unpacker.fullUnpack()).toThrow(new RuntimeError("Ooops"));
    }

    for (let i = 0; i < 10; i++) {
      unpacker.buffer.clear();
      unpacker.feed(payload);
      expect(() => unpacker.fullUnpack()).toThrow(new RuntimeError("Ooops"));
    }
  });
});

function flatten(struct: unknown, results: unknown[] = []): unknown[] {
  if (Array.isArray(struct)) {
    for (const v of struct) flatten(v, results);
  } else if (struct !== null && typeof struct === "object" && !(struct instanceof Uint8Array)) {
    for (const [k, v] of Object.entries(struct)) flatten(v, flatten(k, results));
  } else {
    results.push(struct);
  }
  return results;
}
