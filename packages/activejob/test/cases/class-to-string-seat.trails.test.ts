import { describe, expect, it } from "vitest";
import * as ActiveSupportExports from "@blazetrails/activesupport";
import { Delegator, Duration, ExecutionWrapper, Executor } from "@blazetrails/activesupport";
import { rbModToS, rbObjSingletonClass } from "@blazetrails/ruby-compat";
import * as ActiveJobExports from "../../lib/index.js";
import { Base } from "../../lib/base.js";

describe("class-to-string-seat", () => {
  it("renders a namespaced class by its constant path", () => {
    expect(rbModToS(Base)).toBe("ActiveJob::Base");
    expect(rbModToS(Duration)).toBe("ActiveSupport::Duration");
  });

  it("renders a top-level class by its name", () => {
    expect(rbModToS(Delegator)).toBe("Delegator");
  });

  it("renders a subclass by its own path, not its parent's", () => {
    expect(rbModToS(ExecutionWrapper)).toBe("ActiveSupport::ExecutionWrapper");
    expect(rbModToS(Executor)).toBe("ActiveSupport::Executor");
  });

  it("renders a singleton class as rb_mod_to_s's singleton arm", () => {
    const singleton = rbObjSingletonClass(new Base());
    expect(rbModToS(singleton)).toMatch(/^#<Class:#<ActiveJob::Base:0x[0-9a-f]+>>$/);
  });

  it("seats no toString literal on any exported class", () => {
    const seated = Object.entries({ ...ActiveSupportExports, ...ActiveJobExports })
      .filter(([, v]) => typeof v === "function" && Object.hasOwn(v, "toString"))
      .map(([k]) => k);
    expect(seated).toEqual([]);
  });
});
