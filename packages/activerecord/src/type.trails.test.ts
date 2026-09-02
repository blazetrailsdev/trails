import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  register,
  lookup,
  registry,
  currentAdapterName,
  adapterNameFrom,
  AdapterSpecificRegistry,
} from "./type.js";
import { Base } from "./base.js";
import { ConnectionNotDefined } from "./errors.js";
import { Type, StringType } from "@blazetrails/activemodel";
import "./connection-adapters/mysql2-adapter.js";
import "./connection-adapters/postgresql/type-map-init.js";
import { Bytea } from "./connection-adapters/postgresql/oid/bytea.js";
import { Date as OidDate } from "./connection-adapters/postgresql/oid/date.js";
import { DateTime as OidDateTime } from "./connection-adapters/postgresql/oid/date-time.js";
import { Decimal as OidDecimal } from "./connection-adapters/postgresql/oid/decimal.js";
import { Interval } from "./connection-adapters/postgresql/oid/interval.js";
import { Money } from "./connection-adapters/postgresql/oid/money.js";
import { Uuid } from "./connection-adapters/postgresql/oid/uuid.js";

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
    expect(adapterNameFrom(modelWith("postgresql"))).toBe("postgresql");
    expect(adapterNameFrom(modelWith("mysql2"))).toBe("mysql2");
    expect(adapterNameFrom(modelWith("sqlite3"))).toBe("sqlite3");
  });

  it("falls back to sqlite when the model has no configuration", () => {
    expect(adapterNameFrom(modelWith(undefined))).toBe("sqlite3");
    expect(
      adapterNameFrom({
        connectionDbConfig: () => {
          throw new ConnectionNotDefined("No database connection defined.");
        },
      }),
    ).toBe("sqlite3");
  });

  it("propagates errors other than a missing connection", () => {
    expect(() =>
      adapterNameFrom({
        connectionDbConfig: () => {
          throw new TypeError("boom");
        },
      }),
    ).toThrow(TypeError);
  });
});

describe("Type.lookup under a non-sqlite configuration", () => {
  let oldRegistry: AdapterSpecificRegistry;
  let oldDbConfig: unknown;

  beforeEach(() => {
    oldRegistry = registry();
    registry(new AdapterSpecificRegistry());
    oldDbConfig = (Base as unknown as { connectionDbConfig: unknown }).connectionDbConfig;
  });

  afterEach(() => {
    registry(oldRegistry);
    (Base as unknown as { connectionDbConfig: unknown }).connectionDbConfig = oldDbConfig;
  });

  function stubAdapter(adapter: string): void {
    (Base as unknown as { connectionDbConfig: () => { adapter: string } }).connectionDbConfig =
      () => ({ adapter });
  }

  it("picks the postgres registration", () => {
    register("foo", GenericType, { override: false });
    register("foo", AdapterType, { adapter: "postgresql" });

    stubAdapter("postgresql");
    expect(lookup("foo")).toBeInstanceOf(AdapterType);
  });

  it("picks the mysql registration for a mysql2 configuration", () => {
    register("foo", GenericType, { override: false });
    register("foo", AdapterType, { adapter: "mysql2" });

    stubAdapter("mysql2");
    expect(lookup("foo")).toBeInstanceOf(AdapterType);
  });

  it("reaches the mysql2 adapter's own string registration", () => {
    registry(oldRegistry);
    stubAdapter("mysql2");

    const type = lookup("string");
    expect(type).toBeInstanceOf(StringType);
    expect(type.cast(true)).toBe("1");
    expect(type.cast(false)).toBe("0");
  });

  it("leaves the generic registration in place under sqlite", () => {
    register("foo", GenericType, { override: false });
    register("foo", AdapterType, { adapter: "postgresql" });

    stubAdapter("sqlite3");
    expect(lookup("foo")).toBeInstanceOf(GenericType);
    expect(lookup("foo")).not.toBeInstanceOf(AdapterType);
  });
});

describe("the PostgreSQL OID registrations", () => {
  it("resolve only under a postgres adapter", () => {
    expect(lookup("money", { adapter: "postgresql" })).toBeInstanceOf(Money);
    expect(lookup("interval", { adapter: "postgresql" })).toBeInstanceOf(Interval);
    expect(lookup("uuid", { adapter: "postgresql" })).toBeInstanceOf(Uuid);

    expect(() => lookup("money", { adapter: "sqlite3" })).toThrow("Unknown type :money");
    expect(() => lookup("interval", { adapter: "mysql2" })).toThrow("Unknown type :interval");
  });

  it("shadow the generic registrations of the same name under postgres", () => {
    expect(lookup("date", { adapter: "postgresql" })).toBeInstanceOf(OidDate);
    expect(lookup("date", { adapter: "sqlite3" })).not.toBeInstanceOf(OidDate);

    expect(lookup("binary", { adapter: "postgresql" })).toBeInstanceOf(Bytea);
    expect(lookup("binary", { adapter: "sqlite3" })).not.toBeInstanceOf(Bytea);

    expect(lookup("datetime", { adapter: "postgresql" })).toBeInstanceOf(OidDateTime);
    expect(lookup("decimal", { adapter: "postgresql" })).toBeInstanceOf(OidDecimal);
  });

  it("cover every type Rails registers for the postgresql adapter", () => {
    for (const name of [
      "bit",
      "bit_varying",
      "binary",
      "cidr",
      "date",
      "datetime",
      "decimal",
      "enum",
      "hstore",
      "inet",
      "interval",
      "jsonb",
      "money",
      "point",
      "legacy_point",
      "uuid",
      "vector",
      "xml",
    ]) {
      expect(() => lookup(name, { adapter: "postgresql" })).not.toThrow();
    }
  });

  it("resolve for a model carrying a directly-assigned postgres adapter", () => {
    const model = {
      _adapter: { typeRegistryKey: "postgresql" as const },
      connectionDbConfig: () => {
        throw new ConnectionNotDefined("No database connection defined.");
      },
    };
    expect(adapterNameFrom(model)).toBe("postgresql");
    expect(lookup("interval", { adapter: adapterNameFrom(model) })).toBeInstanceOf(Interval);
  });
});

describe("attribute() resolves through the declaring model's adapter", () => {
  const originalConnectionDbConfig = (Base as unknown as { connectionDbConfig: unknown })
    .connectionDbConfig;

  afterEach(() => {
    (Base as unknown as { connectionDbConfig: unknown }).connectionDbConfig =
      originalConnectionDbConfig;
  });

  function modelForAdapter(adapter: string): typeof Base {
    class AdapterScoped extends Base {}
    (
      AdapterScoped as unknown as { connectionDbConfig: () => { adapter: string } }
    ).connectionDbConfig = () => ({ adapter });
    return AdapterScoped as unknown as typeof Base;
  }

  it("picks the mysql2 string registration for a mysql2 model", () => {
    const model = modelForAdapter("mysql2");
    model.attribute("mystring", "string");

    const type = model.resolveTypeName("string");
    expect(type.cast(true)).toBe("1");
    expect(model._defaultAttributes().getAttribute("mystring").type.cast(true)).toBe("1");
  });

  it("leaves a sqlite3 model on the generic string registration", () => {
    const model = modelForAdapter("sqlite3");
    model.attribute("mystring", "string");

    expect(model._defaultAttributes().getAttribute("mystring").type.cast(true)).toBe("t");
  });
});
