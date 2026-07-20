/**
 * TS-only audit repro: `loadHasOne`'s post-await `syncToAssociationInstance`
 * clobbers a target that was reassigned while the reader query was still in
 * flight.
 *
 * Rails' `find_target` (`associations/association.rb:194`) is synchronous, so
 * it can never observe a reassignment mid-load. Our loader awaits DB I/O,
 * which opens the window: an in-flight reader (`firm.account` accessed but
 * never awaited) can still be pending when the caller sets a new target, and
 * the stale queried row then wins the writeback.
 *
 * These are `skip`ped because the bug is still OPEN — the fix is not
 * implementable with the holder bookkeeping we have today, and the naive guard
 * is actively harmful. See the audit findings on PR #5009 and the follow-up
 * story `fix-has-one-mid-flight-reassignment-clobber`:
 *
 * - `loadBelongsTo`'s guard (#4919) keys on the *owner's* stale key (FK +
 *   `foreign_type`), which is independent of holder bookkeeping. has_one has
 *   no owner-side stale key — Rails' `stale_state` is non-nil only on
 *   `BelongsToAssociation` (`associations/belongs_to_association.rb:126`) —
 *   so that approach does not transfer.
 * - Keying on a false→true flip in holder loaded-ness looks equivalent but is
 *   not: the association machinery marks holders loaded mid-await on its own
 *   (observed on plain `Member#currentMembership` during a `:through` hop), so
 *   the guard fires on ordinary loads and returns a stale target over a
 *   correct result. That reproduces on PostgreSQL/MariaDB and stays invisible
 *   on SQLite, where the timing keeps it from firing at all.
 * - `_explicitTarget` is not the signal either: the has_one writer never sets
 *   it, so it misses the real reassignment path entirely.
 *
 * A sound fix needs the holder to distinguish "our own load's writeback" from
 * "someone else's set" — a load-generation token, not an inferred signal.
 */
import { describe, expect, test } from "vitest";

import { fixtures } from "../test-helpers/fixtures.js";
import { Account } from "../test-helpers/models/account.js";
import { Firm } from "../test-helpers/models/company.js";

describe("has_one mid-flight reassignment", () => {
  fixtures(["companies", "accounts"]);

  test.skip("an in-flight reader does not clobber a concurrently assigned target", async () => {
    const firm = (await Firm.first()) as Firm;
    const other = await Account.create({ credit_limit: 42 });

    const inFlight = firm.loadHasOne("account");
    firm.association("account").setTarget(other);

    await inFlight;

    expect(firm.association("account").target).toBe(other);
  });

  test.skip("the in-flight reader resolves to the assigned target, not the persisted row", async () => {
    const firm = (await Firm.first()) as Firm;
    const other = await Account.create({ credit_limit: 42 });

    const inFlight = firm.loadHasOne("account");
    firm.association("account").setTarget(other);

    expect(await inFlight).toBe(other);
  });

  test.skip("an assignment to null is not resurrected by the in-flight reader", async () => {
    const firm = (await Firm.first()) as Firm;

    const inFlight = firm.loadHasOne("account");
    firm.association("account").setTarget(null);

    expect(await inFlight).toBeNull();
    expect(firm.association("account").target).toBeNull();
  });
});
