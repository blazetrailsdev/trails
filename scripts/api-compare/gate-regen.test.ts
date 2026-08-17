import { describe, expect, it } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  NO_REGEN_FLAG,
  REGEN_SKIP_ENV,
  artifactIsStale,
  regenEnv,
  regenerateArtifact,
  shouldRegenerate,
  staleArtifactMessage,
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
    await expect(regenerateArtifact({ PATH: "" })).rejects.toThrow(/pnpm parity:api|spawn/);
  });

  it("names the calls scope in the failure when the caller passes it", async () => {
    await expect(regenerateArtifact({ PATH: "" }, ["--calls"])).rejects.toThrow(
      /pnpm parity:api --calls|spawn/,
    );
  });
});

describe("regenEnv", () => {
  it("forces the regeneration, so the artifact the gate reads is never a partial one", () => {
    expect(regenEnv({ PATH: "/usr/bin" })).toEqual({ PATH: "/usr/bin", API_COMPARE_FORCE: "1" });
  });

  it("keeps the caller's env otherwise, and does not mutate it", () => {
    const env = { CI: "true" };
    expect(regenEnv(env).CI).toBe("true");
    expect(env).toEqual({ CI: "true" });
  });
});

describe("artifactIsStale", () => {
  it("is false for an artifact written after the sources it describes", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gate-regen-"));
    const artifact = path.join(dir, "call-mismatches.json");
    await fs.writeFile(artifact, "{}");
    expect(await artifactIsStale(artifact)).toBe(false);
  });

  it("is true once the artifact predates a compared source", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gate-regen-"));
    const artifact = path.join(dir, "call-mismatches.json");
    await fs.writeFile(artifact, "{}");
    // Backdate the artifact rather than touching a real source file: the roots
    // are the live repo, and moving one file's mtime would race sibling tests.
    const longAgo = new Date(Date.now() - 86_400_000);
    await fs.utimes(artifact, longAgo, longAgo);
    expect(await artifactIsStale(artifact)).toBe(true);
  });

  it("is false when the artifact does not exist — the caller has a better error", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gate-regen-"));
    expect(await artifactIsStale(path.join(dir, "absent.json"))).toBe(false);
  });
});

describe("staleArtifactMessage", () => {
  it("names the gate, refuses in the first line, and gives the forced regeneration", () => {
    const message = staleArtifactMessage("call-mismatches ratchet", "/x/output/call.json");
    expect(message).toContain("call-mismatches ratchet: REFUSING to gate");
    expect(message).toContain("API_COMPARE_FORCE=1 pnpm parity:api --calls");
    expect(message).toContain(NO_REGEN_FLAG);
  });
});
