import { describe, expect, it } from "vitest";
import { HelperGenerator } from "./rails/helper/helper-generator.js";
import { ModelGenerator } from "./test-unit/model/model-generator.js";

const order = (klass: unknown): string[] =>
  Object.keys((klass as { allCommands(): object }).allCommands());

describe("generator command order", () => {
  it("runs check_class_collision before the files it guards", () => {
    const commands = order(HelperGenerator);
    expect(commands.indexOf("check-class-collision")).toBeGreaterThanOrEqual(0);
    expect(commands.indexOf("check-class-collision")).toBeLessThan(
      commands.indexOf("create-helper-files"),
    );
  });

  it("registers create_fixture_file after create_test_file", () => {
    const commands = order(ModelGenerator);
    expect(commands.indexOf("create-test-file")).toBeGreaterThanOrEqual(0);
    expect(commands.indexOf("create-test-file")).toBeLessThan(
      commands.indexOf("create-fixture-file"),
    );
  });
});
