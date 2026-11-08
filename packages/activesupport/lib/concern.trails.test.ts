import { describe, expect, it } from "vitest";
import { extend, include } from "@blazetrails/ruby-compat";
import { includedModules } from "@blazetrails/ruby-compat/include";
import { Concern } from "./concern.js";

describe("Concern on a ruby-compat Module", () => {
  it("includes a Module concern's dependencies, methods and class methods", () => {
    const Dep = { dep: () => "dep" };
    extend(Dep, Concern);

    const Outer = { outer: () => "outer", ClassMethods: { klassMethod: () => "class" } };
    extend(Outer, Concern);
    include(Outer, Dep);

    const klass: any = class {};
    include(klass, Outer);
    expect(new klass().outer()).toBe("outer");
    expect(new klass().dep()).toBe("dep");
    expect(klass.klassMethod()).toBe("class");
    expect(includedModules(klass)).toEqual(expect.arrayContaining([Outer, Dep]));
  });
});
