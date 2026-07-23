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
import { Type, StringType } from "@blazetrails/activemodel";
import "./connection-adapters/mysql2-adapter.js";

class GenericType extends Type<unknown> {
  readonly name: string = "generic";
  cast(value: unknown) {
    return value;
  }
}

class AdapterType extends GenericType {
  override readonly name: string = "adapter_specific";
}

function modelWith(adapter: string | undefined) {
  return { connectionDbConfig: () => (adapter === undefined ? undefined : { adapter }) };
}

describe("Type.currentAdapterName", () => {
  it("resolves through Base", () => {
    expect(currentAdapterName()).toBe(adapterNameFrom(Base));
  });

  it("normalizes the configured adapter to the registration namespace", () => {
    expect(adapterNameFrom(modelWith("postgresql"))).toBe("postgres");
    expect(adapterNameFrom(modelWith("mysql2"))).toBe("mysql");
    expect(adapterNameFrom(modelWith("sqlite3"))).toBe("sqlite");
  });

  it("falls back to sqlite when the model has no configuration", () => {
    expect(adapterNameFrom(modelWith(undefined))).toBe("sqlite");
    expect(
      adapterNameFrom({
        connectionDbConfig: () => {
          throw new Error("No database connection defined.");
        },
      }),
    ).toBe("sqlite");
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

  it("reaches the mysql2 adapter's own string registration", () => {
    setRegistry(oldRegistry);
    stubAdapter("mysql2");

    const type = lookup("string");
    expect(type).toBeInstanceOf(StringType);
    expect(type.cast(true)).toBe("1");
    expect(type.cast(false)).toBe("0");
  });

  it("leaves the generic registration in place under sqlite", () => {
    register("foo", GenericType, { override: false });
    register("foo", AdapterType, { adapter: "postgres" });

    stubAdapter("sqlite3");
    expect(lookup("foo")).toBeInstanceOf(GenericType);
    expect(lookup("foo")).not.toBeInstanceOf(AdapterType);
  });
});
