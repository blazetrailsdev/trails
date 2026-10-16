import { describe, it, expect } from "vitest";
import { extend, include, Module } from "@blazetrails/ruby-compat";

import { mattrAccessor, mattrWriter } from "../../module-ext.js";

describe("mattrAccessor on a ruby-compat Module", () => {
  it("reaches includers and extenders through the module's carrier", () => {
    const M = new Module() as any;
    mattrAccessor.call(M, "x");
    const Includer = class {};
    include(Includer, M);
    const Extender = class {};
    extend(Extender, M);
    const obj = new Includer() as any;

    M.x = 1;
    expect(obj.x).toBe(1);
    expect((Extender as any).x).toBe(1);
    obj.x = 2;
    expect(M.x).toBe(2);
    expect((Extender as any).x).toBe(2);
  });

  it("a writer-only mattr on a Module leaves an ancestor's reader visible to an includer", () => {
    const M = new Module() as any;
    mattrWriter.call(M, "x");
    class Parent {
      get x(): unknown {
        return "parent";
      }
    }
    class Child extends Parent {}
    include(Child, M);

    expect((new Child() as any).x).toBe("parent");
  });
});
