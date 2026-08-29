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

    expect((a as Account)?.id).toBe((b as Account)?.id);
  });

  it("replacing a has_one :through target mid-load raises", async () => {
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

describe("belongs_to mid-flight foreign-key change", () => {
  fixtures(["companies"]);

  it("a row fetched under a foreign key that moved mid-load is not stored", async () => {
    const firms = await Firm.order("id");
    const [first, second, third] = firms;
    const client = (await Client.first()) as Client;

    client.client_of = first.id as bigint;
    const assoc = client.association("firm") as unknown as {
      loadTarget(): Promise<unknown>;
      findTarget(): Promise<Firm | null>;
      target: Firm | null;
    };
    await assoc.loadTarget();
    expect(assoc.target?.id).toBe(first.id);

    client.client_of = second.id as bigint;

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const realFindTarget = assoc.findTarget.bind(assoc);
    assoc.findTarget = async () => {
      const row = await realFindTarget();
      await gate;
      return row;
    };

    const inFlight = assoc.loadTarget();
    client.client_of = third.id as bigint;
    release();
    await inFlight;

    expect(assoc.target?.id).toBe(first.id);
  });
});

describe("polymorphic belongs_to mid-flight reassignment", () => {
  fixtures(["taggings", "posts"]);

  it("replacing a polymorphic target mid-load raises", async () => {
    const tagging = (await Tagging.first()) as Tagging;
    const other = (await Post.first()) as Post;

    const inFlight = tagging.association("taggable").loadTarget();
    expect(() => tagging.association("taggable").setTarget(other)).toThrow(
      AssociationTargetReplacedDuringLoad,
    );
    await inFlight;
  });
});
