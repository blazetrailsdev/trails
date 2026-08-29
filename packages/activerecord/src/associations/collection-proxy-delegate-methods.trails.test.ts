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
