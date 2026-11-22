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
  ledgerScope,
  skipLedgered,
  summaryLine,
  seedDiff,
  staleConstantRows,
  staleSignatureRows,
  withoutRemoved,
  testLedgerKey,
  testLedgerProblems,
  testRowKey,
  type TestLedgerRow,
} from "./bump-ledger.js";
import { exceedances, ledgeredMeasure, staleMarks, tightened } from "./param-name-mark.js";

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

describe("ledgerScope", () => {
  const rows: LedgerRow[] = [
    {
      package: "activerecord",
      rubyFile: "core.rb",
      rubyName: "inspect",
      kind: "drift",
      from: "v8.0.2",
      to: "v8.0.5.2",
    },
    {
      package: "activerecord",
      rubyFile: "gone.rb",
      rubyName: "gone",
      kind: "removed",
      from: "v8.0.2",
      to: "v8.0.5.2",
    },
  ];
  const hashes: BodyHashRecord[] = [
    {
      package: "activerecord",
      rubyFile: "core.rb",
      rubyName: "inspect",
      tsFile: "core.ts",
      tsName: "inspect",
      digest: "b",
    },
    {
      package: "activerecord",
      rubyFile: "core.rb",
      rubyName: "hash",
      tsFile: "core.ts",
      tsName: "hash",
      digest: "c",
    },
  ];
  const scope = ledgerScope(rows, hashes);

  it("lint-call-mismatches: skips a call row on a drifted pair, counts its neighbour", () => {
    const calls = [
      {
        package: "activerecord",
        tsFile: "core.ts",
        rubyName: "inspect",
        call: "inspection_filter",
      },
      { package: "activerecord", tsFile: "core.ts", rubyName: "hash", call: "id" },
    ];
    const { counted, skipped } = skipLedgered(calls, scope.ts);
    expect(skipped.map((r) => r.rubyName)).toEqual(["inspect"]);
    expect(counted.map((r) => r.rubyName)).toEqual(["hash"]);
  });

  it("lint-call-mismatches: skips a stale baseline row on a removed pair", () => {
    const stale = { package: "activerecord", tsFile: "gone.ts", rubyName: "gone", call: "x" };
    expect(scope.ts(stale)).toBe(true);
    expect(scope.ts({ ...stale, rubyName: "kept" })).toBe(false);
    expect(scope.ts({ ...stale, tsFile: "other.ts" })).toBe(false);
  });

  it("lint-call-args: reads a mismatch by its Ruby file", () => {
    const shape = { package: "activerecord", rubyFile: "core.rb", rubyName: "inspect" };
    expect(scope.pair(shape)).toBe(true);
    expect(scope.pair({ ...shape, rubyName: "hash" })).toBe(false);
  });

  it("lint-ruby-compat-calls: skips a rubyCompat row on a drifted pair only", () => {
    const rows = [
      {
        package: "activerecord",
        tsFile: "core.ts",
        rubyName: "inspect",
        call: "dup",
        kind: "rubyCompat",
      },
      {
        package: "activerecord",
        tsFile: "core.ts",
        rubyName: "hash",
        call: "dup",
        kind: "rubyCompat",
      },
    ];
    expect(skipLedgered(rows, scope.ts).counted).toHaveLength(1);
  });

  it("receipt-audit: skips a tag on a drifted pair by its TS name", () => {
    const tags = [
      { package: "activerecord", tsFile: "core.ts", tsName: "inspect", call: "x" },
      { package: "activerecord", tsFile: "core.ts", tsName: "hash", call: "x" },
    ];
    const { counted, skipped } = skipLedgered(tags, scope.tsName);
    expect([counted.length, skipped.length]).toEqual([1, 1]);
  });

  it("receipt-audit: skips an uncompared tag on a removed pair", () => {
    const tag = { package: "activerecord", tsFile: "gone.ts", tsName: "gone", call: "x" };
    expect(scope.tsName(tag)).toBe(true);
    expect(scope.tsName({ ...tag, tsName: "kept" })).toBe(false);
    expect(scope.tsName({ ...tag, tsFile: "other.ts" })).toBe(false);
  });

  it("an empty ledger skips nothing", () => {
    expect(
      ledgerScope([], hashes).ts({
        package: "activerecord",
        tsFile: "core.ts",
        rubyName: "inspect",
      }),
    ).toBe(false);
  });

  it("lint-param-names: skips a param row on a drifted pair, counts its neighbour", () => {
    const params = [
      { package: "activerecord", rubyFile: "core.rb", rubyName: "inspect", position: 0 },
      { package: "activerecord", rubyFile: "core.rb", rubyName: "hash", position: 0 },
    ];
    const { counted, skipped } = skipLedgered(params, scope.pair);
    expect(skipped.map((r) => r.rubyName)).toEqual(["inspect"]);
    expect(counted.map((r) => r.rubyName)).toEqual(["hash"]);
  });

  it("lint-block-params: skips a block row on a removed pair, counts another file's", () => {
    const blocks = [
      { package: "activerecord", rubyFile: "gone.rb", rubyName: "gone", tsName: "gone" },
      { package: "activerecord", rubyFile: "other.rb", rubyName: "gone", tsName: "gone" },
    ];
    const { counted, skipped } = skipLedgered(blocks, scope.pair);
    expect(skipped.map((r) => r.rubyFile)).toEqual(["gone.rb"]);
    expect(counted.map((r) => r.rubyFile)).toEqual(["other.rb"]);
  });

  it("lint-arm-throws: skips a missing-throw arm on a drifted pair only", () => {
    const arms = [
      { package: "activerecord", rubyFile: "core.rb", rubyName: "inspect", missing: ["throw"] },
      { package: "activerecord", rubyFile: "core.rb", rubyName: "hash", missing: ["throw"] },
    ];
    const { counted, skipped } = skipLedgered(arms, scope.pair);
    expect([skipped.length, counted[0].rubyName]).toEqual([1, "hash"]);
  });

  it("lint-extra-surface-ratchet: subtracts only a member on a removed pair", () => {
    const pkg = {
      package: "activerecord",
      totalExtras: 3,
      totalNovel: 2,
      noCounterpartFiles: 0,
      extraFiles: [
        {
          tsFile: "gone.ts",
          rubyFile: "gone.rb",
          extras: [
            { name: "gone", kind: "novel" },
            { name: "invented", kind: "novel" },
          ],
        },
        { tsFile: "core.ts", rubyFile: "core.rb", extras: [{ name: "inspect", kind: "moved" }] },
      ],
    };
    const { packages, skipped } = withoutRemoved([pkg], scope.removedTsName);
    expect(skipped).toBe(1);
    expect([packages[0].totalExtras, packages[0].totalNovel]).toEqual([2, 1]);
  });

  it("lint-extra-surface-ratchet: subtracts an @internal name on a removed pair", () => {
    const pkg = {
      package: "activerecord",
      totalExtras: 0,
      totalNovel: 0,
      noCounterpartFiles: 0,
      totalInternal: 2,
      internalFiles: [{ tsFile: "gone.ts", names: ["gone", "kept"] }],
      extraFiles: [],
    };
    const { packages, skipped } = withoutRemoved([pkg], scope.removedTsName);
    expect([skipped, packages[0].totalInternal]).toEqual([1, 1]);
  });
});

describe("signature rows", () => {
  const sig: LedgerRow = { ...key, kind: "signature", from: "v8.0.2", to: "v8.0.5.2" };
  it("checkRows passes a signature row on an unchanged pin and reds one on a removed pair", () => {
    expect(checkRows([sig], [pin("a")], [record("a")])).toEqual([]);
    expect(checkRows([sig], [pin("a")], []).map((p) => p.problem)).toEqual(["kind"]);
  });
  it("staleSignatureRows reds a row no param or block row still names", () => {
    expect(staleSignatureRows([sig], [key])).toEqual([]);
    expect(staleSignatureRows([sig], [])).toEqual([sig]);
  });
});

describe("signature rows reach the signature gates only", () => {
  const sigRow: LedgerRow = { ...key, kind: "signature", from: "v8.0.2", to: "v8.0.5.2" };
  const hashes: BodyHashRecord[] = [record("a")];
  const scope = ledgerScope([sigRow], hashes);

  it("a call row on a signature pair is still counted by the call ratchets", () => {
    expect(scope.pair(key)).toBe(false);
    expect(scope.ts({ package: key.package, tsFile: "persistence.ts", rubyName: "save" })).toBe(
      false,
    );
    expect(scope.signaturePair(key)).toBe(true);
  });

  it("lint-block-params: a ledgered row neither grows the mark nor lets --tighten write it down", () => {
    const gated = ["activerecord"];
    const marks = { activerecord: { total: 1, byFile: { "persistence.rb": 1 } } };
    const rows = [
      { ...key, tsName: "save" },
      { ...key, tsName: "save" },
    ];
    const { current, measured, skipped } = ledgeredMeasure(rows, scope.signaturePair, gated);
    expect(skipped).toBe(2);
    expect(exceedances(marks, current, gated)).toEqual([]);
    expect(staleMarks(marks, measured, gated)).toEqual([]);
    expect(tightened(marks, measured, gated)).toEqual(marks);
  });

  it("lint-param-names: an unledgered row on another pair still grows the mark", () => {
    const gated = ["activerecord"];
    const marks = { activerecord: { total: 0, byFile: {} } };
    const rows = [{ package: "activerecord", rubyFile: "core.rb", rubyName: "inspect" }];
    const { current } = ledgeredMeasure(rows, scope.signaturePair, gated);
    expect(exceedances(marks, current, gated).map((v) => v.dimension)).toEqual([
      "total",
      "core.rb",
    ]);
  });
});

describe("constant rows", () => {
  const constRow: LedgerRow = {
    package: "actioncable",
    rubyFile: "subscription_adapter/redis.rb",
    rubyName: "ConnectionError",
    kind: "constant",
    from: "v8.0.2",
    to: "v8.0.5.2",
  };
  const pkg = (names: string[]) => ({
    package: "actioncable",
    totalExtras: names.length,
    totalNovel: 0,
    noCounterpartFiles: 0,
    extraFiles: [
      {
        tsFile: "subscription-adapter/redis.ts",
        rubyFile: "subscription_adapter/redis.rb",
        extras: names.map((name) => ({ name, kind: "moved" })),
      },
    ],
  });

  it("lint-extra-surface-ratchet: subtracts the removed constant, counts another name", () => {
    const scope = ledgerScope([constRow], []);
    const { packages, skipped } = withoutRemoved(
      [pkg(["ConnectionError", "Invented"])],
      scope.removedTsName,
    );
    expect([skipped, packages[0].totalExtras]).toEqual([1, 1]);
    expect(scope.pair(constRow)).toBe(false);
  });

  it("checkRows leaves a constant row to the extra-surface gate", () => {
    expect(checkRows([constRow], [], [])).toEqual([]);
  });

  it("staleConstantRows reds a row once the TS name is no longer extra", () => {
    expect(staleConstantRows([constRow], [pkg(["ConnectionError"])])).toEqual([]);
    expect(staleConstantRows([constRow], [pkg([])])).toEqual([constRow]);
  });
});

describe("testLedgerProblems", () => {
  const testRow = (p: string, kind: TestLedgerRow["kind"] = "changed"): TestLedgerRow => ({
    package: "activerecord",
    rubyFile: "cases/base_test.rb",
    path: p,
    kind,
    from: "v8.0.2",
    to: "v8.0.5.2",
  });

  it("keys a moved row by its new path", () => {
    const moved = { ...testRow("A > old"), kind: "moved" as const, toPath: "B > old" };
    expect(testRowKey(moved)).toBe(testLedgerKey("activerecord", "cases/base_test.rb", "B > old"));
  });

  it("reds a row whose TS test now agrees, and one that matches nothing", () => {
    const rows = [testRow("T > held"), testRow("T > agrees"), testRow("T > gone")];
    const k = (p: string) => testLedgerKey("activerecord", "cases/base_test.rb", p);
    const problems = testLedgerProblems(
      rows,
      new Set(["activerecord"]),
      new Set([k("T > held"), k("T > agrees")]),
      new Set([k("T > held")]),
    );
    expect(problems.map((p) => [p.row.path, p.problem])).toEqual([
      ["T > agrees", "stale"],
      ["T > gone", "unmatched"],
    ]);
  });

  it("judges no row of a package the run did not compare", () => {
    expect(testLedgerProblems([testRow("T > x")], new Set(), new Set(), new Set())).toEqual([]);
  });
});

describe("summaryLine", () => {
  it("tallies rows by package and kind, or says none", () => {
    expect(summaryLine("rack", [])).toBe("bump-ledger rows: rack none");
    const row: LedgerRow = {
      package: "arel",
      rubyFile: "a.rb",
      rubyName: "x",
      kind: "drift",
      from: "a",
      to: "b",
    };
    expect(summaryLine("rails", [row, { ...row, rubyName: "y" }])).toBe(
      "bump-ledger rows: rails arel:drift=2",
    );
  });
});
