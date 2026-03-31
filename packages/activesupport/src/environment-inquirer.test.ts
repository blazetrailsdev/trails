import { describe, it, expect } from "vitest";
import { EnvironmentInquirer } from "./environment-inquirer.js";

describe("EnvironmentInquirerTest", () => {
  it("local predicate", () => {
    expect(new EnvironmentInquirer("development").isLocal()).toBe(true);
    expect(new EnvironmentInquirer("test").isLocal()).toBe(true);
    expect(new EnvironmentInquirer("production").isLocal()).toBe(false);
  });

  it("prevent local from being used as an actual environment name", () => {
    expect(() => {
      new EnvironmentInquirer("local");
    }).toThrow();
  });
});
