import { describe, it, expect } from "vitest";
import { EnvironmentInquirer } from "./environment-inquirer.js";
import { assertNot, assertPredicate } from "./testing/assertions.js";

describe("EnvironmentInquirerTest", () => {
  it("local predicate", () => {
    assertPredicate(new EnvironmentInquirer("development"), (env) => env.isLocal());
    assertPredicate(new EnvironmentInquirer("test"), (env) => env.isLocal());
    assertNot(new EnvironmentInquirer("production").isLocal());
  });

  it("prevent local from being used as an actual environment name", () => {
    expect(() => {
      new EnvironmentInquirer("local");
    }).toThrow();
  });
});
