import { describe, expect, it } from "vitest";
import { Module, extend, include } from "@blazetrails/ruby-compat";
import { includedModules } from "@blazetrails/ruby-compat/include";
import { Concern } from "./concern.js";

describe("Concern on a ruby-compat Module", () => {
  it("includes a Module concern's dependencies, methods and class methods", () => {
    const Dep = new Module() as Module & Record<string, any>;
    extend(Dep, Concern);
    Dep.defineMethod("dep", () => "dep");

    const Outer = new Module() as Module & Record<string, any>;
    extend(Outer, Concern);
    include(Outer, Dep);
    Outer.defineMethod("outer", () => "outer");
    Outer.classMethods((mod: Record<string, unknown>) => {
      mod.klassMethod = () => "class";
    });

    const klass: any = class {};
    include(klass, Outer);
    expect(new klass().outer()).toBe("outer");
    expect(new klass().dep()).toBe("dep");
    expect(klass.klassMethod()).toBe("class");
    expect(includedModules(klass)).toEqual(expect.arrayContaining([Outer, Dep]));
  });
});
