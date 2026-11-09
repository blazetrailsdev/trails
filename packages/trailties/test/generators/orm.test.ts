import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  TopLevel,
  constGet,
  constSet,
  constDefined,
  rbModRemoveConst,
} from "@blazetrails/ruby-compat";
import { ActiveModel } from "../../lib/generators/active-model.js";
import { ScaffoldControllerGenerator } from "../../lib/generators/trails/scaffold-controller/scaffold-controller-generator.js";

class ORMWithGeneratorsActiveModel {
  constructor(_name: string) {}
}

const ORMWithoutGenerators = {};

function generator(name: string, options: { orm?: string } = {}) {
  return new ScaffoldControllerGenerator([name], options, { destinationRoot: "/nonexistent" });
}

describe("ScaffoldOrmTest", () => {
  beforeAll(() => {
    constSet(TopLevel, "ORMWithGenerators", {});
    constSet(constGet(Object, "ORMWithGenerators") as object, "Generators", {});
    constSet(
      constGet(Object, "ORMWithGenerators::Generators") as object,
      "ActiveModel",
      ORMWithGeneratorsActiveModel,
    );
    constSet(TopLevel, "ORMWithoutGenerators", ORMWithoutGenerators);
  });

  afterAll(() => {
    if (constDefined(Object, "ORMWithGenerators::Generators::ActiveModel", false))
      rbModRemoveConst(constGet(Object, "ORMWithGenerators::Generators") as object, "ActiveModel");
    if (constDefined(Object, "ORMWithoutGenerators", false))
      rbModRemoveConst(Object, "ORMWithoutGenerators");
  });

  it("orm class returns custom generator if supported custom orm set", () => {
    const g = generator("Foo", { orm: "ORMWithGenerators" });
    expect(g.ormClass()).toBe(ORMWithGeneratorsActiveModel);
  });

  it("orm class returns trails generator if unsupported custom orm set", () => {
    const g = generator("Foo", { orm: "ORMWithoutGenerators" });
    expect(g.ormClass()).toBe(ActiveModel);
  });

  it("orm instance returns orm class instance with name", () => {
    const g = generator("Foo");
    const ormInstance = g.ormInstance();
    expect(ormInstance instanceof g.ormClass()).toBeTruthy();
    expect(ormInstance.name).toBe("foo");
  });
});
