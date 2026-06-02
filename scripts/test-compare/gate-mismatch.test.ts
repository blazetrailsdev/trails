import { describe, expect, it } from "vitest";
import { classifyGateMismatch } from "./gates.js";
import type { TestGate } from "./types.js";

const pg: TestGate = { adapters: ["postgresql"], source: ["dir"] };
const pgWrapper: TestGate = { adapters: ["postgresql"], source: ["wrapper"] };
const mysql: TestGate = { adapters: ["mysql"], source: ["wrapper"] };
const json: TestGate = { features: ["json"], source: ["body-skip"] };
const jsonTs: TestGate = { features: ["json"], source: ["wrapper"] };
const allThree: TestGate = { adapters: ["mysql", "postgresql", "sqlite"], source: ["class"] };
const guardOnly: TestGate = { guards: ["mariadb"], source: ["body-skip"] };
const nowhere: TestGate = { adapters: [], source: ["class"] };

describe("classifyGateMismatch", () => {
  it("should-gate: Rails gates it, we it.skip as a TODO (no gate)", () => {
    expect(classifyGateMismatch(pg, undefined, true)).toBe("should-gate");
  });

  it("missing-gate: Rails gates it, we run unconditionally", () => {
    expect(classifyGateMismatch(pg, undefined, false)).toBe("missing-gate");
  });

  it("over-gated: Rails runs it everywhere, we gate it", () => {
    expect(classifyGateMismatch(undefined, pgWrapper, false)).toBe("over-gated");
    // all-adapters Rails gate is effectively unconditional → still over-gated
    expect(classifyGateMismatch(allThree, pgWrapper, false)).toBe("over-gated");
  });

  it("stays silent when Rails has only an incomparable guard but we gate", () => {
    // e.g. Rails `skip if supports_transaction_isolation?` → guards:["no_…"],
    // our TS gates [sqlite]. Real-but-incomparable Rails restriction → not over-gated.
    const negFeatureGuard: TestGate = { guards: ["no_transaction_isolation"], source: ["class"] };
    expect(
      classifyGateMismatch(negFeatureGuard, { adapters: ["sqlite"], source: ["test"] }, false),
    ).toBeNull();
  });

  it("wrong-gate: both gate it, but to different sets", () => {
    expect(classifyGateMismatch(pg, mysql, false)).toBe("wrong-gate");
    expect(classifyGateMismatch(json, mysql, false)).toBe("wrong-gate");
  });

  it("agrees (null) when adapter/feature sets match — ignoring source vocab", () => {
    expect(classifyGateMismatch(pg, pgWrapper, false)).toBeNull(); // dir vs wrapper, same adapter
    expect(classifyGateMismatch(json, jsonTs, false)).toBeNull(); // body-skip vs wrapper, same feature
  });

  it("treats an all-adapters Rails gate as unconditional (no false missing-gate)", () => {
    expect(classifyGateMismatch(allThree, undefined, false)).toBeNull();
  });

  it("ignores guard-only gates (mariadb/version/in_memory_db are not comparable)", () => {
    expect(classifyGateMismatch(guardOnly, undefined, false)).toBeNull();
  });

  it("does not flag a genuine TODO (Rails unconditional, we it.skip)", () => {
    expect(classifyGateMismatch(undefined, undefined, true)).toBeNull();
  });

  it("distinguishes an empty 'runs nowhere' set from all-adapters", () => {
    // contradictory Rails gate ([]) vs our unconditional run → mismatch
    expect(classifyGateMismatch(nowhere, undefined, false)).toBe("missing-gate");
  });
});
