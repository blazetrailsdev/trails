import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { unregisterConstant, TopLevel, constGet, constSet } from "@blazetrails/ruby-compat";
import { ActiveModel } from "./active-model.js";
import { ScaffoldControllerGenerator } from "./trails/scaffold-controller/scaffold-controller-generator.js";

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
    unregisterConstant("ORMWithGenerators::Generators::ActiveModel", ORMWithGeneratorsActiveModel);
    unregisterConstant("ORMWithoutGenerators", ORMWithoutGenerators);
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
