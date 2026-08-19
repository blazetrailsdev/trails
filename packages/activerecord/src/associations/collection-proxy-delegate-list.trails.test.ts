// Verify that the CollectionProxy delegate list is correctly derived from mixin objects
// and that the residual query methods (still on Relation) don't regrow.

import { describe, it, expect } from "vitest";
import { QueryMethodBangs, SpawnMethods } from "../relation.js";
import { CollectionProxy } from "./collection-proxy.js";

describe("CollectionProxy — delegate list derivation", () => {
  it("residual query methods do not intersect with exported mixin keys", () => {
    // These are the query methods that still live on Relation, not yet
    // extracted to a mixin. They should NOT overlap with QueryMethodBangs or
    // SpawnMethods keys, which would mean they've been moved but the list
    // wasn't updated. Currently empty as all query methods are in QueryMethodBangs.
    const residualQueryMethods: string[] = [];

    const queryMethodBangsKeys = Object.keys(QueryMethodBangs);
    const spawnMethodsKeys = Object.keys(SpawnMethods);
    const allMixinKeys = new Set([...queryMethodBangsKeys, ...spawnMethodsKeys]);

    // Check that no residual method is in the mixin keys.
    for (const method of residualQueryMethods) {
      expect(allMixinKeys.has(method)).toBe(false);
    }
  });

  it("pinned delegate set includes query methods, spawn methods, and extras", () => {
    // Extract the delegated method names from CollectionProxy.prototype.
    // These are the properties added by the delegation setup at the end of
    // collection-proxy.ts.
    const delegatedMethods = Object.getOwnPropertyNames(CollectionProxy.prototype).filter(
      (name) =>
        typeof Object.getOwnPropertyDescriptor(CollectionProxy.prototype, name)?.value ===
        "function",
    );

    // The expected set should include:
    // 1. Query methods (both bang and non-bang) derived from QueryMethodBangs
    // 2. Spawn methods derived from SpawnMethods
    // 3. Extra methods (scoping, values, insert, etc.)

    // Sample of query methods to verify are delegated (both bang and non-bang from QueryMethodBangs).
    const queryMethodSamples = [
      "where",
      "select",
      "order",
      "limit",
      "whereBang",
      "orderBang",
      "limitBang",
      "reselectBang",
    ];

    // Sample of spawn methods.
    const spawnMethodSamples = ["spawn", "merge", "mergeBang", "except", "only"];

    // Extra methods added to the delegate list.
    const extraMethods = [
      "scoping",
      "values",
      "insert",
      "insertBang",
      "insertAll",
      "insertAllBang",
      "upsert",
      "upsertAll",
      "loadAsync",
    ];

    const expectedMethods = [...queryMethodSamples, ...spawnMethodSamples, ...extraMethods];

    for (const method of expectedMethods) {
      expect(delegatedMethods).toContain(method);
    }
  });
});
