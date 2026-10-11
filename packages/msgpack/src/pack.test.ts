import { describe, expect, it } from "vitest";
import { StringIO, rbCString, rbFSend, rbObjClass } from "@blazetrails/ruby-compat";
import { Array as ArrayExt, Hash } from "./core-ext.js";
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
    expect(rbObjClass(Hash.toMsgpack({}))).toBe(rbCString);
    expect(rbObjClass(ArrayExt.toMsgpack([]))).toBe(rbCString);
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
      return ArrayExt.toMsgpack([1, 2], pk);
    }
  }

  it("calls custom to_msgpack method", () => {
    expect(MessagePack.pack(new CustomPack01())).toEqual(ArrayExt.toMsgpack([1, 2]));
    expect(MessagePack.pack(new CustomPack02())).toEqual(ArrayExt.toMsgpack([1, 2]));
    expect(new CustomPack01().toMsgpack()).toEqual(ArrayExt.toMsgpack([1, 2]));
    expect(new CustomPack02().toMsgpack()).toEqual(ArrayExt.toMsgpack([1, 2]));
  });

  it("calls custom to_msgpack method with io", () => {
    const s01 = new StringIO();
    MessagePack.pack(new CustomPack01(), s01);
    expect(bytes(s01.string())).toEqual(ArrayExt.toMsgpack([1, 2]));

    const s02 = new StringIO();
    MessagePack.pack(new CustomPack02(), s02);
    expect(bytes(s02.string())).toEqual(ArrayExt.toMsgpack([1, 2]));

    const s03 = new StringIO();
    new CustomPack01().toMsgpack(s03);
    expect(bytes(s03.string())).toEqual(ArrayExt.toMsgpack([1, 2]));

    const s04 = new StringIO();
    new CustomPack02().toMsgpack(s04);
    expect(bytes(s04.string())).toEqual(ArrayExt.toMsgpack([1, 2]));
  });
});
