import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import type { CallArgExcludeEntry } from "./call-args-baseline.js";
import {
  baselineSeeded,
  loadBaseline,
  renderKey,
  renderUnseeded,
  writeSplitBaseline,
} from "./lint-call-args.js";

function entry(over: Partial<CallArgExcludeEntry> = {}): CallArgExcludeEntry {
  return {
    package: "arel",
    tsFile: "visitors/to-sql.ts",
    rubyName: "inject_join",
    call: "visit",
    rubyArgs: ["ref:o", "ref:collector"],
    reason: "reviewed",
    ...over,
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
    await writeSplitBaseline(
      [entry(), entry({ package: "activerecord", tsFile: "relation.ts" })],
      dir,
    );
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

  it("counts only an ABSENT tree as unseeded — an empty one is a converged dimension", async () => {
    expect(await baselineSeeded(path.join(dir, "nope"))).toBe(false);
    expect(await baselineSeeded(dir)).toBe(true);
    expect(await loadBaseline(dir)).toEqual([]);
  });
});

it("prints the argument list that makes a row its own key", () => {
  expect(renderKey(entry())).toContain("visit(ref:o, ref:collector)");
});

it("names the seeding story in the unseeded notice", () => {
  const out = renderUnseeded([entry()], "/x/call-mismatches-args-exclude");
  expect(out).toContain("UNSEEDED");
  expect(out).toContain("call-args-baseline-seed");
});
