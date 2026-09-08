import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { EnvironmentInquirer } from "./environment-inquirer.js";
import { assertNot, assertPredicate } from "./testing/assertions.js";

describe("EnvironmentInquirerTest", () => {
  it("local predicate", () => {
    assertPredicate(new EnvironmentInquirer("development"), (env) => env["local?"]());
    assertPredicate(new EnvironmentInquirer("test"), (env) => env["local?"]());
    assertNot(new EnvironmentInquirer("production")["local?"]());
  });

  it("prevent local from being used as an actual environment name", () => {
    expect(() => {
      new EnvironmentInquirer("local");
    }).toThrow(new ArgumentError("'local' is a reserved environment name"));
  });
});
