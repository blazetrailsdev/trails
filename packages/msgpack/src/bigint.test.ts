import { describe, expect, it } from "vitest";
import { MessagePack } from "./index.js";

describe("MessagePack::Bigint", () => {
  it("serialize and deserialize arbitrary sized integer", () => {
    for (const int of [
      1,
      -1,
      120938120391283122132313n,
      -21903120391203912391023920332103n,
      210290021321301203912933021323n,
    ]) {
      expect(MessagePack.Bigint.fromMsgpackExt(MessagePack.Bigint.toMsgpackExt(int)) == int).toBe(
        true,
      );
    }
  });

  it("has a stable format", () => {
    const b = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
    for (const [int, payload] of [
      [120938120391283122132313n, b("\x00\x9F\xF4UY\x11\x92\x9A?\x00\x00\x19\x9C")],
      [
        -21903120391203912391023920332103n,
        b("\x01/\xB2\xBDG\xBD\xDE\xAA\xEBt\xCC\x8A\xC1\x00\x00\x01\x14"),
      ],
      [
        210290021321301203912933021323n,
        b('\x00\xC4\xD8\x96\x8Bm\xCB\xC7\x03\xA7{\xD4"\x00\x00\x00\x02'),
      ],
    ] as const) {
      expect(MessagePack.Bigint.toMsgpackExt(int)).toEqual(payload);
      expect(MessagePack.Bigint.fromMsgpackExt(payload)).toEqual(int);
    }
  });
});
