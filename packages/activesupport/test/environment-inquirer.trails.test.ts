import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { EnvironmentInquirer, DEFAULT_ENVIRONMENTS } from "../lib/environment-inquirer.js";

describe("EnvironmentInquirer", () => {
  it("carries the message environment_inquirer.rb:15 raises with", () => {
    expect(() => new EnvironmentInquirer("local")).toThrow(
      new ArgumentError("'local' is a reserved environment name"),
    );
  });

  it("answers each DEFAULT_ENVIRONMENTS predicate without the method_missing proxy", () => {
    const env = new EnvironmentInquirer("production");
    expect([env.isDevelopment(), env.isTest(), env.isProduction()]).toEqual([false, false, true]);
    expect(DEFAULT_ENVIRONMENTS.length).toBe(3);
    expect(Object.hasOwn(EnvironmentInquirer.prototype, "isProduction")).toBe(true);
  });
});
