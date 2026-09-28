import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { registerConstant, unregisterConstant } from "@blazetrails/activesupport";
import { ActiveModel } from "./active-model.js";
import { ScaffoldControllerGenerator } from "./rails/scaffold-controller/scaffold-controller-generator.js";

class ORMWithGeneratorsActiveModel {
  constructor(_name: string) {}
}

const ORMWithoutGenerators = {};

function generator(name: string, options: { orm?: string } = {}) {
  return new ScaffoldControllerGenerator({
    cwd: "/nonexistent",
    output: () => {},
    name,
    ...options,
  });
}

describe("ScaffoldOrmTest", () => {
  beforeAll(() => {
    registerConstant("ORMWithGenerators::Generators::ActiveModel", ORMWithGeneratorsActiveModel);
    registerConstant("ORMWithoutGenerators", ORMWithoutGenerators);
  });

  afterAll(() => {
    unregisterConstant("ORMWithGenerators::Generators::ActiveModel", ORMWithGeneratorsActiveModel);
    unregisterConstant("ORMWithoutGenerators", ORMWithoutGenerators);
  });

  it("orm class returns custom generator if supported custom orm set", () => {
    const g = generator("Foo", { orm: "ORMWithGenerators" });
    expect(g.ormClass()).toBe(ORMWithGeneratorsActiveModel);
  });

  it("orm class returns rails generator if unsupported custom orm set", () => {
    const g = generator("Foo", { orm: "ORMWithoutGenerators" });
    expect(g.ormClass()).toBe(ActiveModel);
  });

  it("orm instance returns orm class instance with name", () => {
    const g = generator("Foo");
    const ormInstance = g.ormInstance();
    expect(ormInstance).toBeInstanceOf(g.ormClass());
    expect(ormInstance.name).toBe("foo");
  });
});
