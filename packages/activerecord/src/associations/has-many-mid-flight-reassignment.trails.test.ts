import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import type { Base } from "../base.js";
import { Firm, Client } from "../test-helpers/models/company.js";
import { Author } from "../test-helpers/models/author.js";
import { Comment } from "../test-helpers/models/comment.js";

describe("has_many mid-flight reassignment", () => {
  fixtures(["companies", "authors", "posts", "comments"]);

  it("replacing the target while a load is in flight wins over the load", async () => {
    const firm = (await Firm.first()) as Firm;
    const other = (await Client.all()).find((c) => c.firm_id !== firm.id) as Client;

    const inFlight = firm.association("clients").loadTarget();
    firm.association("clients").setTarget([other]);
    const loaded = (await inFlight) as Base[];

    expect(loaded).toEqual([other]);
    expect(firm.association("clients").target).toEqual([other]);
    expect(firm.association("clients").isLoaded()).toBe(true);
  });

  it("replace racing an in-flight load diffs against the loaded rows and its records win", async () => {
    const firm = (await Firm.first()) as Firm;
    const persisted = await Client.where({ firm_id: firm.id });
    expect(persisted.length).toBeGreaterThan(0);
    const other = (await Client.all()).find((c) => c.firm_id !== firm.id) as Client;

    const inFlight = firm.association("clients").loadTarget();
    const holder = firm.association("clients") as unknown as {
      replace(r: Base[]): Promise<unknown>;
    };
    await holder.replace([other]);
    await inFlight;

    expect(firm.association("clients").target).toEqual([other]);
    expect((await Client.where({ firm_id: firm.id })).map((c) => c.id)).toEqual([other.id]);
  });

  it("assigning after the load has settled is allowed", async () => {
    const firm = (await Firm.first()) as Firm;
    const other = (await Client.first()) as Client;

    await firm.association("clients").loadTarget();
    firm.association("clients").setTarget([other]);

    expect(firm.association("clients").target).toEqual([other]);
  });

  it("a sibling load landing mid-await neither raises nor discards the loaded rows", async () => {
    const firm = (await Firm.first()) as Firm;
    const persisted = await Client.where({ firm_id: firm.id });
    expect(persisted.length).toBeGreaterThan(0);

    const inFlight = firm.association("clients").loadTarget();
    await firm.association("clients").loadTarget();
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

  it("a has_many :through assignment mid-load wins over the load", async () => {
    const author = (await Author.first()) as Author;
    const other = (await Comment.last()) as Comment;

    const inFlight = author.association("comments").loadTarget();
    author.association("comments").setTarget([other]);
    await inFlight;

    expect(author.association("comments").target).toEqual([other]);
  });
});
