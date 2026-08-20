/**
 * Trails-only surface: Rails derives `CollectionProxy`'s delegate list by
 * reflection —
 * `[QueryMethods, SpawnMethods].flat_map { |k| k.public_instance_methods(false) }`
 * (collection_proxy.rb:1128-1137) — so a query method added to either module is
 * delegated for free. trails reads the same list off the mixin objects
 * `include()` mixes into `Relation`, with a hand-list standing in for the
 * `QueryMethods` members that still live on `Relation` itself until RFC 0107
 * finishes moving them into `relation/query-methods.ts`. Nothing in Rails pins
 * either half, so the pin lives here: the residual may only shrink, and the
 * derived half must stay wired to the mixins.
 */
import { describe, it, expect } from "vitest";
import { CollectionProxy } from "./collection-proxy.js";
import { QueryMethodBangs } from "../relation/query-methods.js";
import { SpawnMethods } from "../relation/spawn-methods.js";

// `private` (query_methods.rb:1677, spawn_methods.rb:71) — Ruby keeps these out
// of `public_instance_methods(false)`; a JS object literal carries no such mark.
const PRIVATE_MIXIN_INSTANCE_METHODS = [
  "assertModifiableBang",
  "checkIfMethodHasArgumentsBang",
  "_selectBang",
  "relationWith",
];

const delegatedNames = Object.getOwnPropertyNames(CollectionProxy.prototype);

describe("CollectionProxy delegate list", () => {
  it("delegates every public bang builder the QueryMethods mixin carries", () => {
    const bangs = Object.keys(QueryMethodBangs).filter(
      (name) => name.endsWith("Bang") && !PRIVATE_MIXIN_INSTANCE_METHODS.includes(name),
    );
    expect(bangs.length).toBeGreaterThan(0);
    for (const name of bangs) expect(delegatedNames).toContain(name);
  });

  it("delegates every public SpawnMethods member", () => {
    const spawns = Object.keys(SpawnMethods).filter(
      (name) => !PRIVATE_MIXIN_INSTANCE_METHODS.includes(name),
    );
    expect(spawns).toEqual(["spawn", "merge", "mergeBang", "except", "only"]);
    for (const name of spawns) expect(delegatedNames).toContain(name);
  });

  it("delegates no private mixin member", () => {
    for (const name of PRIVATE_MIXIN_INSTANCE_METHODS) {
      expect(delegatedNames).not.toContain(name);
    }
  });
});
