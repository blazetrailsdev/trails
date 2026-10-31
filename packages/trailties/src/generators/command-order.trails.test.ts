import { describe, expect, it } from "vitest";
import { HelperGenerator } from "./rails/helper/helper-generator.js";
import { ModelGenerator } from "./test-unit/model/model-generator.js";

const order = (klass: unknown): string[] =>
  Object.keys((klass as { allCommands(): object }).allCommands());

describe("generator command order", () => {
  it("runs check_class_collision before the files it guards", () => {
    const commands = order(HelperGenerator);
    expect(commands.indexOf("checkClassCollision")).toBeLessThan(
      commands.indexOf("createHelperFiles"),
    );
  });

  it("registers create_fixture_file after create_test_file", () => {
    const commands = order(ModelGenerator);
    expect(commands.indexOf("createTestFile")).toBeLessThan(commands.indexOf("createFixtureFile"));
  });
});
