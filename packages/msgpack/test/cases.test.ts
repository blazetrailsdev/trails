import { describe, expect, it } from "vitest";
import { rbEqual } from "@blazetrails/ruby-compat";
import { MessagePack } from "../lib/index.js";

const hex = (s: string) => Uint8Array.from(s.match(/../g)!, (h) => parseInt(h, 16));

describe("MessagePack", () => {
  const CASES = hex(
    "c2c3c000cc00cd0000ce00000000cf0000000000000000d000d10000d200000000d30000000000000000ffd0ffd1ffffd2ffffffffd3ffffffffffffffff7fcc7fcd00ffce0000ffffcf00000000ffffffffe0d0e0d1ff80d2ffff8000d3ffffffff80000000cb0000000000000000cb8000000000000000cb3ff0000000000000cbbff0000000000000a161da000161db0000000161a0da0000db000000009100dc000100dd000000010090dc0000dd0000000080de0000df0000000081a16161de0001a16161df00000001a1616191909191a161",
  );
  const CASES_JSON =
    '[false,true,null,0,0,0,0,0,0,0,0,0,-1,-1,-1,-1,-1,127,127,255,65535,4294967295,-32,-32,-128,-32768,-2147483648,0.0,-0.0,1.0,-1.0,"a","a","a","","","",[0],[0],[0],[],[],[],{},{},{},{"a":97},{"a":97},{"a":97},[[]],[["a"]]]';
  const CASES_COMPACT = hex(
    "c2c3c0000000000000000000ffffffffff7f7fccffcdffffceffffffffe0e0d080d18000d280000000cb0000000000000000cb8000000000000000cb3ff0000000000000cbbff0000000000000a161a161a161a0a0a091009100910090909080808081a1616181a1616181a1616191909191a161",
  );

  it("compare with json", () => {
    const ms: unknown[] = [];
    new MessagePack.Unpacker().feedEach(CASES, (m) => {
      ms.push(m);
    });

    const js = JSON.parse(CASES_JSON) as unknown[];

    ms.forEach((m, i) => {
      expect(rbEqual(m, js[i])).toBe(true);
    });
  });

  it("compare with compat", () => {
    const ms: unknown[] = [];
    new MessagePack.Unpacker().feedEach(CASES, (m) => {
      ms.push(m);
    });

    const cs: unknown[] = [];
    new MessagePack.Unpacker().feedEach(CASES_COMPACT, (c) => {
      cs.push(c);
    });

    ms.forEach((m, i) => {
      expect(rbEqual(m, cs[i])).toBe(true);
    });
  });
});
