import { describe, it, expect } from "vitest";
import { Base, registerModel } from "./index.js";
import type { JoinDependency } from "./associations/join-dependency.js";
import { lookupCastTypeFromJoinDependencies } from "./relation/calculations.js";
import { Topic } from "./test-helpers/models/topic.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";

// ==========================================================================
// lookupCastTypeFromJoinDependencies unit tests
//
// trails-specific invariant: lookupCastTypeFromJoinDependencies is an
// `@internal` helper with no Rails counterpart. These unit tests guard its
// behaviour and were relocated verbatim out of calculations.test.ts as part
// of the extra-test burndown (RFC 0043).
// ==========================================================================

describe("lookupCastTypeFromJoinDependencies", () => {
  it("returns cast type from a joined table's attributeTypes", () => {
    const intType = { cast: (v: unknown) => Number(v) };
    const fakeNode = { baseKlass: { attributeTypes: () => ({ credit_limit: intType }) } };
    const fakeJd = [fakeNode];
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "credit_limit",
      [fakeJd] as unknown as JoinDependency[],
    );
    expect(result).toBe(intType);
  });

  it("returns null when name is not in any joined table", () => {
    const fakeNode = { baseKlass: { attributeTypes: () => ({ other: {} }) } };
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "missing",
      [[fakeNode]] as unknown as JoinDependency[],
    );
    expect(result).toBeNull();
  });

  it("returns first match when multiple join deps are present", () => {
    const type1 = { cast: (v: unknown) => String(v) };
    const type2 = { cast: (v: unknown) => Number(v) };
    const node1 = { baseKlass: { attributeTypes: () => ({ name: type1 }) } };
    const node2 = { baseKlass: { attributeTypes: () => ({ name: type2 }) } };
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "name",
      [[node1], [node2]] as unknown as JoinDependency[],
    );
    expect(result).toBe(type1);
  });

  it("supports attributeTypes as a plain object", () => {
    const strType = { cast: (v: unknown) => String(v) };
    const fakeNode = { baseKlass: { attributeTypes: { title: strType } } };
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "title",
      [[fakeNode]] as unknown as JoinDependency[],
    );
    expect(result).toBe(strType);
  });

  it("supports attributeTypes as a Map", () => {
    const strType = { cast: (v: unknown) => String(v) };
    const fakeNode = { baseKlass: { attributeTypes: new Map([["title", strType]]) } };
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "title",
      [[fakeNode]] as unknown as JoinDependency[],
    );
    expect(result).toBe(strType);
  });

  it("skips nodes without modelClass", () => {
    const type = { cast: (v: unknown) => v };
    const nodeMissing = { baseKlass: undefined };
    const nodeGood = { baseKlass: { attributeTypes: () => ({ val: type }) } };
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "val",
      [[nodeMissing, nodeGood]] as unknown as JoinDependency[],
    );
    expect(result).toBe(type);
  });
});

// ==========================================================================
// lookupCastTypeFromJoinDependencies integration test
//
// trails-specific invariant (no Rails counterpart): an end-to-end check that
// joining a real model resolves a joined column's concrete cast type through
// the join-dependency walk — complementing the mock-based unit tests above.
// Relocated verbatim out of calculations.test.ts (RFC 0043).
// ==========================================================================

describe("lookupCastTypeFromJoinDependencies integration", () => {
  registerModel("Topic", Topic);

  // Rails' Author `has_many :topics, primary_key: "name", foreign_key:
  // "author_name"`. Defined locally under a distinct class name (not the
  // canonical Author model) so importing it does not perturb the shared model
  // registry / name-disambiguation counter used by other describe blocks.
  class CalcAuthor extends Base {
    static {
      this._tableName = "authors";
      this.attribute("name", "string");
      this.hasMany("topics", {
        primaryKey: "name",
        foreignKey: "author_name",
        className: "Topic",
      });
    }
  }

  fixtures(["topics", "authors"], { schema: canonicalSchema });

  // A plain `joins(:assoc)` now feeds buildJoinDependencies (via _namedInnerJoins),
  // so lookupCastTypeFromJoinDependencies recovers the joined column's cast type
  // through the join-dependency walk — no `_joinClauses`-klass fallback. Replaces
  // the unit tests that asserted the (removed) `_joinClauses.klass` recovery.
  it("resolves joined column cast type through the join-dependency walk", () => {
    const rel = CalcAuthor.joins("topics");
    // `written_on` is a datetime attribute that lives only on the joined Topic;
    // it resolves to Topic's Time cast type via the join-dependency walk (the
    // base CalcAuthor has no such attribute).
    const castType = lookupCastTypeFromJoinDependencies(
      rel as unknown as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "written_on",
    ) as {
      constructor: { name: string };
    } | null;
    expect(castType).toBeTruthy();
    // The joined Topic's concrete datetime type (e.g. SQLiteDateTimeType), not
    // the default ValueType the base CalcAuthor returns for unknown columns.
    expect(castType?.constructor.name).not.toBe("ValueType");
  });
});
