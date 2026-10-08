import { beforeEach, describe, expect, it } from "vitest";
import { EOFError, StringIO, rbObjIsKindOf } from "@blazetrails/ruby-compat";
import {
  ExtensionValue,
  MalformedFormatError,
  MessagePack,
  UnexpectedTypeError,
  Unpacker,
} from "./index.js";

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

  it("read_map_header succeeds", () => {
    unpacker.feed(Uint8Array.of(0x81));
    expect(unpacker.readMapHeader()).toEqual(1);
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

  it("reset clears internal buffer", () => {
    unpacker.feed(Uint8Array.of(0x91));
    unpacker.reset();
    unpacker.feed(Uint8Array.of(0x01));

    expect(unpacker.read()).toEqual(1);
  });

  it("read raises invalid byte error", () => {
    unpacker.feed(Uint8Array.of(0xc1));
    expect(() => unpacker.read()).toThrow(MalformedFormatError);
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

  describe("ext formats", () => {
    [1, 2, 4, 8, 16].forEach((n, i) => {
      const b = [0xd4, 0xd5, 0xd6, 0xd7, 0xd8][i];
      it(`msgpack fixext ${n} format`, () => {
        const unpacker = new Unpacker({ allowUnknownExt: true });
        const a = new TextEncoder().encode("a".repeat(n));
        expect(unpacker.feed(Uint8Array.of(b, 1, ...a)).unpack()).toEqual(new ExtensionValue(1, a));
        expect(unpacker.feed(Uint8Array.of(b, 0xff, ...a)).unpack()).toEqual(
          new ExtensionValue(-1, a),
        );
      });
    });
  });

  const buffer1 = MessagePack.pack({ foo: "bar" });
  const buffer2 = MessagePack.pack({ hello: { world: [1, 2, 3] } });
  const buffer3 = MessagePack.pack({ x: "y" });
  const expected = [{ foo: "bar" }, { hello: { world: [1, 2, 3] } }, { x: "y" }];

  describe("#each", () => {
    describe("with a buffer", () => {
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
        expect(objects).toEqual(expected);
      });
    });
  });

  describe("#feed_each", () => {
    it("handles chunked data", () => {
      const objects: unknown[] = [];
      for (const ch of [...buffer1, ...buffer2, ...buffer3]) {
        unpacker.feedEach(Uint8Array.of(ch), (obj) => objects.push(obj));
      }
      expect(objects).toEqual(expected);
    });
  });
});
