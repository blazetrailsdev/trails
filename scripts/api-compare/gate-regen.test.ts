import { describe, expect, it } from "vitest";
import {
  NO_REGEN_FLAG,
  REGEN_SKIP_ENV,
  regenerateArtifact,
  shouldRegenerate,
} from "./gate-regen.js";

describe("shouldRegenerate", () => {
  it("regenerates on a plain local gating run", () => {
    expect(shouldRegenerate([], {})).toBe(true);
  });

  it("opts out under CI, which runs compare.ts as its own step", () => {
    expect(shouldRegenerate([], { CI: "true" })).toBe(false);
  });

  it("opts out on the explicit flag or env escape hatch", () => {
    expect(shouldRegenerate([NO_REGEN_FLAG], {})).toBe(false);
    expect(shouldRegenerate([], { [REGEN_SKIP_ENV]: "1" })).toBe(false);
  });

  it("leaves the read-only views alone", () => {
    expect(shouldRegenerate(["--report"], {})).toBe(false);
    expect(shouldRegenerate(["--unreviewed"], {})).toBe(false);
  });

  it("regenerates for a bare --write, so a reseed never baselines a stale artifact", () => {
    expect(shouldRegenerate(["--write"], {})).toBe(true);
  });

  it("skips the --write regeneration only when the reseed script already forced one", () => {
    expect(shouldRegenerate(["--write"], { API_COMPARE_FORCE: "1" })).toBe(false);
  });
});

describe("regenerateArtifact", () => {
  it("rejects with the failing command when the regeneration exits non-zero", async () => {
    await expect(regenerateArtifact({ PATH: "" })).rejects.toThrow(/pnpm api:compare|spawn/);
  });

  it("names the calls scope in the failure when the caller passes it", async () => {
    await expect(regenerateArtifact({ PATH: "" }, ["--calls"])).rejects.toThrow(
      /pnpm api:compare --calls|spawn/,
    );
  });
});
