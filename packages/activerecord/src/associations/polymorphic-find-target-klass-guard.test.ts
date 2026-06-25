/**
 * Mirrors vendor/rails/activerecord/test/cases/associations/belongs_to_associations_test.rb
 *
 * Guards Association#findTargetNeeded's `&& klass` factor (Rails `find_target?`,
 * association.rb:320): a polymorphic belongs_to whose `_type` column is nil
 * resolves `klass` to undefined, so even with the foreign key present the
 * association must NOT issue a query. Before the fix, findTargetNeeded omitted
 * the klass factor and proceeded into the async load with an undefined class.
 * Uses the canonical `Sponsor` model and `sponsors` table — no `defineSchema`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { Sponsor } from "../test-helpers/models/sponsor.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { assertNoQueries } from "../testing/query-assertions.js";

describe("BelongsToAssociationsTest", () => {
  useHandlerFixtures(["sponsors"]);

  beforeAll(async () => {
    registerModel(Sponsor);
    await Sponsor.loadSchema();
  });

  it("polymorphic association class", async () => {
    // A foreign key with no type column: klass is nil, so find_target? is false.
    const sponsor = Sponsor.new({ sponsorable_id: 1 });
    const sponsorable = sponsor.association("sponsorable");

    expect(sponsorable.klass).toBeUndefined();

    // find_target? short-circuits on `&& klass`: with klass nil it is false
    // even though the foreign key is present, so no query is attempted.
    const findTargetNeeded = (sponsorable as unknown as { findTargetNeeded(): boolean })
      .findTargetNeeded;
    expect(findTargetNeeded.call(sponsorable)).toBe(false);

    let target: unknown = "unset";
    await assertNoQueries(false, async () => {
      target = await sponsorable.loadTarget();
    });
    expect(target).toBeNull();
  });
});
