/**
 * `update_all` / `delete_all` on a model with no primary key.
 *
 * Rails takes ONE path in both methods — `arel.compile_update` /
 * `arel.compile_delete` with `key = table[primary_key]`
 * (relation.rb:606-616, :1023-1033). A pkless model reaches that with
 * `table[nil]`; the key is only rendered when the statement needs the
 * `WHERE (pk) IN (SELECT ...)` rewrite, so the plain case emits an ordinary
 * UPDATE/DELETE. trails used to gate entry to that path on the PK's shape and
 * fall back to a bespoke UpdateManager/DeleteManager, which silently dropped
 * the group/having/limit/order rewrite. These pin that the single Rails path
 * still serves a pkless model; the rewrite arms themselves are not covered
 * because they are ill-defined for a pkless model in Rails too (`table[nil]`
 * renders an empty identifier).
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { Edge } from "../test-helpers/models/edge.js";

fixtures({});

describe("update_all / delete_all on a model without a primary key", () => {
  it("update_all updates the matching rows", async () => {
    await Edge.create({ source_id: 901, sink_id: 902 });
    await Edge.create({ source_id: 903, sink_id: 904 });

    const updated = await Edge.where({ source_id: 901 }).updateAll({ sink_id: 999 });
    expect(updated).toBe(1);
    expect(await Edge.where({ source_id: 901, sink_id: 999 }).count()).toBe(1);

    await Edge.where({ source_id: [901, 903] }).deleteAll();
  });

  it("delete_all deletes the matching rows", async () => {
    await Edge.create({ source_id: 911, sink_id: 912 });
    await Edge.create({ source_id: 913, sink_id: 914 });

    const deleted = await Edge.where({ source_id: 911 }).deleteAll();
    expect(deleted).toBe(1);
    expect(await Edge.where({ source_id: 911 }).count()).toBe(0);
    expect(await Edge.where({ source_id: 913 }).count()).toBe(1);

    await Edge.where({ source_id: 913 }).deleteAll();
  });
});
