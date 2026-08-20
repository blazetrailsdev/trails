/**
 * Trails-only surface: Rails derives `CollectionProxy`'s delegate list by
 * reflection —
 * `[QueryMethods, SpawnMethods].flat_map { |k| k.public_instance_methods(false) }`
 * (collection_proxy.rb:1128-1137) — so a query method added to either module is
 * delegated for free. trails reads the same list off the mixin objects
 * `include()` mixes into `Relation`, subtracting the members Ruby's `private`
 * keyword (query_methods.rb:1677, spawn_methods.rb:71) keeps out of
 * `public_instance_methods(false)`. Nothing in Rails pins that subtraction, so
 * the pin lives here: no hand-transcribed name may creep back in, and every
 * mixin key is classified as public or private exactly once.
 */
import { describe, it, expect } from "vitest";
import { CollectionProxy } from "./collection-proxy.js";
import { MIXIN_PUBLIC_INSTANCE_METHODS } from "./collection-proxy.js";
import { QueryMethodBangs } from "../relation/query-methods.js";
import { SpawnMethods } from "../relation/spawn-methods.js";

const mixinKeys = [...Object.keys(QueryMethodBangs), ...Object.keys(SpawnMethods)];
const delegatedNames = Object.getOwnPropertyNames(CollectionProxy.prototype);

describe("CollectionProxy delegate list", () => {
  it("holds no name outside the two mixin objects", () => {
    for (const name of MIXIN_PUBLIC_INSTANCE_METHODS) expect(mixinKeys).toContain(name);
  });

  it("delegates every public mixin member", () => {
    // `- [:select]` is the one name Rails subtracts by hand; the rest either
    // delegate or are answered by the proxy's own override.
    expect(MIXIN_PUBLIC_INSTANCE_METHODS.length).toBeGreaterThan(80);
    for (const name of MIXIN_PUBLIC_INSTANCE_METHODS) expect(delegatedNames).toContain(name);
  });

  it("delegates no private mixin member", () => {
    const priv = mixinKeys.filter((name) => !MIXIN_PUBLIC_INSTANCE_METHODS.includes(name));
    expect(priv).toContain("buildArel");
    expect(priv).toContain("relationWith");
    for (const name of priv) expect(delegatedNames).not.toContain(name);
  });

  it("delegates the whole SpawnMethods module", () => {
    expect(MIXIN_PUBLIC_INSTANCE_METHODS).toEqual(
      expect.arrayContaining(["spawn", "merge", "mergeBang", "except", "only"]),
    );
  });
});
