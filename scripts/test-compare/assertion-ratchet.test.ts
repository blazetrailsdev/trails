import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countsFromArtifact, loadFreeze, parseMark } from "./assertion-ratchet.js";

// The gate arms (violations / nextMark / missingFromArtifact / the renderers)
// are exercised end-to-end through `main` in lint-assertion-mismatches.test.ts.
describe("countsFromArtifact", () => {
  it("reads the three per-package totals", () => {
    expect(
      countsFromArtifact({
        results: [
          {
            package: "activerecord",
            totalAssertionMismatch: 5,
            totalKindMismatch: 7,
            totalValueMismatch: 1,
          },
        ],
      }),
    ).toEqual({ activerecord: { assertionCount: 5, kind: 7, value: 1 } });
  });

  it("keeps a converged package at zero rather than dropping it", () => {
    expect(countsFromArtifact({ results: [{ package: "arel" }] })).toEqual({
      arel: { assertionCount: 0, kind: 0, value: 0 },
    });
  });
});

describe("parseMark", () => {
  it("rejects a non-integer counter", () => {
    expect(() =>
      parseMark('{"packages":{"arel":{"assertionCount":1.5,"kind":0,"value":0}}}'),
    ).toThrow(/arel\.assertionCount/);
  });

  it("rejects a missing counter", () => {
    expect(() => parseMark('{"packages":{"arel":{"assertionCount":0,"kind":0}}}')).toThrow(
      /arel\.value/,
    );
  });

  it("rejects a mark without a packages object", () => {
    expect(() => parseMark("{}")).toThrow(/expected/);
  });
});

describe("loadFreeze", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "assertion-freeze-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reads a marker's reason as the refusal text", async () => {
    const file = path.join(dir, "mark.freeze");
    await fs.writeFile(file, "Frozen for RFC 0132.\n\nLifted by story X.\n");
    expect(await loadFreeze(file)).toBe("Frozen for RFC 0132.\n\nLifted by story X.");
  });

  it("reports an absent marker as a live mark rather than an error", async () => {
    expect(await loadFreeze(path.join(dir, "absent.freeze"))).toBeNull();
  });

  it("rejects a marker that names no campaign", async () => {
    const file = path.join(dir, "mark.freeze");
    await fs.writeFile(file, "  \n\n");
    await expect(loadFreeze(file)).rejects.toThrow(/is empty/);
  });
});
