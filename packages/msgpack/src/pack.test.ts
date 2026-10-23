import { describe, expect, it } from "vitest";
import { StringIO, rbCString, rbFSend, rbObjClass } from "@blazetrails/ruby-compat";
import { MessagePack, Packer } from "./index.js";

const bytes = (string: string) => Uint8Array.from(string, (c) => c.charCodeAt(0));

describe("MessagePack", () => {
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
    expect(bytes(s01.string())).toEqual(rbFSend([1, 2], "toMsgpack"));

    const s02 = new StringIO();
    MessagePack.pack(new CustomPack02(), s02);
    expect(bytes(s02.string())).toEqual(rbFSend([1, 2], "toMsgpack"));

    const s03 = new StringIO();
    new CustomPack01().toMsgpack(s03);
    expect(bytes(s03.string())).toEqual(rbFSend([1, 2], "toMsgpack"));

    const s04 = new StringIO();
    new CustomPack02().toMsgpack(s04);
    expect(bytes(s04.string())).toEqual(rbFSend([1, 2], "toMsgpack"));
  });
});
