/**
 * TS-only companions to type.test.ts: `Type.currentAdapterName()` resolves
 * through `ActiveRecord::Base` (type.rb:54-56), so a postgres/mysql
 * configuration must make adapter-scoped registrations the default lookup.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  register,
  lookup,
  registry,
  setRegistry,
  currentAdapterName,
  adapterNameFrom,
  AdapterSpecificRegistry,
} from "./type.js";
import { Base } from "./base.js";
import { Type } from "@blazetrails/activemodel";

class GenericType extends Type<unknown> {
  readonly name: string = "generic";
  cast(value: unknown) {
    return value;
  }
}

class AdapterType extends GenericType {
  override readonly name: string = "adapter_specific";
}

describe("Type.currentAdapterName", () => {
  let oldRegistry: AdapterSpecificRegistry;

  beforeEach(() => {
    oldRegistry = registry();
    setRegistry(new AdapterSpecificRegistry());
  });

  afterEach(() => {
    setRegistry(oldRegistry);
  });

  it("resolves through Base rather than a hardcoded default", () => {
    expect(currentAdapterName()).toBe(adapterNameFrom(Base));
  });

  it("normalizes the configured adapter to the registration namespace", () => {
    expect(adapterNameFrom({ connectionDbConfig: () => ({ adapter: "postgresql" }) })).toBe(
      "postgres",
    );
    expect(adapterNameFrom({ connectionDbConfig: () => ({ adapter: "mysql2" }) })).toBe("mysql");
    expect(adapterNameFrom({ connectionDbConfig: () => ({ adapter: "sqlite3" }) })).toBe("sqlite");
  });

  it("falls back to sqlite when the model has no configuration at all", () => {
    expect(adapterNameFrom({})).toBe("sqlite");
  });
});

describe("Type.lookup under a non-sqlite configuration", () => {
  let oldRegistry: AdapterSpecificRegistry;
  let oldDbConfig: unknown;

  beforeEach(() => {
    oldRegistry = registry();
    setRegistry(new AdapterSpecificRegistry());
    oldDbConfig = (Base as unknown as { connectionDbConfig: unknown }).connectionDbConfig;
  });

  afterEach(() => {
    setRegistry(oldRegistry);
    (Base as unknown as { connectionDbConfig: unknown }).connectionDbConfig = oldDbConfig;
  });

  function stubAdapter(adapter: string): void {
    (Base as unknown as { connectionDbConfig: () => { adapter: string } }).connectionDbConfig =
      () => ({ adapter });
  }

  it("picks the postgres registration", () => {
    register("foo", GenericType, { override: false });
    register("foo", AdapterType, { adapter: "postgres" });

    stubAdapter("postgresql");
    expect(lookup("foo")).toBeInstanceOf(AdapterType);
  });

  it("picks the mysql registration for a mysql2 configuration", () => {
    register("foo", GenericType, { override: false });
    register("foo", AdapterType, { adapter: "mysql" });

    stubAdapter("mysql2");
    expect(lookup("foo")).toBeInstanceOf(AdapterType);
  });

  it("leaves the generic registration in place under sqlite", () => {
    register("foo", GenericType, { override: false });
    register("foo", AdapterType, { adapter: "postgres" });

    stubAdapter("sqlite3");
    expect(lookup("foo")).toBeInstanceOf(GenericType);
    expect(lookup("foo")).not.toBeInstanceOf(AdapterType);
  });
});
