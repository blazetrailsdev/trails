import { beforeEach, describe, expect, it } from "vitest";
import {
  ArgumentError,
  defineModule,
  Hash,
  StringIO,
  extend,
  include,
  rbCString,
  rbFSend,
  rbObjClass,
  rbObjRespondTo,
  Tempfile,
  TypeError,
  Zlib,
} from "@blazetrails/ruby-compat";
import { Buffer, ExtensionValue, Factory, MessagePack, Packer, Unpacker } from "../lib/index.js";

const bin = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

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
  constructor(readonly num: number) {}

  toMsgpackExt(): Uint8Array {
    return new Packer().write(this.num).toS();
  }
}

class ValueTwo extends ValueOne {}

describe("MessagePack::Packer", () => {
  let packer: Packer;
  beforeEach(() => {
    packer = new Packer();
  });

  it("initialize", () => {
    new Packer();
    new Packer(null);
    new Packer(new StringIO());
    new Packer({});
    new Packer(new StringIO(), {});
  });

  it("gets IO or object which has #write to write/append data to it", async () => {
    const sampleData = { message: "morning!", num: 1 };
    const samplePacked = MessagePack.pack(sampleData);

    Tempfile.open("for_io", undefined, (file) => {
      file.sync = true;
      const p1 = new Packer(file);
      p1.write(sampleData);
      p1.flush();

      file.rewind();
      expect(file.binmode().read()).toEqual(samplePacked);
      file.unlink();
    });

    let dio = new StringIO(new Uint8Array(0));
    const p2 = new Packer(dio);
    p2.write(sampleData);
    p2.flush();
    dio.rewind();
    expect(dio.string()).toEqual(samplePacked);

    dio = new StringIO(new Uint8Array(0));
    const writer = new Zlib.GzipWriter(dio);
    writer.sync = true;
    const p3 = new Packer(writer);
    p3.write(sampleData);
    p3.flush();
    await writer.flush(Zlib.FINISH);
    await writer.close();
    dio.rewind();
    const compressed = dio.string();
    const str = await Zlib.GzipReader.wrap(new StringIO(compressed), (gz) => gz.read());
    expect(str).toEqual(String.fromCharCode(...samplePacked));

    const dio4 = new DummyIO();
    const p4 = new Packer(dio4);
    p4.write(sampleData);
    p4.flush();
    expect(dio4.read()).toEqual(samplePacked);
  });

  it("gets options to specify how to pack values", () => {
    const u1 = new Packer();
    expect(u1.isCompatibilityMode()).toBe(false);

    const u2 = new Packer({ compatibilityMode: true });
    expect(u2.isCompatibilityMode()).toBe(true);
  });

  it("write", () => {
    packer.write([]);
    expect(packer.toS()).toEqual(Uint8Array.of(0x90));
  });

  it("write_nil", () => {
    packer.writeNil();
    expect(packer.toS()).toEqual(Uint8Array.of(0xc0));
  });

  it("write_array_header 0", () => {
    packer.writeArrayHeader(0);
    expect(packer.toS()).toEqual(Uint8Array.of(0x90));
  });

  it("write_array_header 1", () => {
    packer.writeArrayHeader(1);
    expect(packer.toS()).toEqual(Uint8Array.of(0x91));
  });

  it("write_map_header 0", () => {
    packer.writeMapHeader(0);
    expect(packer.toS()).toEqual(Uint8Array.of(0x80));
  });

  it("write_map_header 1", () => {
    packer.writeMapHeader(1);
    expect(packer.toS()).toEqual(Uint8Array.of(0x81));
  });

  const binHeaders: [number, number[]][] = [
    [0, [0xc4, 0x00]],
    [255, [0xc4, 0xff]],
    [256, [0xc5, 0x01, 0x00]],
    [65535, [0xc5, 0xff, 0xff]],
    [65536, [0xc6, 0x00, 0x01, 0x00, 0x00]],
    [999999, [0xc6, 0x00, 0x0f, 0x42, 0x3f]],
  ];
  for (const [n, packed] of binHeaders) {
    it(`write_bin_header ${n}`, () => {
      packer.writeBinHeader(n);
      expect(packer.toS()).toEqual(Uint8Array.from(packed));
    });
  }

  it("write_bin", () => {
    packer.writeBin("hello");
    expect(packer.toS()).toEqual(Uint8Array.of(0xc4, 0x05, ...new TextEncoder().encode("hello")));
  });

  describe("#write_float32", () => {
    const tests: [string, number, number[]][] = [
      ["small floats", 3.14, [0xca, 0x40, 0x48, 0xf5, 0xc3]],
      ["big floats", Math.PI * 1_000_000_000_000_000_000, [0xca, 0x5e, 0x2e, 0x64, 0xb7]],
      ["negative floats", -2.1, [0xca, 0xc0, 0x06, 0x66, 0x66]],
      ["integer", 123, [0xca, 0x42, 0xf6, 0x00, 0x00]],
    ];

    for (const [ctx, numeric, packed] of tests) {
      describe(`with ${ctx}`, () => {
        it(`encodes ${numeric} as float32`, () => {
          packer.writeFloat32(numeric);
          expect(packer.toS()).toEqual(Uint8Array.from(packed));
        });
      });
    }

    describe("with non numeric", () => {
      it("raises argument error", () => {
        expect(() => packer.writeFloat32("abc")).toThrow(ArgumentError);
      });
    });
  });

  it("flush", () => {
    const io = new StringIO();
    const pk = new Packer(io);
    pk.writeNil();
    pk.flush();
    expect(pk.toS()).toEqual(new Uint8Array(0));
    expect(io.string()).toEqual("\udcc0");
  });

  it("to_msgpack returns String", () => {
    expect(rbObjClass(rbFSend(null, "toMsgpack"))).toBe(rbCString);
    expect(rbObjClass(rbFSend(true, "toMsgpack"))).toBe(rbCString);
    expect(rbObjClass(rbFSend(false, "toMsgpack"))).toBe(rbCString);
    expect(rbObjClass(rbFSend(1, "toMsgpack"))).toBe(rbCString);
    expect(rbObjClass(rbFSend(new Number(1.0), "toMsgpack"))).toBe(rbCString);
    expect(rbObjClass(rbFSend("", "toMsgpack"))).toBe(rbCString);
    expect(rbObjClass(rbFSend({}, "toMsgpack"))).toBe(rbCString);
    expect(rbObjClass(rbFSend([], "toMsgpack"))).toBe(rbCString);
  });

  it("to_msgpack with packer equals to_msgpack", () => {
    const toStr = (packer: unknown) => (packer as Packer).toStr();
    expect(toStr(rbFSend(null, "toMsgpack", new Packer()))).toEqual(rbFSend(null, "toMsgpack"));
    expect(toStr(rbFSend(true, "toMsgpack", new Packer()))).toEqual(rbFSend(true, "toMsgpack"));
    expect(toStr(rbFSend(false, "toMsgpack", new Packer()))).toEqual(rbFSend(false, "toMsgpack"));
    expect(toStr(rbFSend(1, "toMsgpack", new Packer()))).toEqual(rbFSend(1, "toMsgpack"));
    expect(toStr(rbFSend(new Number(1.0), "toMsgpack", new Packer()))).toEqual(
      rbFSend(new Number(1.0), "toMsgpack"),
    );
    expect(toStr(rbFSend("", "toMsgpack", new Packer()))).toEqual(rbFSend("", "toMsgpack"));
    expect(toStr(rbFSend({}, "toMsgpack", new Packer()))).toEqual(rbFSend({}, "toMsgpack"));
    expect(toStr(rbFSend([], "toMsgpack", new Packer()))).toEqual(rbFSend([], "toMsgpack"));
  });

  it("raises type error on wrong type", () => {
    const packer = new Packer();
    expect(() => packer.writeFloat("hello")).toThrow(TypeError);
    expect(() => packer.writeString(1)).toThrow(TypeError);
    expect(() => packer.writeBin(1)).toThrow(TypeError);
    expect(() => packer.writeArray("hello")).toThrow(TypeError);
    expect(() => packer.writeHash("hello")).toThrow(TypeError);
    expect(() => packer.writeSymbol("hello")).toThrow(TypeError);
    expect(() => packer.writeInt("hello")).toThrow(TypeError);
    expect(() => packer.writeExtension("hello")).toThrow(TypeError);
  });

  class CustomPack01 {
    toMsgpack(pk: unknown = null): unknown {
      if (!(pk instanceof Packer)) return MessagePack.pack(this, pk);
      pk.writeArrayHeader(2);
      pk.write(1);
      pk.write(2);
      return pk;
    }
  }

  class CustomPack02 {
    toMsgpack(pk: unknown = null): unknown {
      return rbFSend([1, 2], "toMsgpack", pk);
    }
  }

  it("calls custom to_msgpack method", () => {
    expect(MessagePack.pack(new CustomPack01())).toEqual(rbFSend([1, 2], "toMsgpack"));
    expect(MessagePack.pack(new CustomPack02())).toEqual(rbFSend([1, 2], "toMsgpack"));
    expect(new CustomPack01().toMsgpack()).toEqual(rbFSend([1, 2], "toMsgpack"));
    expect(new CustomPack02().toMsgpack()).toEqual(rbFSend([1, 2], "toMsgpack"));
  });

  it("calls custom to_msgpack method with io", () => {
    const s01 = new StringIO();
    MessagePack.pack(new CustomPack01(), s01);
    expect(bin(s01.string())).toEqual(rbFSend([1, 2], "toMsgpack"));

    const s02 = new StringIO();
    MessagePack.pack(new CustomPack02(), s02);
    expect(bin(s02.string())).toEqual(rbFSend([1, 2], "toMsgpack"));

    const s03 = new StringIO();
    new CustomPack01().toMsgpack(s03);
    expect(bin(s03.string())).toEqual(rbFSend([1, 2], "toMsgpack"));

    const s04 = new StringIO();
    new CustomPack02().toMsgpack(s04);
    expect(bin(s04.string())).toEqual(rbFSend([1, 2], "toMsgpack"));
  });

  describe("in compatibility mode", () => {
    it("does not use the bin types", () => {
      let packed = MessagePack.pack(bin("hello"), { compatibilityMode: true });
      expect(packed).toEqual(bin("\xA5hello"));
      packed = MessagePack.pack(bin("hello".repeat(100)), { compatibilityMode: true });
      expect(packed!.subarray(0, 3)).toEqual(bin("\xDA\x01\xF4"));

      const packer = new Packer({ compatibilityMode: 1 });
      const packed2 = packer.pack(bin("hello".repeat(100)));
      expect(packed2.toStr().subarray(0, 3)).toEqual(bin("\xDA\x01\xF4"));
    });

    it("does not use the str8 type", () => {
      const packed = MessagePack.pack("x".repeat(32), { compatibilityMode: true });
      expect(packed!.subarray(0, 3)).toEqual(bin("\xDA\x00\x20"));
    });
  });

  describe("#type_registered?", () => {
    it("receive Class or Integer, and return bool", () => {
      expect(packer.isTypeRegistered(0x00)).toBeFalsy();
      expect(packer.isTypeRegistered(0x01)).toBeFalsy();
      expect(packer.isTypeRegistered(ValueOne)).toBeFalsy();
    });

    it("returns true if specified type or class is already registered", () => {
      packer.registerType(0x30, ValueOne, "toMsgpackExt");
      packer.registerType(0x31, ValueTwo, "toMsgpackExt");

      expect(packer.isTypeRegistered(0x00)).toBeFalsy();
      expect(packer.isTypeRegistered(0x01)).toBeFalsy();

      expect(packer.isTypeRegistered(0x30)).toBeTruthy();
      expect(packer.isTypeRegistered(0x31)).toBeTruthy();
      expect(packer.isTypeRegistered(ValueOne)).toBeTruthy();
      expect(packer.isTypeRegistered(ValueTwo)).toBeTruthy();
    });
  });

  describe("#register_type", () => {
    it("get type and class mapping for packing", () => {
      let packer = new Packer();
      packer.registerType(0x01, ValueOne, null, (obj: ValueOne) => obj.toMsgpackExt());
      packer.registerType(0x02, ValueTwo, null, (obj: ValueTwo) => obj.toMsgpackExt());

      packer = new Packer();
      packer.registerType(0x01, ValueOne, "toMsgpackExt");
      packer.registerType(0x02, ValueTwo, "toMsgpackExt");

      packer = new Packer();
      packer.registerType(0x01, ValueOne, null, (obj: ValueOne) => obj.toMsgpackExt());
      packer.registerType(0x02, ValueTwo, null, (obj: ValueTwo) => obj.toMsgpackExt());
    });

    it("returns a Hash which contains map of Class and type", () => {
      const packer = new Packer();
      packer.registerType(0x01, ValueOne, "toMsgpackExt");
      packer.registerType(0x02, ValueTwo, "toMsgpackExt");

      expect(packer.registeredTypes()).toBeInstanceOf(Array);
      expect(packer.registeredTypes().length).toEqual(2);

      const one = packer.registeredTypes()[0];
      expect(Object.keys(one).sort()).toEqual(["type", "class", "packer"].sort());
      expect(one.type).toEqual(0x01);
      expect(one.class).toEqual(ValueOne);
      expect(one.packer).toBeInstanceOf(Function);

      const two = packer.registeredTypes()[1];
      expect(Object.keys(two).sort()).toEqual(["type", "class", "packer"].sort());
      expect(two.type).toEqual(0x02);
      expect(two.class).toEqual(ValueTwo);
      expect(two.packer).toBeInstanceOf(Function);
    });
    const valueMsgpacked = Uint8Array.of(
      0xc7,
      0x0f,
      0x01,
      ...new TextEncoder().encode("value_msgpacked"),
    );

    describe("when it has no ext type but a super class has", () => {
      class Value {
        toMsgpackExt(): string {
          return "value_msgpacked";
        }
      }
      beforeEach(() => {
        packer.registerType(0x01, Value, "toMsgpackExt");
      });

      describe("when it is a child class", () => {
        class InheritedValue extends Value {}

        it('is expected to eq "\\xC7\\x0F\\x01value_msgpacked"', () => {
          expect(packer.pack(new InheritedValue()).toS()).toEqual(valueMsgpacked);
        });

        describe("when it is a grandchild class", () => {
          class InheritedTwiceValue extends InheritedValue {}

          it('is expected to eq "\\xC7\\x0F\\x01value_msgpacked"', () => {
            expect(packer.pack(new InheritedTwiceValue()).toS()).toEqual(valueMsgpacked);
          });
        });
      });
    });

    describe("when it and its super class has an ext type", () => {
      class Value {
        toMsgpackExt(): string {
          return "value_msgpacked";
        }
      }
      class InheritedValue extends Value {
        override toMsgpackExt(): string {
          return "inherited_value_msgpacked";
        }
      }
      beforeEach(() => {
        packer.registerType(0x01, Value, "toMsgpackExt");
        packer.registerType(0x02, InheritedValue, "toMsgpackExt");
      });

      describe("when it is a child class", () => {
        it('is expected to eq "\\xC7\\x19\\x02inherited_value_msgpacked"', () => {
          expect(packer.pack(new InheritedValue()).toS()).toEqual(
            Uint8Array.of(
              0xc7,
              0x19,
              0x02,
              ...new TextEncoder().encode("inherited_value_msgpacked"),
            ),
          );
        });
      });

      describe("even when it is a child class", () => {
        it('is expected to eq "\\xC7\\x0F\\x01value_msgpacked"', () => {
          expect(packer.pack(new Value()).toS()).toEqual(valueMsgpacked);
        });
      });
    });

    describe("when it has no ext type but an included module has", () => {
      it('is expected to eq "\\xC7\\x0F\\x01value_msgpacked"', () => {
        const Mod = defineModule({
          toMsgpackExt(): string {
            return "value_msgpacked";
          },
        });
        packer.registerType(0x01, Mod, "toMsgpackExt");
        class Value {}
        include(Value, Mod);
        expect(packer.pack(new Value()).toS()).toEqual(valueMsgpacked);
      });
    });

    describe("when it has no ext type but it was extended by a module which has one", () => {
      it('is expected to eq "\\xC7\\x0F\\x01value_msgpacked"', () => {
        const Mod = defineModule({
          toMsgpackExt(): string {
            return "value_msgpacked";
          },
        });
        const object = extend({}, Mod);
        packer.registerType(0x01, Mod, "toMsgpackExt");
        expect(packer.pack(object).toS()).toEqual(valueMsgpacked);
      });
    });

    for (const klass of [Hash, Array] as (new () => object)[]) {
      const Value = class extends klass {};
      const subject = () => packer.pack(new Value()).toS();

      it(`defaults to ${klass.name} packer if no extension is present`, () => {
        expect(subject()).toEqual(MessagePack.dump(new klass()));
      });

      it(`uses core type extension for ${klass.name}`, () => {
        packer.registerType(0x01, Value, null, () => "value_msgpacked");
        expect(subject()).toEqual(bin("\xC7\x0F\x01value_msgpacked"));
      });
    }

    describe("when registering a type for symbols", () => {
      // BLOCKED: msgpack-symbol-ext-packer-arm-and-extended-object-lookup
      it.skip("packs symbols in an ext type", () => {});
    });
  });

  describe("fixnum and bignum", () => {
    it("fixnum.to_msgpack", () => {
      expect(rbFSend(23, "toMsgpack")).toEqual(bin("\x17"));
    });

    it("fixnum.to_msgpack(packer)", () => {
      rbFSend(23, "toMsgpack", packer);
      expect(packer.toS()).toEqual(bin("\x17"));
    });

    it("bignum.to_msgpack", () => {
      expect(rbFSend(-4294967296, "toMsgpack")).toEqual(
        bin("\xD3\xFF\xFF\xFF\xFF\x00\x00\x00\x00"),
      );
    });

    it("bignum.to_msgpack(packer)", () => {
      rbFSend(-4294967296, "toMsgpack", packer);
      expect(packer.toS()).toEqual(bin("\xD3\xFF\xFF\xFF\xFF\x00\x00\x00\x00"));
    });

    it("unpack(fixnum)", () => {
      expect(MessagePack.unpack(bin("\x17"))).toBe(23);
    });

    it("unpack(bignum)", () => {
      expect(MessagePack.unpack(bin("\xD3\xFF\xFF\xFF\xFF\x00\x00\x00\x00"))).toBe(-4294967296);
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
        expect(new ExtensionValue(1, "a".repeat(n)).toMsgpack()).toEqual(
          Uint8Array.of(b, 1, ...new TextEncoder().encode("a".repeat(n))),
        );
      });
    }

    const ext = (header: number[], type: number, n: number): Uint8Array =>
      Uint8Array.of(...header, type & 0xff, ...new Uint8Array(n).fill(0x61));

    it("msgpack ext 8 format", () => {
      expect(new ExtensionValue(1, "").toMsgpack()).toEqual(ext([0xc7, 0], 1, 0));
      expect(new ExtensionValue(-1, "a".repeat(255)).toMsgpack()).toEqual(
        ext([0xc7, 255], -1, 255),
      );
    });

    it("msgpack ext 16 format", () => {
      expect(new ExtensionValue(1, "a".repeat(256)).toMsgpack()).toEqual(
        ext([0xc8, 0x01, 0x00], 1, 256),
      );
      expect(new ExtensionValue(-1, "a".repeat(65535)).toMsgpack()).toEqual(
        ext([0xc8, 0xff, 0xff], -1, 65535),
      );
    });

    it("msgpack ext 32 format", () => {
      expect(new ExtensionValue(1, "a".repeat(65536)).toMsgpack()).toEqual(
        ext([0xc9, 0, 0x01, 0x00, 0x00], 1, 65536),
      );
      expect(new ExtensionValue(-1, "a".repeat(65538)).toMsgpack()).toEqual(
        ext([0xc9, 0, 0x01, 0x00, 0x02], -1, 65538),
      );
    });
  });

  it("doesn't allow #dup or #clone", () => {
    expect(rbObjRespondTo(packer, "dup")).toBe(false);
    expect(rbObjRespondTo(packer, "clone")).toBe(false);
  });

  it("doesn't crash when marking an uninitialized buffer", () => {
    expect(new Packer().buffer).toBeInstanceOf(Buffer);
  });

  it("doesn't crash when using recursive packers concurrently", () => {
    class HashWithIndifferentAccess extends Hash<unknown, unknown> {}
    const msgpack = new Factory();
    msgpack.registerType(0x02, HashWithIndifferentAccess, {
      packer: (value: HashWithIndifferentAccess, packer: Packer) => {
        packer.write(new Uint8Array(600_0000).fill(0x61));
        packer.write(value.toH());
      },
      unpacker: (unpacker: Unpacker) => new HashWithIndifferentAccess(unpacker.read()),
      recursive: true,
    });

    const packer = msgpack.packer();

    const topHash = new HashWithIndifferentAccess();
    let hash = topHash;
    for (let i = 0; i < 10; i++) {
      const newHash = new HashWithIndifferentAccess();
      hash.set("a", newHash);
      hash = newHash;
    }
    packer.write(topHash);
    packer.write(topHash);
    packer.fullPack();
  });
});
