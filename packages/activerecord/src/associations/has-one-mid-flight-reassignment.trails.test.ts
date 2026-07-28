/**
 * Trails-only surface: replacing a has_one / belongs_to target while a load for
 * it is still in flight raises `AssociationTargetReplacedDuringLoad`.
 *
 * This is the singular-holder counterpart to the has_many guard (#5038). The
 * mechanism is shared and holder-agnostic: `setTarget` refuses the race, and a
 * loader's own writeback is exempt because it runs while
 * `Association#_loaderWritebackSuppressed` is set (armed in each singular
 * association's `doAsyncFindTarget`, mirroring `CollectionAssociation`).
 *
 * Rails has no analogue because `Association#find_target`
 * (activerecord/lib/active_record/associations/association.rb:248) is
 * synchronous — nothing can touch the holder between issuing the query and
 * assigning its result. trails awaits, which opens the window. There is no
 * correct silent winner, so trails refuses the race rather than resolving it;
 * the repo owner rejected picking a winner during #5038's review.
 */
import { describe, it, expect } from "vitest";

import { fixtures } from "../test-fixtures.js";
import { AssociationTargetReplacedDuringLoad } from "../errors.js";
import { Account } from "../test-helpers/models/account.js";
import { Client, Firm } from "../test-helpers/models/company.js";
import { Member } from "../test-helpers/models/member.js";
import { Club } from "../test-helpers/models/club.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Post } from "../test-helpers/models/post.js";

describe("has_one mid-flight reassignment", () => {
  fixtures(["companies", "accounts", "members", "memberships", "clubs"]);

  it("replacing the target while a load is in flight raises", async () => {
    const firm = (await Firm.first()) as Firm;
    const other = await Account.create({ credit_limit: 42 });

    const inFlight = firm.association("account").loadTarget();
    expect(() => firm.association("account").setTarget(other)).toThrow(
      AssociationTargetReplacedDuringLoad,
    );
    await inFlight;
  });

  it("the raise names the association and survives the load completing", async () => {
    const firm = (await Firm.first()) as Firm;
    const other = await Account.create({ credit_limit: 42 });

    const inFlight = firm.association("account").loadTarget();
    expect(() => firm.association("account").setTarget(other)).toThrow(/account/);
    await inFlight;

    // The refused assignment leaves the load intact — no partial state.
    expect(firm.association("account").isLoaded()).toBe(true);
  });

  it("assigning after the load has settled is allowed", async () => {
    const firm = (await Firm.first()) as Firm;
    const other = await Account.create({ credit_limit: 42 });

    await firm.association("account").loadTarget();
    firm.association("account").setTarget(other);

    expect(firm.association("account").target).toBe(other);
  });

  it("concurrent loads on the same holder do not error", async () => {
    const firm = (await Firm.first()) as Firm;

    const [a, b] = await Promise.all([
      firm.association("account").loadTarget(),
      firm.association("account").loadTarget(),
    ]);

    // Loader-vs-loader is not the race we refuse — both are reads of the same
    // association, so neither raises.
    expect((a as Account)?.id).toBe((b as Account)?.id);
  });

  it("replacing a has_one :through target mid-load raises", async () => {
    // HasOneThroughAssociation inherits doAsyncFindTarget from
    // HasOneAssociation, so it must inherit the guard with it.
    const member = (await Member.first()) as Member;
    const other = (await Club.first()) as Club;

    const inFlight = member.association("club").loadTarget();
    expect(() => member.association("club").setTarget(other)).toThrow(
      AssociationTargetReplacedDuringLoad,
    );
    await inFlight;
  });
});

describe("belongs_to mid-flight reassignment", () => {
  fixtures(["companies", "accounts"]);

  it("a same-FK replacement mid-load raises", async () => {
    // #4919 already guards a mid-load FK *change* here via the owner's stale
    // key. This covers the complementary case: a replacement that leaves the
    // FK put (`client.association("firm").setTarget(other)`), which the
    // stale-key check cannot see because nothing moved.
    const client = (await Client.first()) as Client;
    const other = (await Firm.first()) as Firm;

    const inFlight = client.association("firm").loadTarget();
    expect(() => client.association("firm").setTarget(other)).toThrow(
      AssociationTargetReplacedDuringLoad,
    );
    await inFlight;
  });

  it("assigning after the load has settled is allowed", async () => {
    const client = (await Client.first()) as Client;
    const other = (await Firm.first()) as Firm;

    await client.association("firm").loadTarget();
    client.association("firm").setTarget(other);

    expect(client.association("firm").target).toBe(other);
  });
});

describe("polymorphic belongs_to mid-flight reassignment", () => {
  fixtures(["taggings", "posts"]);

  it("replacing a polymorphic target mid-load raises", async () => {
    // `BelongsToPolymorphicAssociation` overrides `doAsyncFindTarget`, so it
    // must arm the same guard its parent does — otherwise the polymorphic
    // subclass stays silently clobberable while plain belongs_to raises.
    const tagging = (await Tagging.first()) as Tagging;
    const other = (await Post.first()) as Post;

    const inFlight = tagging.association("taggable").loadTarget();
    expect(() => tagging.association("taggable").setTarget(other)).toThrow(
      AssociationTargetReplacedDuringLoad,
    );
    await inFlight;
  });
});
