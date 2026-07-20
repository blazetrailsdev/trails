/**
 * TS-only regression: `loadHasOne`'s post-await `syncToAssociationInstance`
 * must not clobber a target that was reassigned while the reader query was
 * still in flight.
 *
 * Rails' `find_target` is synchronous, so it can never observe a reassignment
 * mid-load. Our loader awaits DB I/O, which opens the window. has_one has no
 * owner-side stale key (Rails' `Association#stale_state` is nil for foreign
 * associations — only `BelongsToAssociation` overrides it), so the belongs_to
 * FK snapshot does not transfer; a false→true flip in the holder's loaded-ness
 * across the await is the equivalent signal.
 */
import { describe, expect, test } from "vitest";

import { fixtures } from "../test-helpers/fixtures.js";
import { Account } from "../test-helpers/models/account.js";
import { Firm } from "../test-helpers/models/company.js";
import { Minivan } from "../test-helpers/models/minivan.js";

describe("has_one mid-flight reassignment", () => {
  fixtures(["companies", "accounts"]);

  test("an in-flight reader does not clobber a concurrently assigned target", async () => {
    const firm = (await Firm.first()) as Firm;
    const other = await Account.create({ credit_limit: 42 });

    const inFlight = firm.loadHasOne("account");
    firm.association("account").setTarget(other);

    await inFlight;

    expect(firm.association("account").target).toBe(other);
  });

  test("the in-flight reader resolves to the assigned target, not the persisted row", async () => {
    const firm = (await Firm.first()) as Firm;
    const other = await Account.create({ credit_limit: 42 });

    const inFlight = firm.loadHasOne("account");
    firm.association("account").setTarget(other);

    // The awaited loader must hand back the newer target too: returning the
    // stale row while the holder keeps the new one would split the two views.
    expect(await inFlight).toBe(other);
  });

  test("an assignment to null is not resurrected by the in-flight reader", async () => {
    const firm = (await Firm.first()) as Firm;

    const inFlight = firm.loadHasOne("account");
    firm.association("account").setTarget(null);

    expect(await inFlight).toBeNull();
    expect(firm.association("account").target).toBeNull();
  });
});

describe("has_one stale target re-fetch", () => {
  fixtures(["minivans", "dashboards", "speedometers"]);

  test("a stale target is re-fetched rather than short-circuited by the guard", async () => {
    // The guard keys on the loaded-ness *flip*, not the final state: a stale
    // target leaves the holder loaded at entry while still requiring a
    // re-fetch, and that re-fetch must win. Guarding on the final state alone
    // silently pins the stale row here (it regressed
    // has-one-through-associations mid-development).
    //
    // `Minivan#dashboard` is has_one :through, but the through branches in
    // `loadHasOne` that return early (`loadHasOneThrough` /
    // `_loadSingularThroughViaDisableJoinsScope`) are not the ones this shape
    // takes — it falls through the AssociationScope path and reaches the
    // guard with `holderLoadedAtStart === true`, which is the arm under test.
    // A plain has_one cannot stand in here: with `stale_state` nil for
    // foreign associations, its holder is never stale, so the through owner's
    // belongs_to key is the only way to reach this arm.
    const minivan = (await Minivan.first()) as Minivan;
    const holder = minivan.association("dashboard");

    const first = (await holder.loadTarget()) as { id?: unknown } | null;
    expect(first).not.toBeNull();
    expect(holder.isStaleTarget?.() ?? false).toBe(false);

    const otherSpeedometerId = "s2";
    (minivan as unknown as Record<string, unknown>).speedometer_id = otherSpeedometerId;
    expect(holder.isStaleTarget?.()).toBe(true);

    const refetched = (await holder.loadTarget()) as { id?: unknown } | null;
    expect(refetched?.id).not.toBe(first?.id);
  });
});
