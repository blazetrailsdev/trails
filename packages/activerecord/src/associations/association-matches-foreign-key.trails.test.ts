/**
 * `Association#matches_foreign_key?` (association.rb:411-418) — the inverse-wiring
 * FK match used by `inversable?`. Rails has ONE body:
 *
 *   if foreign_key_for?(record)
 *     record.read_attribute(reflection.foreign_key) == owner.id ||
 *       (foreign_key_for?(owner) && owner.read_attribute(reflection.foreign_key) == record.id)
 *   else
 *     owner.read_attribute(reflection.foreign_key) == record.id
 *   end
 *
 * trails carried two ports of it; the surviving one is pinned here on the two
 * cases the bodies disagreed on — a composite foreign key (`Array(foreign_key)`
 * against a composite `owner.id`) and the `foreign_key_for?(owner)` arm, which
 * only fires when owner and record share the FK column (the self-referential
 * `companies` table).
 */
import { describe, it, expect } from "vitest";

import { Base } from "../base.js";
import { fixtures } from "../test-fixtures.js";
import "../support/canonical-model-index.js";
import { Client, Firm } from "../test-helpers/models/company.js";
import { CpkBook, CpkOrder } from "../test-helpers/models/cpk.js";

type AssociationLike = { matchesForeignKey(record: Base): boolean };

const association = (record: Base, name: string): AssociationLike =>
  (record as unknown as { association(name: string): AssociationLike }).association(name);

describe("Association#matches_foreign_key?", () => {
  const { companies } = fixtures(["companies"]);

  it("matches a composite foreign key against the composite owner id", () => {
    const order = new CpkOrder({ id: [1, 2] });
    const book = new CpkBook({ id: [5, 7], shop_id: 1, order_id: 2 });
    const otherShopBook = new CpkBook({ id: [5, 8], shop_id: 3, order_id: 2 });

    expect(association(order, "books").matchesForeignKey(book)).toBe(true);
    expect(association(order, "books").matchesForeignKey(otherShopBook)).toBe(false);
  });

  it("matches through the owner's own foreign key when both records carry it", async () => {
    const firm = (await Firm.find(companies("first_firm").id)) as Base;
    const client = (await Client.find(companies("second_client").id)) as Base;

    // owner = client, record = firm: both live in `companies`, so
    // `foreign_key_for?(record)` is true but the firm's own `client_of` is not
    // the client's id — only the `foreign_key_for?(owner)` arm can match.
    expect(association(client, "firm").matchesForeignKey(firm)).toBe(true);
    expect(association(firm, "clientsOfFirm").matchesForeignKey(client)).toBe(true);
  });
});
