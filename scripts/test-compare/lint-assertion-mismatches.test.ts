import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  main,
  NO_REGEN_FLAG,
  REGEN_SKIP_ENV,
  shouldRegenerate,
} from "./lint-assertion-mismatches.js";

let dir: string;
let paths: { artifact: string; base: string };

function artifactJson(counts: Record<string, [number, number, number]>): string {
  return JSON.stringify({
    results: Object.entries(counts).map(([pkg, [count, kind, value]]) => ({
      package: pkg,
      totalAssertionMismatch: count,
      totalKindMismatch: kind,
      totalValueMismatch: value,
    })),
  });
}

async function writeFixtures(
  artifact: Record<string, [number, number, number]>,
  base: Record<string, [number, number, number]>,
): Promise<void> {
  await fs.writeFile(paths.artifact, artifactJson(artifact));
  await fs.writeFile(paths.base, artifactJson(base));
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "assertion-ratchet-"));
  await fs.mkdir(path.join(dir, "base"));
  paths = {
    artifact: path.join(dir, "convention-comparison.json"),
    base: path.join(dir, "base", "convention-comparison.json"),
  };
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("main", () => {
  it("passes when every counter sits at or under its base count", async () => {
    await writeFixtures({ activerecord: [9, 20, 3] }, { activerecord: [10, 20, 3] });
    expect(await main(paths)).toBe(0);
  });

  it("fails when a counter grew past its base count", async () => {
    await writeFixtures({ activerecord: [10, 23, 3] }, { activerecord: [10, 20, 3] });
    expect(await main(paths)).toBe(1);
    expect(vi.mocked(console.error).mock.calls.join("\n")).toContain(
      "assertion-kind-mismatch: 23 (base 20, +3)",
    );
  });

  it("admits a package the base does not carry when it has no debt", async () => {
    await writeFixtures({ activerecord: [1, 1, 1], arel: [0, 0, 0] }, { activerecord: [1, 1, 1] });
    expect(await main(paths)).toBe(0);
  });

  it("fails when the artifact carries a package the base does not", async () => {
    await writeFixtures({ activerecord: [1, 1, 1], arel: [0, 1, 0] }, { activerecord: [1, 1, 1] });
    expect(await main(paths)).toBe(1);
    expect(vi.mocked(console.error).mock.calls.join("\n")).toContain("absent from");
  });

  it("refuses a partial-scope run rather than reading a base package as converged", async () => {
    await writeFixtures({ activerecord: [1, 1, 1] }, { activerecord: [1, 1, 1], arel: [0, 0, 0] });
    expect(await main(paths)).toBe(1);
    expect(vi.mocked(console.error).mock.calls.join("\n")).toContain("partial-scope");
  });

  it("gates a scoped run against the scope's own base counts", async () => {
    await writeFixtures({ thor: [2, 0, 0] }, { activerecord: [9, 9, 9], thor: [2, 0, 0] });
    expect(await main(paths, "thor")).toBe(0);
  });

  it("names the missing artifact rather than surfacing a bare ENOENT", async () => {
    await writeFixtures({}, {});
    await fs.rm(paths.artifact);
    await expect(main(paths)).rejects.toThrow(/pnpm parity:test --json/);
  });
});

describe("shouldRegenerate", () => {
  it("regenerates the artifact for a plain local run", () => {
    expect(shouldRegenerate([], {})).toBe(true);
  });

  it("does not regenerate under CI, which writes the artifact in its own step", () => {
    expect(shouldRegenerate([], { CI: "true" })).toBe(false);
  });

  it("does not regenerate under --no-regen or the skip env", () => {
    expect(shouldRegenerate([NO_REGEN_FLAG], {})).toBe(false);
    expect(shouldRegenerate([], { [REGEN_SKIP_ENV]: "1" })).toBe(false);
  });
});
