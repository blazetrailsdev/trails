import { describe, expect, it } from "vitest";
import * as ActiveSupportExports from "@blazetrails/activesupport";
import { Delegator, ExecutionWrapper, Executor } from "@blazetrails/activesupport";
import { rbModToS, rbObjSingletonClass } from "@blazetrails/ruby-compat";
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

  it("renders a singleton class as rb_mod_to_s's singleton arm, not the seat it inherits", () => {
    const job = new Base();
    const singleton = rbObjSingletonClass(job);
    expect(`${singleton}`).toMatch(/^#<Class:#<ActiveJob::Base:0x[0-9a-f]+>>$/);
    expect(String(singleton)).toBe(rbModToS(singleton));
  });

  it("agrees with rbModToS for every seated class", () => {
    const seated = (
      Object.values({ ...ActiveSupportExports, ...ActiveJobExports }) as unknown[]
    ).filter(
      (v): v is abstract new (...args: never) => unknown =>
        typeof v === "function" && Object.hasOwn(v, "toString"),
    );
    expect(seated).toContain(Base);
    expect(seated).toContain(ActiveSupportExports.Duration);
    for (const klass of seated) expect(String(klass)).toBe(rbModToS(klass));
  });
});
