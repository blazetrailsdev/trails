import { describe, it, expect } from "vitest";
import { Attribute, BinaryData, BinaryType } from "@blazetrails/activemodel";
import { fixtures } from "./test-fixtures.js";
import { Binary } from "./test-helpers/models/binary.js";
import { Base } from "./base.js";

/**
 * Trails-only: no Rails counterpart. `BinaryType#serialize` returns a
 * `Type::Binary::Data` (activemodel/.../type/binary.rb:30-33), so every bind
 * path for a binary attribute carries the wrapper, and Rails unwraps it in
 * `type_cast` (abstract/quoting.rb:96, `when ... Type::Binary::Data then
 * value.to_s`).
 *
 * Rails has no equivalent test because its bind path cannot regress this way.
 * Ours can, and did: without the rb:96 arm SQLite/MySQL raise `can't cast`, and
 * mysql2's bind path (which does not route through `typeCast`) silently matched
 * zero rows. The byte round-trip itself is covered by Rails' own `mixed
 * encoding` in binary.test.ts — this pins the *bound where clause*, which a
 * create + find(id) round-trip never reaches.
 */
describe("binary bind round-trip", () => {
  fixtures({});

  it("matches a binary column through a bound where clause", async () => {
    // Non-UTF8-decodable: catches any lossy toString()/UTF-8 path, since
    // `Data#toString` would replace every byte >= 0x80 with U+FFFD.
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
    // `type_casted_binds` feeds the sql.active_record payload that LogSubscriber
    // renders. Rails type_casts every bind, so a Data shows as its byte string
    // (abstract/quoting.rb:96), and we now self-dispatch through the adapter's
    // `type_cast`, so this guards the unwrap that keeps the wrapper from
    // rendering as "[object Object]" in query logs.
    const bytes = new Uint8Array([0xde, 0xad]);
    const conn = await Base.connection;
    // `type_casted_binds` reaches for `ActiveModel::Attribute` (rb:224), which
    // is what the bind path actually carries; `BinaryType#serialize` is what
    // puts the `Data` wrapper inside it (binary.rb:30-33).
    const bind = Attribute.withCastValue("data", bytes, new BinaryType());
    expect(bind.valueForDatabase).toBeInstanceOf(BinaryData);
    const out = conn.typeCastedBinds([bind])!;
    expect(String(out[0])).not.toBe("[object Object]");
    // PG's type_cast returns a Buffer (bytea); normalize before comparing bytes.
    expect(new Uint8Array(out[0] as Uint8Array)).toEqual(bytes);
  });

  it("casts both byte forms Rails reaches type_cast with", async () => {
    // Rails sees bytes here two ways — `Type::Binary::Data`, which
    // `BinaryType#serialize` wraps at the source (binary.rb:30-33), and a
    // BINARY/ASCII-8BIT `String` bound straight to `execute(sql, binds)`. A JS
    // string can't hold arbitrary bytes, so trails' raw-`execute` callers wrap
    // that second form in a `Data` too: rb:96's `value.to_s` is the single byte
    // arm, and rb:102's `when nil, Numeric, String` stays string-only as in
    // Ruby. An unwrapped byte view therefore falls to the `raise TypeError`.
    const bytes = new Uint8Array([0xde, 0xad]);
    expect(new BinaryType().serialize(bytes)).toBeInstanceOf(BinaryData);
    const conn = await Base.connection;
    expect(new Uint8Array(conn.typeCast(new BinaryData(bytes)) as Uint8Array)).toEqual(bytes);
    expect(() => conn.typeCast(bytes)).toThrow(TypeError);
  });
});
