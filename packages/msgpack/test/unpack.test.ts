import { describe, expect, it } from "vitest";
import { MessagePack } from "../lib/index.js";

const pack = (...c: number[]) => Uint8Array.from(c);
const cat = (a: Uint8Array, s: string) =>
  Uint8Array.from([...a, ...Uint8Array.from(s, (c) => c.charCodeAt(0))]);
const bytes = (string: string) => Uint8Array.from(string, (c) => c.charCodeAt(0));

describe("MessagePack", () => {
  it("MessagePack.unpack symbolize_keys", () => {
    const symbolizedHash = { ":a": "b", ":c": "d" };
    expect(MessagePack.load(MessagePack.pack({ a: "b", c: "d" }), { symbolizeKeys: true })).toEqual(
      symbolizedHash,
    );
    expect(
      MessagePack.unpack(MessagePack.pack({ a: "b", c: "d" }), { symbolizeKeys: true }),
    ).toEqual(symbolizedHash);
  });

  it("Unpacker#read symbolize_keys", () => {
    const unpacker = new MessagePack.Unpacker({ symbolizeKeys: true });
    const symbolizedHash = { ":a": "b", ":c": "d" };
    expect(unpacker.feed(MessagePack.pack({ a: "b", c: "d" })).read()).toEqual(symbolizedHash);
  });

  it("msgpack str 8 type", () => {
    expect(MessagePack.unpack(pack(0xd9, 0x00))).toBe("");
    expect(MessagePack.unpack(cat(pack(0xd9, 0x01), "a"))).toBe("a");
    expect(MessagePack.unpack(cat(pack(0xd9, 0x02), "aa"))).toBe("aa");
  });

  it("msgpack str 16 type", () => {
    expect(MessagePack.unpack(pack(0xda, 0x00, 0x00))).toBe("");
    expect(MessagePack.unpack(cat(pack(0xda, 0x00, 0x01), "a"))).toBe("a");
    expect(MessagePack.unpack(cat(pack(0xda, 0x00, 0x02), "aa"))).toBe("aa");
  });

  it("msgpack str 32 type", () => {
    expect(MessagePack.unpack(pack(0xdb, 0x00, 0x00, 0x00, 0x00))).toBe("");
    expect(MessagePack.unpack(cat(pack(0xdb, 0x00, 0x00, 0x00, 0x01), "a"))).toBe("a");
    expect(MessagePack.unpack(cat(pack(0xdb, 0x00, 0x00, 0x00, 0x02), "aa"))).toBe("aa");
  });

  it("msgpack bin 8 type", () => {
    expect(MessagePack.unpack(pack(0xc4, 0x00))).toEqual(bytes(""));
    expect(MessagePack.unpack(cat(pack(0xc4, 0x01), "a"))).toEqual(bytes("a"));
    expect(MessagePack.unpack(cat(pack(0xc4, 0x02), "aa"))).toEqual(bytes("aa"));
  });

  it("msgpack bin 16 type", () => {
    expect(MessagePack.unpack(pack(0xc5, 0x00, 0x00))).toEqual(bytes(""));
    expect(MessagePack.unpack(cat(pack(0xc5, 0x00, 0x01), "a"))).toEqual(bytes("a"));
    expect(MessagePack.unpack(cat(pack(0xc5, 0x00, 0x02), "aa"))).toEqual(bytes("aa"));
  });

  it("msgpack bin 32 type", () => {
    expect(MessagePack.unpack(pack(0xc6, 0x00, 0x00, 0x00, 0x00))).toEqual(bytes(""));
    expect(MessagePack.unpack(cat(pack(0xc6, 0x00, 0x00, 0x00, 0x01), "a"))).toEqual(bytes("a"));
    expect(MessagePack.unpack(cat(pack(0xc6, 0x00, 0x00, 0x00, 0x02), "aa"))).toEqual(bytes("aa"));
  });
});
