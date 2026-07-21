/**
 * Trails-only surface: replacing a has_many target while a load for it is
 * still in flight raises `AssociationTargetReplacedDuringLoad`.
 *
 * Rails has no analogue because `Association#find_target`
 * (activerecord/lib/active_record/associations/association.rb:248) is
 * synchronous — nothing can touch the holder between issuing the query and
 * assigning its result, so the race cannot arise. trails awaits, which opens
 * a window in which an assignment and a load both claim the target. There is
 * no correct silent winner, so trails refuses the race rather than resolving
 * it: previously the load clobbered the assignment with no diagnostic.
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "../test-helpers/fixtures.js";
import { loadHasMany } from "../associations.js";
import { AssociationTargetReplacedDuringLoad } from "../errors.js";
import type { Base } from "../base.js";
import { Firm, Client } from "../test-helpers/models/company.js";
import { Author } from "../test-helpers/models/author.js";
import { Comment } from "../test-helpers/models/comment.js";

describe("has_many mid-flight reassignment", () => {
  fixtures(["companies", "authors", "posts", "comments"]);

  it("replacing the target while a load is in flight raises", async () => {
    const firm = (await Firm.first()) as Firm;
    const other = (await Client.first()) as Client;

    const inFlight = firm.association("clients").loadTarget();
    expect(() => firm.association("clients").setTarget([other])).toThrow(
      AssociationTargetReplacedDuringLoad,
    );
    await inFlight;
  });

  it("the raise names the association and survives the load completing", async () => {
    const firm = (await Firm.first()) as Firm;
    const other = (await Client.first()) as Client;
    const persisted = await Client.where({ firm_id: firm.id });

    const inFlight = firm.association("clients").loadTarget();
    expect(() => firm.association("clients").setTarget([other])).toThrow(/clients/);
    const loaded = (await inFlight) as Base[];

    // The refused assignment leaves the load intact — no partial state.
    expect(loaded.length).toBe(persisted.length);
    expect(firm.association("clients").isLoaded()).toBe(true);
  });

  it("assigning after the load has settled is allowed", async () => {
    const firm = (await Firm.first()) as Firm;
    const other = (await Client.first()) as Client;

    await firm.association("clients").loadTarget();
    firm.association("clients").setTarget([other]);

    expect(firm.association("clients").target).toEqual([other]);
  });

  it("a sibling load landing mid-await neither raises nor discards the loaded rows", async () => {
    // `_loaderWritebackSuppressed` is what makes the raise safe: a loader's own
    // `syncToAssociationInstance` writeback bails before reaching `setTarget`,
    // so only a genuine external replacement trips the guard.
    const firm = (await Firm.first()) as Firm;
    const persisted = await Client.where({ firm_id: firm.id });
    expect(persisted.length).toBeGreaterThan(0);

    const inFlight = firm.association("clients").loadTarget();
    await loadHasMany(firm, "clients", {});
    const loaded = (await inFlight) as Base[];

    expect(loaded.length).toBe(persisted.length);
  });

  it("concurrent loads on the same holder do not drop rows", async () => {
    const firm = (await Firm.first()) as Firm;
    const persisted = await Client.where({ firm_id: firm.id });

    const [a, b] = (await Promise.all([
      firm.association("clients").loadTarget(),
      firm.association("clients").loadTarget(),
    ])) as [Base[], Base[]];

    expect(a.length).toBe(persisted.length);
    expect(b.length).toBe(persisted.length);
  });

  it("replacing a has_many :through target mid-load raises", async () => {
    // HasManyThroughAssociation inherits doAsyncFindTarget from
    // HasManyAssociation, so it must inherit the guard with it.
    const author = (await Author.first()) as Author;
    const other = (await Comment.first()) as Comment;

    const inFlight = author.association("comments").loadTarget();
    expect(() => author.association("comments").setTarget([other])).toThrow(
      AssociationTargetReplacedDuringLoad,
    );
    await inFlight;
  });
});
