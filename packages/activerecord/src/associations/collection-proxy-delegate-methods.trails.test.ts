import { describe, it, expect } from "vitest";
import { CollectionProxy } from "./collection-proxy.js";
import { MIXIN_PUBLIC_INSTANCE_METHODS } from "./collection-proxy.js";
import { moduleVisibility, type ModuleVisibility } from "@blazetrails/activesupport";
import { QueryMethods } from "../relation/query-methods.js";
import { SpawnMethods } from "../relation/spawn-methods.js";

const mixinKeys = [...Object.keys(QueryMethods), ...Object.keys(SpawnMethods)];
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

  it("classifies every mixin key as public, protected or private exactly once", () => {
    for (const mod of [QueryMethods, SpawnMethods]) {
      const sections = (mod as Record<symbol, unknown>)[moduleVisibility] as ModuleVisibility;
      const all = [...sections.public, ...sections.protected, ...sections.private];
      expect(new Set(all).size).toBe(all.length);
      expect(new Set(all)).toEqual(new Set(Object.keys(mod)));
    }
  });

  it("delegates the whole SpawnMethods module", () => {
    expect(MIXIN_PUBLIC_INSTANCE_METHODS).toEqual(
      expect.arrayContaining(["spawn", "merge", "mergeBang", "except", "only"]),
    );
  });
});
