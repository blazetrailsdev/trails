import { describe, it, expect } from "vitest";
import { fixtures } from "./test-helpers/fixtures.js";
import { Binary } from "./test-helpers/models/binary.js";

/**
 * Trails-only: `BinaryType#serialize` returns a `Type::Binary::Data`
 * (activemodel/.../type/binary.rb:30-33), so every bind path for a binary
 * attribute carries the wrapper. Rails unwraps it in `type_cast`
 * (abstract/quoting.rb:96, `when ... Type::Binary::Data then value.to_s`).
 *
 * These pin the *bind* path specifically — a create + `find(id)` round-trip does
 * not reach it, which is how the gap survived review the first time. Without the
 * rb:96 arm SQLite/MySQL raise `can't cast`, and mysql2's bind path (which does
 * not route through `typeCast`) silently matched zero rows.
 */
describe("binary bind round-trip", () => {
  fixtures({});

  // Non-UTF8-decodable: catches any lossy toString()/UTF-8 path, since
  // `Data#toString` would replace every byte >= 0x80 with U+FFFD.
  const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x1f, 0x8b]);

  it("matches a binary column through a bound where clause", async () => {
    await Binary.create({ name: "gzip", data: bytes });
    const found = await Binary.where({ data: bytes });
    expect(found.length).toBe(1);
    expect(new Uint8Array(found[0].data)).toEqual(bytes);
  });

  it("round-trips bytes byte-exactly through a binary column", async () => {
    const rec = await Binary.create({ name: "gzip", data: bytes });
    const found = await Binary.find(rec.id);
    expect(new Uint8Array(found.data)).toEqual(bytes);
  });
});
