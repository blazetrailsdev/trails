import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { fixtures } from "../test-fixtures.js";
import { findCollectionTarget as findTarget } from "../test-helpers/find-collection-target.js";
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
    const firm = (await Firm.first()) as Firm;
    const persisted = await Client.where({ firm_id: firm.id });
    expect(persisted.length).toBeGreaterThan(0);

    const inFlight = firm.association("clients").loadTarget();
    await findTarget(firm, "clients");
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
    const firm = (await Firm.first()) as Firm;
    const other = (await Client.first()) as Client;

    const inFlight = firm.association("clients").loadTarget();
    const holder = firm.association("clients") as unknown as { replace(r: Base[]): void };
    expect(() => holder.replace([other])).toThrow(AssociationTargetReplacedDuringLoad);
    await inFlight;
  });

  it("a preload landing mid-load neither raises nor aborts the batch", async () => {
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

    expect(other.association("clients").isLoaded()).toBe(true);
  });

  it("no internal caller reaches setTarget — every loader writeback is exempt", async () => {
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
    const author = (await Author.first()) as Author;
    const other = (await Comment.first()) as Comment;

    const inFlight = author.association("comments").loadTarget();
    expect(() => author.association("comments").setTarget([other])).toThrow(
      AssociationTargetReplacedDuringLoad,
    );
    await inFlight;
  });
});
