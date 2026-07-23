/**
 * TS-only coverage for `Type.adapterNameFrom`, which Rails exercises only
 * indirectly (`current_adapter_name` is private and every Ruby test runs with a
 * configured connection). Rails reads `model.connection_db_config.adapter`, so
 * the configured adapter must win without a live connection.
 */
import { describe, it, expect } from "vitest";
import { adapterNameFrom } from "./type.js";

describe("Type.adapterNameFrom", () => {
  it("resolves from the db config without a live connection", () => {
    expect(adapterNameFrom({ connectionDbConfig: () => ({ adapter: "postgresql" }) })).toBe(
      "postgres",
    );
    expect(adapterNameFrom({ connectionDbConfig: () => ({ adapter: "mysql2" }) })).toBe("mysql");
    expect(adapterNameFrom({ connectionDbConfig: () => ({ adapter: "sqlite3" }) })).toBe("sqlite");
  });

  it("prefers the db config over the live connection", () => {
    expect(
      adapterNameFrom({
        connectionDbConfig: () => ({ adapter: "postgresql" }),
        connection: { adapterName: "sqlite" },
      }),
    ).toBe("postgres");
  });

  it("falls back to the live connection when no config is resolvable", () => {
    expect(
      adapterNameFrom({
        connectionDbConfig: () => {
          throw new Error("no pool");
        },
        connection: { adapterName: "mysql" },
      }),
    ).toBe("mysql");
    expect(adapterNameFrom({ connection: { adapterName: "postgres" } })).toBe("postgres");
    // DatabaseConfig#adapter is `string | undefined`; an adapter-less config is
    // no more informative than no config at all.
    expect(
      adapterNameFrom({
        connectionDbConfig: () => ({}),
        connection: { adapterName: "postgres" },
      }),
    ).toBe("postgres");
    expect(adapterNameFrom({})).toBe("sqlite");
  });
});
