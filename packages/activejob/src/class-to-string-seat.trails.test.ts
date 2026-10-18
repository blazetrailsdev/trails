import { describe, expect, it } from "vitest";
import * as ActiveSupportExports from "@blazetrails/activesupport";
import { Delegator, ExecutionWrapper, Executor } from "@blazetrails/activesupport";
import { rbModToS } from "@blazetrails/ruby-compat";
import * as ActiveJobExports from "./index.js";
import { Base } from "./base.js";

describe("class-to-string-seat", () => {
  it("renders a namespaced class by its constant path", () => {
    expect(`${Base}`).toBe("ActiveJob::Base");
  });

  it("renders a top-level class by its name", () => {
    expect(`${Delegator}`).toBe("Delegator");
  });

  it("renders a subclass by its own seat, not its parent's", () => {
    expect(`${ExecutionWrapper}`).toBe("ActiveSupport::ExecutionWrapper");
    expect(`${Executor}`).toBe("ActiveSupport::Executor");
  });

  it("agrees with rbModToS for every seated class with a classpath", () => {
    const seated = Object.values({ ...ActiveSupportExports, ...ActiveJobExports }).filter(
      (v): v is abstract new (...args: never) => unknown =>
        typeof v === "function" && Object.hasOwn(v, "toString") && rbModToS(v as never) !== v.name,
    );
    expect(seated).toContain(Base);
    for (const klass of seated) expect(String(klass)).toBe(rbModToS(klass));
  });
});
