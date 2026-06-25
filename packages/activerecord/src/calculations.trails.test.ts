import { describe, it, expect } from "vitest";
import type { JoinDependency } from "./associations/join-dependency.js";
import { lookupCastTypeFromJoinDependencies } from "./relation/calculations.js";

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
