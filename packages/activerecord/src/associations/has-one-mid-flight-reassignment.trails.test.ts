/**
 * TS-only regression: `loadHasOne`'s post-await `syncToAssociationInstance`
 * must not clobber a target that was reassigned while the reader query was
 * still in flight.
 *
 * Rails' `find_target` is synchronous, so it can never observe a reassignment
 * mid-load. Our loader awaits DB I/O, which opens the window. has_one has no
 * owner-side stale key (Rails' `Association#stale_state` is nil for foreign
 * associations — only `BelongsToAssociation` overrides it), so the belongs_to
 * FK snapshot does not transfer; the holder's own loaded-ness is the signal.
 */
import { describe, expect, test } from "vitest";

import { fixtures } from "../test-helpers/fixtures.js";
import { Account } from "../test-helpers/models/account.js";
import { Firm } from "../test-helpers/models/company.js";

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
});
