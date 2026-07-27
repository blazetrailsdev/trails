import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { register, lookup, registry, adapterNameFrom, AdapterSpecificRegistry } from "./type.js";
import { Base } from "./base.js";
import { Type } from "@blazetrails/activemodel";

class ArgType extends Type<unknown> {
  readonly name = "arg_type";
  readonly args: unknown;
  constructor(args?: unknown) {
    super();
    this.args = args;
  }
  cast(value: unknown) {
    return value;
  }
  override type() {
    return "arg_type";
  }
}

class PgArgType extends ArgType {
  override type() {
    return "pg_arg_type";
  }
}

describe("TypeTest", () => {
  let oldRegistry: AdapterSpecificRegistry;

  beforeEach(() => {
    oldRegistry = registry();
    registry(new AdapterSpecificRegistry());
  });

  afterEach(() => {
    registry(oldRegistry);
  });

  it("registering a new type", () => {
    register("foo", ArgType);
    expect(lookup("foo")).toBeInstanceOf(ArgType);
  });

  it("looking up a type for a specific adapter", () => {
    register("foo", ArgType, { override: false });
    register("foo", PgArgType, { adapter: "postgres" });

    expect(lookup("foo", { adapter: "sqlite" })).toBeInstanceOf(ArgType);
    expect(lookup("foo", { adapter: "postgres" })).toBeInstanceOf(PgArgType);
  });

  it("lookup defaults to the current adapter", () => {
    const currentAdapter = adapterNameFrom(Base);
    register("foo", ArgType, { override: false });
    register("foo", PgArgType, { adapter: currentAdapter });

    expect(lookup("foo")).toBeInstanceOf(PgArgType);
  });
});
