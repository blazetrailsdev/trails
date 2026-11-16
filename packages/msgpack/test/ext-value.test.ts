import { describe, expect, it } from "vitest";
import { RangeError, rbEqual, rbObjDup } from "@blazetrails/ruby-compat";
import { MessagePack, Packer } from "../lib/index.js";

const bytes = (string: string) => Uint8Array.from(string, (c) => c.charCodeAt(0));

describe("MessagePack::ExtensionValue", () => {
  const subject = () => new MessagePack.ExtensionValue(1, "data");

  describe("#type/#type=", () => {
    it("returns value set by #initialize", () => {
      expect(subject().type).toBe(1);
    });

    it("assigns a value", () => {
      const s = subject();
      s.type = 2;
      expect(s.type).toBe(2);
    });
  });

  describe("#payload/#payload=", () => {
    it("returns value set by #initialize", () => {
      expect(subject().payload).toBe("data");
    });

    it("assigns a value", () => {
      const s = subject();
      s.payload = "a";
      expect(s.payload).toBe("a");
    });
  });

  describe("#==/#eql?/#hash", () => {
    it("returns equivalent if the content is same", () => {
      const ext1 = new MessagePack.ExtensionValue(1, "data");
      const ext2 = new MessagePack.ExtensionValue(1, "data");
      expect(rbEqual(ext1, ext2)).toBe(true);
      expect(ext1.eql(ext2)).toBe(true);
      expect(ext1.hash() === ext2.hash()).toBe(true);
    });

    it("returns not equivalent if type is not same", () => {
      const ext1 = new MessagePack.ExtensionValue(1, "data");
      const ext2 = new MessagePack.ExtensionValue(2, "data");
      expect(rbEqual(ext1, ext2)).toBe(false);
      expect(ext1.eql(ext2)).toBe(false);
      expect(ext1.hash() === ext2.hash()).toBe(false);
    });

    it("returns not equivalent if payload is not same", () => {
      const ext1 = new MessagePack.ExtensionValue(1, "data");
      const ext2 = new MessagePack.ExtensionValue(1, "value");
      expect(rbEqual(ext1, ext2)).toBe(false);
      expect(ext1.eql(ext2)).toBe(false);
      expect(ext1.hash() === ext2.hash()).toBe(false);
    });
  });

  describe("#to_msgpack", () => {
    it("serializes very short payload", () => {
      const ext = new MessagePack.ExtensionValue(1, "a".repeat(2)).toMsgpack();
      expect(ext).toEqual(bytes("\xd5\x01" + "a".repeat(2)));
    });

    it("serializes short payload", () => {
      const ext = new MessagePack.ExtensionValue(1, "a".repeat(18)).toMsgpack();
      expect(ext).toEqual(bytes("\xc7\x12\x01" + "a".repeat(18)));
    });

    it("serializes long payload", () => {
      const ext = new MessagePack.ExtensionValue(1, "a".repeat(65540)).toMsgpack();
      expect(ext).toEqual(bytes("\xc9\x00\x01\x00\x04\x01" + "a".repeat(65540)));
    });

    it("with a packer serializes to a packer", () => {
      const ext = new MessagePack.ExtensionValue(1, "aa");
      const packer = new Packer();
      ext.toMsgpack(packer);
      expect(packer.buffer.toS()).toEqual(bytes("\xd5\x01aa"));
    });

    for (const type of [-129, -65540, -(2 ** 40), 128, 65540, 2 ** 40]) {
      describe(`with invalid type (${type})`, () => {
        it("raises RangeError", () => {
          expect(() => new MessagePack.ExtensionValue(type, "a").toMsgpack()).toThrow(RangeError);
        });
      });
    }
  });

  describe("#dup", () => {
    it("duplicates", () => {
      const ext1 = new MessagePack.ExtensionValue(1, "data");
      const ext2 = rbObjDup(ext1);
      ext2.type = 2;
      ext2.payload = "data2";
      expect(ext1.type).toBe(1);
      expect(ext1.payload).toBe("data");
    });
  });
});
