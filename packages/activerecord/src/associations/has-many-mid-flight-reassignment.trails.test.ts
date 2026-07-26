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
import { readdir, readFile } from "node:fs/promises";
import { fixtures } from "../test-helpers/fixtures.js";
import { findTarget } from "./has-many-association.js";
import { Preloader } from "./preloader.js";
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
    await findTarget(firm, "clients", {});
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

  it("the writer path raises too, not just the raw setTarget", async () => {
    // `firm.clients = [...]` goes through CollectionAssociation#replace, which
    // mutates target directly rather than calling setTarget — so the guard has
    // to be applied there as well or the ordinary user-facing assignment stays
    // silently clobberable.
    const firm = (await Firm.first()) as Firm;
    const other = (await Client.first()) as Client;

    const inFlight = firm.association("clients").loadTarget();
    const holder = firm.association("clients") as unknown as { replace(r: Base[]): void };
    expect(() => holder.replace([other])).toThrow(AssociationTargetReplacedDuringLoad);
    await inFlight;
  });

  it("a preload landing mid-load neither raises nor aborts the batch", async () => {
    // The Preloader is a loader, not a caller replacing the target:
    // loader-vs-loader is not the race we refuse, and raising would abort the
    // whole batch because ONE owner happened to have a lazy load in flight.
    //
    // The in-flight window is held open directly rather than by racing a real
    // `loadTarget()`: driving it through the public API is timing-dependent
    // (the load's query resolves before the preloader reaches its associate
    // step, so the window has already closed and the test passes vacuously —
    // confirmed by reverting the fix). Setting the flag pins the invariant
    // deterministically instead of hoping for an interleaving.
    const firm = (await Firm.first()) as Firm;
    const other = (await Firm.where({ id: firm.id }))[0];
    const holder = firm.association("clients") as unknown as {
      _loaderWritebackSuppressed: number;
    };

    holder._loaderWritebackSuppressed++;
    try {
      await expect(
        new Preloader({ records: [firm, other], associations: "clients" }).call(),
      ).resolves.not.toThrow();
    } finally {
      holder._loaderWritebackSuppressed--;
    }

    // The non-racing owner in the same batch still got its target.
    expect(other.association("clients").isLoaded()).toBe(true);
  });

  it("no internal caller reaches setTarget — every loader writeback is exempt", async () => {
    // Three review rounds found the same defect in different files: an
    // internal loader calling `setTarget`, which now raises and aborts its
    // batch. Enumerating by hand kept missing sites, so pin the invariant
    // instead — `setTarget` is the caller-facing API (guarded), and every
    // internal writeback goes through `_setTargetFromLoader`.
    const root = new URL("../", import.meta.url);
    const offenders: string[] = [];

    const walk = async (dir: URL): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules") await walk(child);
          continue;
        }
        if (!entry.name.endsWith(".ts") || entry.name.includes(".test.")) continue;
        const source = await readFile(child, "utf8");
        source.split("\n").forEach((line, i) => {
          if (!line.includes(".setTarget(")) return;
          if (line.trimStart().startsWith("*") || line.trimStart().startsWith("//")) return;
          offenders.push(`${entry.name}:${i + 1}`);
        });
      }
    };
    await walk(root);

    expect(offenders).toEqual([]);
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
