import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { EnvironmentInquirer } from "../lib/environment-inquirer.js";
import { assertNot, assertPredicate } from "../lib/testing/assertions.js";

describe("EnvironmentInquirerTest", () => {
  it("local predicate", () => {
    assertPredicate(new EnvironmentInquirer("development"), (env) => env.isLocal());
    assertPredicate(new EnvironmentInquirer("test"), (env) => env.isLocal());
    assertNot(new EnvironmentInquirer("production").isLocal());
  });

  it("prevent local from being used as an actual environment name", () => {
    expect(() => {
      new EnvironmentInquirer("local");
    }).toThrow(ArgumentError);
  });
});
