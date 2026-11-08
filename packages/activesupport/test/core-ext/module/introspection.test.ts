import { beforeAll, describe, expect, it } from "vitest";
import {
  TopLevel,
  constGet,
  constSet,
  constDefined,
  rbModRemoveConst,
} from "@blazetrails/ruby-compat";
import { moduleParent, moduleParentName, moduleParents } from "../../../lib/module-ext.js";
import { assertNil } from "../../../lib/testing/assertions.js";

function namedModule(name: string): { name: string } {
  const mod = {};
  Object.defineProperty(mod, "name", { value: name, configurable: true });
  const i = name.lastIndexOf("::");
  constSet(
    i < 0 ? TopLevel : (constGet(Object, name.slice(0, i)) as object),
    i < 0 ? name : name.slice(i + 2),
    mod,
  );
  return mod as { name: string };
}

describe("IntrospectionTest", () => {
  let ParentA: { name: string };
  let ParentAB: { name: string };
  let ParentABC: { name: string };
  let ParentAFrozenB: { name: string };
  let ParentABFrozenC: { name: string };

  beforeAll(() => {
    ParentA = namedModule("ParentA");
    ParentAB = namedModule("ParentA::B");
    ParentABC = namedModule("ParentA::B::C");
    ParentAFrozenB = Object.freeze(namedModule("ParentA::FrozenB"));
    ParentABFrozenC = Object.freeze(namedModule("ParentA::B::FrozenC"));
  });

  it("module parent name", () => {
    expect(moduleParentName(ParentAB)).toEqual("ParentA");
    expect(moduleParentName(ParentABC)).toEqual("ParentA::B");
    assertNil(moduleParentName(ParentA));
  });

  it("module parent name when frozen", () => {
    expect(moduleParentName(ParentAFrozenB)).toEqual("ParentA");
    expect(moduleParentName(ParentABFrozenC)).toEqual("ParentA::B");
  });

  it("module parent name notice changes", () => {
    const klass = class {};
    assertNil(moduleParentName(klass));
    const newClass = namedModule("ParentA::NewClass");
    try {
      expect(moduleParentName(newClass)).toEqual("ParentA");
    } finally {
      if (constDefined(Object, "ParentA::NewClass", false))
        rbModRemoveConst(constGet(Object, "ParentA") as object, "NewClass");
    }
  });

  it("module parent", () => {
    expect(moduleParent(ParentABC)).toBe(ParentAB);
    expect(moduleParent(ParentAB)).toBe(ParentA);
    expect(moduleParent(ParentA)).toBe(Object);
  });

  it("module parents", () => {
    expect(moduleParents(ParentABC)).toEqual([ParentAB, ParentA, Object]);
    expect(moduleParents(ParentAB)).toEqual([ParentA, Object]);
  });

  it("module parent notice changes", () => {
    const klass = class {};
    expect(moduleParent(klass)).toBe(Object);
    const newClass = namedModule("ParentA::NewClass");
    try {
      expect(moduleParent(newClass)).toBe(ParentA);
    } finally {
      if (constDefined(Object, "ParentA::NewClass", false))
        rbModRemoveConst(constGet(Object, "ParentA") as object, "NewClass");
    }
  });
});
