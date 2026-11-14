import * as fs from "fs/promises";
import * as path from "path";
import { describe, expect, it } from "vitest";
import type { BodyHashRecord, BodyPin } from "./body-pins.js";
import {
  type LedgerRow,
  addedRows,
  checkRows,
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
