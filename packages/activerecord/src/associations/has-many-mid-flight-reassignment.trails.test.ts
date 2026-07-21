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
import { loadHasMany } from "../associations.js";
import type { Base } from "../base.js";
import { Firm, Client } from "../test-helpers/models/company.js";
import { Author } from "../test-helpers/models/author.js";
import { Comment } from "../test-helpers/models/comment.js";

describe("has_many mid-flight reassignment", () => {
  fixtures(["companies", "authors", "posts", "comments"]);

  it("a target assigned while the load is in flight is not clobbered by the load", async () => {
    const firm = (await Firm.first()) as Firm;
    const other = (await Client.first()) as Client;

    const inFlight = firm.association("clients").loadTarget();
    firm.association("clients").setTarget([other]);
    await inFlight;

    expect(firm.association("clients").target).toEqual([other]);
    // The guard path falls through to loadedBang() rather than returning
    // early, so the holder is loaded on exactly one exit path.
    expect(firm.association("clients").isLoaded()).toBe(true);
  });

  it("a sibling load landing mid-await does not discard the loaded rows", async () => {
    // `_loaderWritebackSuppressed` is scoped to this holder for the whole
    // window, so a sibling loader's `syncToAssociationInstance` writeback is
    // swallowed rather than counted as a wholesale replacement — the guard
    // must not mistake it for a user reassignment and drop the DB rows.
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

  it("a target assigned mid-load survives on a has_many :through", async () => {
    // HasManyThroughAssociation inherits doAsyncFindTarget from
    // HasManyAssociation, so it must inherit the guard with it.
    const author = (await Author.first()) as Author;
    const other = (await Comment.first()) as Comment;

    const inFlight = author.association("comments").loadTarget();
    author.association("comments").setTarget([other]);
    await inFlight;

    expect(author.association("comments").target).toEqual([other]);
  });
});
