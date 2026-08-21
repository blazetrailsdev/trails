import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import type { CallArgExcludeEntry } from "./call-args-baseline.js";
import { loadBaseline, renderKey, renderStaleTags } from "./lint-call-args.js";
import { writeSplitBaseline } from "./lint-call-mismatches.js";
import { rowsOfKind } from "./call-mismatch-baseline.js";

function entry(over: Partial<CallArgExcludeEntry> = {}): CallArgExcludeEntry {
  return {
    package: "arel",
    tsFile: "visitors/to-sql.ts",
    rubyName: "inject_join",
    call: "visit",
    rubyArgs: ["ref:o", "ref:collector"],
    reason: "reviewed",
    ...over,
    kind: "args",
  };
}

describe("the split call-argument baseline", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "call-args-baseline-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("shards entries per source file, mirroring the source tree", async () => {
    const other = entry({ package: "activerecord", tsFile: "relation.ts" });
    await writeSplitBaseline([entry(), other], dir);
    expect(await fs.readdir(path.join(dir, "arel", "visitors"))).toEqual(["to-sql.json"]);
    expect(await fs.readdir(path.join(dir, "activerecord"))).toEqual(["relation.json"]);
  });

  it("round-trips through the loader", async () => {
    await writeSplitBaseline([entry()], dir);
    expect(await loadBaseline(dir)).toEqual([entry()]);
  });

  it("deletes a file whose rows all converged rather than leaving `[]`", async () => {
    await writeSplitBaseline([entry()], dir);
    await writeSplitBaseline([], dir);
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("shares a shard with the call-set rows, and each gate reads only its kind", async () => {
    const callsRow = {
      package: "arel",
      tsFile: "visitors/to-sql.ts",
      rubyName: "inject_join",
      call: "quote",
      reason: "reviewed",
    };
    await writeSplitBaseline([entry(), callsRow], dir);
    const shard = JSON.parse(
      await fs.readFile(path.join(dir, "arel", "visitors", "to-sql.json"), "utf-8"),
    );
    expect(shard).toHaveLength(2);
    expect(await loadBaseline(dir)).toEqual([entry()]);
    expect(rowsOfKind(shard, "calls")).toEqual([callsRow]);
  });

  it("keeps a row with no kind readable as a call-set row, so old shards need no migration", async () => {
    await writeSplitBaseline(
      [
        {
          package: "arel",
          tsFile: "visitors/to-sql.ts",
          rubyName: "visit",
          call: "quote",
          reason: "r",
        },
      ],
      dir,
    );
    expect(await loadBaseline(dir)).toEqual([]);
  });
});

it("prints the argument list that makes a row its own key", () => {
  expect(renderKey(entry())).toContain("visit(ref:o, ref:collector)");
});

describe("renderStaleTags", () => {
  it("names each tag whose call site no longer flags", () => {
    const out = renderStaleTags([
      {
        package: "activerecord",
        tsFile: "connection-adapters/abstract/connection-pool.ts",
        tsName: "buildAsyncExecutor",
        call: "new",
      },
    ]);
    expect(out).toContain("1 STALE @missingRailsArgs tag(s)");
    expect(out).toContain("connection-adapters/abstract/connection-pool.ts");
    expect(out).toContain("buildAsyncExecutor");
  });
});
