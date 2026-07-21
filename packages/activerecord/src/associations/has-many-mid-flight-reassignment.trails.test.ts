/**
 * Trails-only surface: a has_many target reassigned while its load is still
 * in flight must survive the load.
 *
 * Rails has no analogue because `Association#find_target`
 * (activerecord/lib/active_record/associations/association.rb:248) is
 * synchronous — nothing can touch the holder between issuing the query and
 * assigning its result. trails awaits, so an assignment landing inside that
 * window used to be silently clobbered by `loadHasMany`'s tail writeback into
 * the holder that was already driving the load. See
 * `Association#_loaderWritebackSuppressed`.
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "../test-helpers/fixtures.js";
import { Firm, Client } from "../test-helpers/models/company.js";

describe("has_many mid-flight reassignment", () => {
  fixtures(["companies"]);

  it("a target assigned while the load is in flight is not clobbered by the load", async () => {
    const firm = (await Firm.first()) as Firm;
    const other = (await Client.first()) as Client;

    const inFlight = firm.association("clients").loadTarget();
    firm.association("clients").setTarget([other]);
    await inFlight;

    expect(firm.association("clients").target).toEqual([other]);
  });
});
