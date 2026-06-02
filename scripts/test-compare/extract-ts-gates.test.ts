import { describe, expect, it } from "vitest";
import { extractTestsFromSource } from "./extract-ts-core.js";
import { gateFromGuardExpr, gateFromWrapper, mergeGate } from "./gates.js";
import type { TestGate } from "./types.js";

/** Index a file's extracted tests by description → gate (or undefined). */
function tsGates(source: string, relPath = "packages/activerecord/src/x.test.ts") {
  const info = extractTestsFromSource(source, relPath);
  const out: Record<string, TestGate | undefined> = {};
  for (const tc of info.testCases) out[tc.description] = tc.gate;
  return out;
}

describe("gates.ts pure helpers", () => {
  it("maps adapter wrappers to a positive adapter set", () => {
    expect(gateFromWrapper("describeIfPg")).toEqual({
      adapters: ["postgresql"],
      source: ["wrapper"],
    });
    expect(gateFromWrapper("describeIfMysql")).toEqual({
      adapters: ["mysql"],
      source: ["wrapper"],
    });
    expect(gateFromWrapper("describeIfSqlite")).toEqual({
      adapters: ["sqlite"],
      source: ["wrapper"],
    });
    expect(gateFromWrapper("describe")).toBeNull();
  });

  it("maps support wrappers to a feature key", () => {
    expect(gateFromWrapper("describeIfSupports", "json")).toEqual({
      features: ["json"],
      source: ["wrapper"],
    });
    expect(gateFromWrapper("itIfSupports", "savepoints")).toEqual({
      features: ["savepoints"],
      source: ["wrapper"],
    });
  });

  it("resolves skipIf / runIf adapter expressions to a run-on set (source: test)", () => {
    // skipIf(true-when-mysql) → runs everywhere except mysql. Inline guards are
    // `source: ["test"]` (the TS analog of Ruby's body-skip), not "wrapper".
    expect(gateFromGuardExpr('adapterType === "mysql"', false)).toEqual({
      adapters: ["postgresql", "sqlite"],
      source: ["test"],
    });
    // skipIf(adapterType !== "sqlite") → runs only on sqlite
    expect(gateFromGuardExpr('adapterType !== "sqlite"', false)).toEqual({
      adapters: ["sqlite"],
      source: ["test"],
    });
    // runIf(adapterType === "postgres") → runs only on postgresql
    expect(gateFromGuardExpr('adapterType === "postgres"', true)).toEqual({
      adapters: ["postgresql"],
      source: ["test"],
    });
  });

  it("falls back to an unknown guard for unrecognized expressions", () => {
    expect(gateFromGuardExpr("!supportsConflictTarget", false)).toEqual({
      guards: ["unknown"],
      source: ["test"],
    });
  });

  it("intersects adapter sets and unions features when merging", () => {
    const merged = mergeGate(
      { adapters: ["postgresql", "mysql"], source: ["dir"] },
      { adapters: ["postgresql"], features: ["json"], source: ["body-skip"] },
    );
    expect(merged.adapters).toEqual(["postgresql"]);
    expect(merged.features).toEqual(["json"]);
    expect(merged.source).toEqual(["body-skip", "dir"]);
  });
});

describe("TS extractor gate detection", () => {
  it("threads describeIfPg/Mysql/Sqlite onto contained tests", () => {
    const g = tsGates(`
      describeIfPg("PgSuite", () => { it("a", () => {}); });
      describeIfSqlite("SqliteSuite", () => { it("b", () => {}); });
      describe("Plain", () => { it("c", () => {}); });
    `);
    expect(g["a"]).toEqual({ adapters: ["postgresql"], source: ["wrapper"] });
    expect(g["b"]).toEqual({ adapters: ["sqlite"], source: ["wrapper"] });
    expect(g["c"]).toBeUndefined();
  });

  it("recognizes describeIfSupports + itIfSupports feature gates", () => {
    const g = tsGates(`
      describeIfSupports("json", "JsonSuite", () => { it("d", () => {}); });
      itIfSupports("savepoints", "e", () => {});
    `);
    expect(g["d"]).toEqual({ features: ["json"], source: ["wrapper"] });
    expect(g["e"]).toEqual({ features: ["savepoints"], source: ["wrapper"] });
  });

  it("resolves inline it.skipIf / runIf adapter guards", () => {
    const g = tsGates(`
      it.skipIf(adapterType === "mysql")("f", () => {});
      it.runIf(adapterType === "postgres")("g", () => {});
    `);
    expect(g["f"]).toEqual({ adapters: ["postgresql", "sqlite"], source: ["test"] });
    expect(g["g"]).toEqual({ adapters: ["postgresql"], source: ["test"] });
  });

  it("composes an adapter wrapper's .skipIf form with the inline guard", () => {
    // describeIfMysql restricts to mysql; skipIf(postgres) → runs on !postgres;
    // intersection = mysql.
    const g = tsGates(`
      describeIfMysql.skipIf(adapterType === "postgres")("S", () => { it("j", () => {}); });
    `);
    // wrapper gate (mysql) ∩ inline guard → source unions both origins.
    expect(g["j"]).toEqual({ adapters: ["mysql"], source: ["test", "wrapper"] });
  });

  it("preserves an empty adapter set for contradictory nested wrappers", () => {
    const g = tsGates(`
      describeIfPg("outer", () => {
        describeIfMysql("inner", () => { it("never", () => {}); });
      });
    `);
    // pg ∩ mysql = [] → "runs nowhere", kept distinct from an absent key.
    expect(g["never"]).toEqual({ adapters: [], source: ["wrapper"] });
  });

  it("handles describeIfSupports.skipIf without losing the suite title/gate", () => {
    const info = extractTestsFromSource(
      `describeIfSupports.skipIf(adapterType === "mysql")("json", "S", () => { it("k", () => {}); });`,
      "packages/activerecord/src/x.test.ts",
    );
    const k = info.testCases.find((t) => t.description === "k")!;
    // title "S" is preserved in the path; gate = feature(json) ∩ guard(!mysql).
    expect(k.path).toBe("S > k");
    expect(k.gate).toEqual({
      adapters: ["postgresql", "sqlite"],
      features: ["json"],
      source: ["test", "wrapper"],
    });
  });

  it("keeps it.skip as pending without a gate (the TODO signal)", () => {
    const info = extractTestsFromSource(
      `it.skip("h", () => {}); it("i", () => {});`,
      "packages/activerecord/src/x.test.ts",
    );
    const h = info.testCases.find((t) => t.description === "h")!;
    const i = info.testCases.find((t) => t.description === "i")!;
    expect(h.pending).toBe(true);
    expect(h.gate).toBeUndefined();
    expect(i.pending).toBe(false);
  });
});
