import * as fs from "fs/promises";
import * as path from "path";
import { describe, expect, it } from "vitest";
import type { BodyHashRecord, BodyPin } from "./body-pins.js";
import {
  type LedgerRow,
  type Lock,
  addedRows,
  bumpOf,
  carrySeed,
  checkRows,
  clearedRows,
  forkedBeforeRef,
  movedSources,
  partitionLedgered,
  resolveRevisions,
  ledgerPath,
  liveRows,
  loadLedgered,
  saveLedgerFile,
  seedDiff,
} from "./bump-ledger.js";

const key = { package: "activerecord", rubyFile: "persistence.rb", rubyName: "save" };
const pin = (digest: string, rubyName = "save"): BodyPin => ({ ...key, rubyName, digest });
const record = (digest: string, rubyName = "save"): BodyHashRecord => ({
  ...key,
  rubyName,
  tsFile: "persistence.ts",
  tsName: rubyName,
  digest,
});
const row = (kind: LedgerRow["kind"], rubyName = "save"): LedgerRow => ({
  ...key,
  rubyName,
  kind,
  from: "v8.0.2",
  to: "v8.0.5.2",
});

describe("checkRows", () => {
  it("passes a drift row whose pin still differs and a removed row whose pair is gone", () => {
    expect(
      checkRows(
        [row("drift"), row("removed", "touch")],
        [pin("a"), pin("t", "touch")],
        [record("b")],
      ),
    ).toEqual([]);
  });

  it("reds a row whose pin matches the active digest as stale", () => {
    expect(checkRows([row("drift")], [pin("b")], [record("b")])).toEqual([
      { row: row("drift"), problem: "stale" },
    ]);
  });

  it("reds a row no pin names as unmatched", () => {
    expect(checkRows([row("drift")], [], [record("b")])).toEqual([
      { row: row("drift"), problem: "unmatched" },
    ]);
  });

  it("reds a row whose kind does not match its pair", () => {
    expect(checkRows([row("removed")], [pin("a")], [record("b")])).toEqual([
      { row: row("removed"), problem: "kind" },
    ]);
    expect(checkRows([row("drift")], [pin("a")], [])).toEqual([
      { row: row("drift"), problem: "kind" },
    ]);
  });
});

describe("addedRows", () => {
  it("finds rows the base ledger does not carry, which an unbumped PR may not add", () => {
    expect(addedRows([row("drift")], [row("drift"), row("drift", "touch")])).toEqual([
      row("drift", "touch"),
    ]);
  });
});

describe("liveRows and seedDiff", () => {
  it("drops the seed rows a PR re-pinned or pruned", () => {
    const current = new Map([[`${key.package} ${key.rubyFile} save`, "b"]]);
    const seed = [row("drift"), row("removed", "touch")];
    expect(liveRows(seed, [pin("b")], current)).toEqual([]);
    expect(liveRows(seed, [pin("a"), pin("t", "touch")], current)).toEqual(seed);
  });

  it("reds a ledger that differs from the recomputed seed", () => {
    expect(seedDiff([row("drift")], [row("drift")])).toEqual([]);
    expect(seedDiff([{ ...row("drift"), story: "s" }], [row("drift")])).toEqual([]);
    expect(seedDiff([], [row("drift")])).toEqual([{ row: row("drift"), problem: "seed" }]);
    expect(seedDiff([row("drift")], [])).toEqual([{ row: row("drift"), problem: "seed" }]);
    const moved = { ...row("drift"), to: "v8.1.4" };
    expect(seedDiff([moved], [row("drift")])).toEqual([{ row: moved, problem: "seed" }]);
  });
});

describe("loadLedgered", () => {
  it("reads every source's ledger, and an absent file ledgers nothing", async () => {
    await fs.mkdir(path.join(import.meta.dirname, "output"), { recursive: true });
    const dir = await fs.mkdtemp(path.join(import.meta.dirname, "output", "ledger-"));
    try {
      expect((await loadLedgered(dir))(key)).toBe(false);
      await saveLedgerFile(ledgerPath("rails", dir), [row("drift")]);
      const isLedgered = await loadLedgered(dir);
      expect(isLedgered(key)).toBe(true);
      expect(isLedgered({ ...key, rubyName: "touch" })).toBe(false);
      await saveLedgerFile(ledgerPath("rails", dir), []);
      expect((await loadLedgered(dir))(key)).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

const lock = (ref: string): Lock => ({ sources: { rails: { ref }, arel: { ref: "1" } } });

describe("movedSources and forkedBeforeRef", () => {
  it("names the source whose ref moved", () => {
    expect(movedSources(lock("v8.0.2"), lock("v8.0.5.2"))).toEqual(["rails"]);
    expect(movedSources(lock("v8.0.2"), lock("v8.0.2"))).toEqual([]);
  });

  it("reds a body-pins edit forked before a ref move, and only then", () => {
    expect(forkedBeforeRef(lock("v8.0.2"), lock("v8.0.5.2"), true)).toEqual(["rails"]);
    expect(forkedBeforeRef(lock("v8.0.2"), lock("v8.0.5.2"), false)).toEqual([]);
    expect(forkedBeforeRef(lock("v8.0.5.2"), lock("v8.0.5.2"), true)).toEqual([]);
  });
});

describe("resolveRevisions", () => {
  const fakeGit =
    (answers: Record<string, string | null>) =>
    async (args: string[]): Promise<string | null> =>
      answers[args.join(" ")] ?? null;

  it("diffs a merge checkout's parents", async () => {
    const git = fakeGit({ "rev-parse --verify -q HEAD^2": "x", "merge-base HEAD^1 HEAD^2": "f\n" });
    expect(await resolveRevisions(git, "origin/main")).toEqual({
      base: "HEAD^1",
      head: "HEAD^2",
      fork: "f",
    });
  });

  it("diffs a branch against its merge base with the base branch", async () => {
    const git = fakeGit({ "merge-base origin/main HEAD": "f\n" });
    expect(await resolveRevisions(git, "origin/main")).toEqual({
      base: "f",
      head: "HEAD",
      fork: "f",
    });
  });

  it("reds a merge base that will not resolve instead of skipping the history arms", async () => {
    const merge = fakeGit({ "rev-parse --verify -q HEAD^2": "x" });
    expect(await resolveRevisions(merge, "origin/main")).toHaveProperty("error");
    expect(await resolveRevisions(fakeGit({}), "origin/main")).toHaveProperty("error");
  });
});

describe("carrySeed", () => {
  it("keeps a row ledgered at an earlier bump at its original from and story", () => {
    const earlier = { ...row("drift"), story: "s" };
    const seed = [{ ...row("drift"), from: "v8.0.5.2", to: "v8.1.4" }, row("drift", "touch")];
    expect(carrySeed(seed, [earlier])).toEqual([
      { ...row("drift"), to: "v8.1.4", story: "s" },
      row("drift", "touch"),
    ]);
    expect(
      seedDiff([{ ...earlier, to: "v8.1.4" }], carrySeed(seed.slice(0, 1), [earlier])),
    ).toEqual([]);
  });
});

describe("clearedRows", () => {
  const current = new Map([[`${key.package} ${key.rubyFile} save`, "b"]]);

  it("clears a re-pinned row and a pruned row", () => {
    expect(clearedRows([row("drift")], [pin("a")], [pin("b")], current)).toEqual([row("drift")]);
    const removed = row("removed", "touch");
    expect(clearedRows([removed], [pin("t", "touch")], [], current)).toEqual([removed]);
  });

  it("leaves a row the run did not touch, and one that was already unmatched", () => {
    expect(clearedRows([row("drift")], [pin("a")], [pin("a")], current)).toEqual([]);
    expect(clearedRows([row("drift")], [], [pin("b")], current)).toEqual([]);
  });
});

describe("partitionLedgered", () => {
  it("passes a ledgered DRIFT or STALE pin and keeps an unledgered one red", () => {
    const isLedgered = (k: { rubyName: string }) => k.rubyName === "save";
    expect(partitionLedgered([pin("a"), pin("t", "touch")], isLedgered)).toEqual({
      ledgered: [pin("a")],
      red: [pin("t", "touch")],
    });
  });
});

describe("bumpOf", () => {
  it("does not read a ref main moved after the fork as this PR's bump", () => {
    expect(bumpOf("rails", lock("v8.0.2"), lock("v8.0.5.2"), lock("v8.0.2"))).toEqual({
      kind: "none",
    });
  });

  it("takes a PR's own move from the base ref to the head ref", () => {
    expect(bumpOf("rails", lock("v8.0.2"), lock("v8.0.2"), lock("v8.0.5.2"))).toEqual({
      kind: "bump",
      from: "v8.0.2",
      to: "v8.0.5.2",
    });
  });

  it("asks a PR that moves a ref main also moved to rebase", () => {
    expect(bumpOf("rails", lock("v8.0.2"), lock("v8.0.5.2"), lock("v8.1.4"))).toEqual({
      kind: "rebase",
    });
  });
});
