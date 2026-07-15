import { describe, it, expect } from "vitest";
import { BinaryData } from "@blazetrails/activemodel";
import { fixtures } from "./test-helpers/fixtures.js";
import { Binary } from "./test-helpers/models/binary.js";
import { typeCastedBinds } from "./connection-adapters/abstract/database-statements.js";

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
  it("unwraps Type::Binary::Data for subscribers", () => {
    // `type_casted_binds` feeds the sql.active_record payload that LogSubscriber
    // renders. Rails type_casts every bind, so a Data shows as its byte string
    // (abstract/quoting.rb:96). Ours does not route through typeCast — that is
    // the wider type_casted_binds story — so this guards the one unwrap that
    // keeps the wrapper from rendering as "[object Object]" in query logs.
    const bytes = new Uint8Array([0xde, 0xad]);
    const out = typeCastedBinds([{ valueForDatabase: new BinaryData(bytes) }]);
    expect(String(out[0])).not.toBe("[object Object]");
    expect(out[0]).toEqual(bytes);
  });
});
