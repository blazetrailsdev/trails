import { describe, it, expect } from "vitest";
import { Attribute, BinaryData, BinaryType } from "@blazetrails/activemodel";
import { fixtures } from "./test-fixtures.js";
import { Binary } from "./test-helpers/models/binary.js";
import { Base } from "./base.js";

describe("binary bind round-trip", () => {
  fixtures({});

  it("matches a binary column through a bound where clause", async () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x1f, 0x8b]);
    await Binary.create({ name: "gzip", data: bytes });
    const found = await Binary.where({ data: bytes });
    expect(found.length).toBe(1);
    expect(new Uint8Array(found[0].data)).toEqual(bytes);
  });
});

describe("binary type_casted_binds payload", () => {
  fixtures({});

  it("unwraps Type::Binary::Data for subscribers", async () => {
    const bytes = new Uint8Array([0xde, 0xad]);
    const conn = await Base.connection;
    const bind = Attribute.withCastValue("data", bytes, new BinaryType());
    expect(bind.valueForDatabase).toBeInstanceOf(BinaryData);
    const out = conn.typeCastedBinds([bind])!;
    expect(String(out[0])).not.toBe("[object Object]");
    expect(new Uint8Array(out[0] as Uint8Array)).toEqual(bytes);
  });

  it("casts both byte forms Rails reaches type_cast with", async () => {
    const bytes = new Uint8Array([0xde, 0xad]);
    expect(new BinaryType().serialize(bytes)).toBeInstanceOf(BinaryData);
    const conn = await Base.connection;
    expect(new Uint8Array(conn.typeCast(new BinaryData(bytes)) as Uint8Array)).toEqual(bytes);
    expect(() => conn.typeCast(bytes)).toThrow(TypeError);
  });
});
