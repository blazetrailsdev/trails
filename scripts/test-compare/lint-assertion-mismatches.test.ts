import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Counts } from "./assertion-ratchet.js";
import {
  main,
  NO_REGEN_FLAG,
  REGEN_SKIP_ENV,
  shouldRegenerate,
} from "./lint-assertion-mismatches.js";

let dir: string;
let paths: { artifact: string; mark: string };

async function writeFixtures(
  artifact: Record<string, [number, number, number]>,
  mark: Record<string, [number, number, number]>,
): Promise<void> {
  await fs.writeFile(
    paths.artifact,
    JSON.stringify({
      results: Object.entries(artifact).map(([pkg, [count, kind, value]]) => ({
        package: pkg,
        totalAssertionMismatch: count,
        totalKindMismatch: kind,
        totalValueMismatch: value,
      })),
    }),
  );
  await fs.writeFile(
    paths.mark,
    JSON.stringify({
      packages: Object.fromEntries(
        Object.entries(mark).map(([pkg, [assertionCount, kind, value]]) => [
          pkg,
          { assertionCount, kind, value },
        ]),
      ),
    }),
  );
}

async function readMark(): Promise<Record<string, Counts>> {
  return (
    JSON.parse(await fs.readFile(paths.mark, "utf-8")) as { packages: Record<string, Counts> }
  ).packages;
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "assertion-ratchet-"));
  paths = { artifact: path.join(dir, "artifact.json"), mark: path.join(dir, "mark.json") };
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("main", () => {
  it("passes when every counter sits at or under its mark", async () => {
    await writeFixtures({ activerecord: [9, 20, 3] }, { activerecord: [10, 20, 3] });
    expect(await main(false, paths)).toBe(0);
  });

  it("fails when a counter grew past its mark", async () => {
    await writeFixtures({ activerecord: [10, 23, 3] }, { activerecord: [10, 20, 3] });
    expect(await main(false, paths)).toBe(1);
    expect(vi.mocked(console.error).mock.calls.join("\n")).toContain(
      "assertion-kind-mismatch: 23 (mark 20, +3)",
    );
  });

  it("fails when the artifact carries a package the mark does not", async () => {
    await writeFixtures({ activerecord: [1, 1, 1], arel: [0, 0, 0] }, { activerecord: [1, 1, 1] });
    expect(await main(false, paths)).toBe(1);
    expect(vi.mocked(console.error).mock.calls.join("\n")).toContain("absent from");
  });

  it("lowers the mark to the shrunken counters under --write", async () => {
    await writeFixtures({ activerecord: [4, 20, 0] }, { activerecord: [10, 20, 3] });
    expect(await main(true, paths)).toBe(0);
    expect(await readMark()).toEqual({ activerecord: { assertionCount: 4, kind: 20, value: 0 } });
  });

  it("never raises the mark under --write", async () => {
    await writeFixtures({ activerecord: [99, 99, 99] }, { activerecord: [10, 20, 3] });
    expect(await main(true, paths)).toBe(0);
    expect(await readMark()).toEqual({ activerecord: { assertionCount: 10, kind: 20, value: 3 } });
  });

  it("refuses a partial-scope run rather than dropping a marked package", async () => {
    await writeFixtures({ activerecord: [1, 1, 1] }, { activerecord: [1, 1, 1], arel: [0, 0, 0] });
    expect(await main(true, paths)).toBe(1);
    expect(await readMark()).toHaveProperty("arel");
  });

  it("names the missing artifact rather than surfacing a bare ENOENT", async () => {
    await writeFixtures({}, {});
    await fs.rm(paths.artifact);
    await expect(main(false, paths)).rejects.toThrow(/pnpm test:compare --json/);
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
