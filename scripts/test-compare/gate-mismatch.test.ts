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
    // e.g. Rails `skip if mariadb?` → guards:["mariadb"], our TS gates
    // [sqlite]. Real-but-incomparable Rails restriction → not over-gated.
    // (A `no_<feature>` guard is NOT such a case — see the signed-feature
    // tests below, where it compares like any other feature.)
    const runtimeGuard: TestGate = { guards: ["mariadb"], source: ["class"] };
    expect(
      classifyGateMismatch(runtimeGuard, { adapters: ["sqlite"], source: ["test"] }, false),
    ).toBeNull();
  });

  it("compares an inverted feature restriction as a signed feature", () => {
    // Rails `skip unless supports_rename_index?` and our
    // `it.skipIf(adapterSupports("rename_index"))` both emit
    // guards:["no_rename_index"] — same restriction, so they agree.
    const noRenameIndexRails: TestGate = { guards: ["no_rename_index"], source: ["body-skip"] };
    const noRenameIndexTs: TestGate = { guards: ["no_rename_index"], source: ["test"] };
    expect(classifyGateMismatch(noRenameIndexRails, noRenameIndexTs, false)).toBeNull();

    // OPPOSITE inverted feature sets are now REPORTED rather than compared
    // equal by both being dropped from the comparable dimensions.
    const noJson: TestGate = { guards: ["no_json"], source: ["body-skip"] };
    expect(classifyGateMismatch(noRenameIndexRails, noJson, false)).toBe("wrong-gate");

    // `no_x` and `x` are opposite restrictions, never a match.
    expect(classifyGateMismatch(noJson, jsonTs, false)).toBe("wrong-gate");

    // An inverted feature is a real restriction on its own: Rails carries one
    // and we run unconditionally → missing-gate (it used to stay silent).
    expect(classifyGateMismatch(noRenameIndexRails, undefined, false)).toBe("missing-gate");
    // …and the reverse is over-gated.
    expect(classifyGateMismatch(undefined, noRenameIndexTs, false)).toBe("over-gated");
  });

  it("keeps a `no_<feature>` beside a plain feature in the compared key", () => {
    // The foreign-key case: Rails features=[foreign_keys] guards=[no_rename_index]
    // vs a TS side carrying only features=[foreign_keys].
    const railsFk: TestGate = {
      features: ["foreign_keys"],
      guards: ["no_rename_index"],
      source: ["class"],
    };
    const tsFk: TestGate = { features: ["foreign_keys"], source: ["wrapper"] };
    expect(classifyGateMismatch(railsFk, tsFk, false)).toBe("wrong-gate");
    expect(
      classifyGateMismatch(railsFk, { ...tsFk, guards: ["no_rename_index"] }, false),
    ).toBeNull();
    // An incomparable guard riding along does not disturb the key.
    expect(
      classifyGateMismatch(railsFk, { ...tsFk, guards: ["no_rename_index", "mariadb"] }, false),
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
    // TS-side nowhere vs Rails [pg] → both comparable, keys differ → wrong-gate
    expect(classifyGateMismatch(pg, nowhere, false)).toBe("wrong-gate");
  });

  it("ignores tsPending when both sides are comparably gated", () => {
    // already has a gate (just the wrong one) → wrong-gate, never should-gate
    expect(classifyGateMismatch(pg, mysql, true)).toBe("wrong-gate");
  });

  it("compares the combined adapter+feature key (both dimensions)", () => {
    const pgJson: TestGate = { adapters: ["postgresql"], features: ["json"], source: ["class"] };
    const mysqlJson: TestGate = { adapters: ["mysql"], features: ["json"], source: ["wrapper"] };
    // same feature, different adapter → wrong-gate
    expect(classifyGateMismatch(pgJson, mysqlJson, false)).toBe("wrong-gate");
    // cross-dimension: Rails adapter-gated [pg] vs TS feature-gated [json]
    // → keys "postgresql|" vs "*|json" → wrong-gate
    expect(classifyGateMismatch(pg, jsonTs, false)).toBe("wrong-gate");
    // same adapter AND same feature → agree
    expect(classifyGateMismatch(pgJson, { ...pgJson, source: ["wrapper"] }, false)).toBeNull();
  });

  it("compares the intersected set from a pure-`&&` adapter+feature condition", () => {
    // view_test.rb:197 — `current_adapter?(:PostgreSQLAdapter, :SQLite3Adapter)
    // && supports_insert_returning?` under a mysql+postgresql class guard; the
    // extractor now keeps the intersection instead of dropping the adapter half.
    const railsGate: TestGate = {
      adapters: ["postgresql"],
      features: ["insert_returning", "views"],
      source: ["class"],
    };
    // matching TS gate (`itIfSupports.skipIf(adapterType !== "postgres")`) agrees
    expect(
      classifyGateMismatch(railsGate, { ...railsGate, source: ["test", "wrapper"] }, false),
    ).toBeNull();
    // the pre-fix TS gate, which ran the test on MySQL too, is a wrong-gate
    expect(
      classifyGateMismatch(
        railsGate,
        {
          adapters: ["mysql", "postgresql"],
          features: ["insert_returning", "views"],
          source: ["test", "wrapper"],
        },
        false,
      ),
    ).toBe("wrong-gate");
  });
});
