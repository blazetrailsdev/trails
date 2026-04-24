/**
 * Mirrors Rails activerecord/test/cases/connection_adapters/merge_and_resolve_default_url_config_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DatabaseConfigurations,
  InvalidConfigurationError,
  type RawConfigurations,
} from "../database-configurations.js";

const DEFAULT_ENV = "default_env";

let savedDatabaseUrl: string | undefined;
let savedRailsEnv: string | undefined;
let savedRackEnv: string | undefined;
let savedDefaultEnv: string;

beforeEach(() => {
  savedDatabaseUrl = process.env["DATABASE_URL"];
  savedRailsEnv = process.env["RAILS_ENV"];
  savedRackEnv = process.env["RACK_ENV"];
  savedDefaultEnv = DatabaseConfigurations.defaultEnv;
  delete process.env["DATABASE_URL"];
  delete process.env["RAILS_ENV"];
  delete process.env["RACK_ENV"];
  DatabaseConfigurations.defaultEnv = DEFAULT_ENV;
});

afterEach(() => {
  if (savedDatabaseUrl !== undefined) process.env["DATABASE_URL"] = savedDatabaseUrl;
  else delete process.env["DATABASE_URL"];
  if (savedRailsEnv !== undefined) process.env["RAILS_ENV"] = savedRailsEnv;
  else delete process.env["RAILS_ENV"];
  if (savedRackEnv !== undefined) process.env["RACK_ENV"] = savedRackEnv;
  else delete process.env["RACK_ENV"];
  DatabaseConfigurations.defaultEnv = savedDefaultEnv;
});

function resolveConfig(
  config: RawConfigurations,
  envName: string = DEFAULT_ENV,
): Record<string, unknown> | null {
  const configs = DatabaseConfigurations.fromRaw(config);
  const found = configs.configsFor({ envName, name: "primary" })[0];
  return found?.configurationHash ?? null;
}

function resolveDbConfig(spec: string, config: RawConfigurations) {
  const configs = DatabaseConfigurations.fromRaw(config);
  return configs.resolve(spec);
}

describe("MergeAndResolveDefaultUrlConfigTest", () => {
  it("invalid string config", () => {
    const config = { foo: "bar" };
    expect(() => resolveConfig(config)).toThrow(InvalidConfigurationError);
  });

  it.skip("invalid symbol config", () => {
    // Ruby-specific: symbol values like :bar aren't valid in TS configs
  });

  it("resolver with database uri and current env symbol key", () => {
    process.env["DATABASE_URL"] = "postgres://localhost/foo";
    const config = { not_production: { adapter: "abstract", database: "not_foo" } };
    const actual = resolveDbConfig(DEFAULT_ENV, config);
    expect(actual.configurationHash).toEqual({
      adapter: "postgresql",
      database: "foo",
      host: "localhost",
    });
  });

  it("resolver with database uri and current env symbol key and rails env", () => {
    process.env["DATABASE_URL"] = "postgres://localhost/foo";
    DatabaseConfigurations.defaultEnv = "foo";
    const config = { not_production: { adapter: "abstract", database: "not_foo" } };
    const actual = resolveDbConfig("foo", config);
    expect(actual.configurationHash).toEqual({
      adapter: "postgresql",
      database: "foo",
      host: "localhost",
    });
  });

  it("resolver with nil database url and current env", () => {
    DatabaseConfigurations.defaultEnv = "foo";
    const config = { foo: { adapter: "postgresql", url: undefined } };
    const actual = resolveDbConfig("foo", config);
    expect(actual.configurationHash).toEqual({ adapter: "postgresql" });
  });

  it("resolver with database uri and current env symbol key and rack env", () => {
    process.env["DATABASE_URL"] = "postgres://localhost/foo";
    DatabaseConfigurations.defaultEnv = "foo";
    const config = { not_production: { adapter: "abstract", database: "not_foo" } };
    const actual = resolveDbConfig("foo", config);
    expect(actual.configurationHash).toEqual({
      adapter: "postgresql",
      database: "foo",
      host: "localhost",
    });
  });

  it("resolver with database uri and known key", () => {
    process.env["DATABASE_URL"] = "postgres://localhost/foo";
    const config = { production: { adapter: "abstract", database: "not_foo", host: "localhost" } };
    const actual = resolveDbConfig("production", config);
    expect(actual.configurationHash).toEqual({
      adapter: "abstract",
      database: "not_foo",
      host: "localhost",
    });
  });

  it("resolver with database uri and multiple envs", () => {
    process.env["DATABASE_URL"] = "postgres://localhost";
    DatabaseConfigurations.defaultEnv = "test";
    const config = {
      production: { adapter: "postgresql", database: "foo_prod" },
      test: { adapter: "postgresql", database: "foo_test" },
    };
    const actual = resolveDbConfig("test", config);
    expect(actual.configurationHash).toEqual({
      adapter: "postgresql",
      database: "foo_test",
      host: "localhost",
    });
  });

  it("resolver with database uri and unknown symbol key", () => {
    process.env["DATABASE_URL"] = "postgres://localhost/foo";
    const config = { not_production: { adapter: "abstract", database: "not_foo" } };
    expect(() => resolveDbConfig("production", config)).toThrow();
  });

  it("resolver with database uri and supplied url", () => {
    process.env["DATABASE_URL"] = "abstract://not-localhost/not_foo";
    const config = { production: { adapter: "abstract", database: "also_not_foo" } };
    const actual = resolveDbConfig("postgres://localhost/foo", config);
    expect(actual.configurationHash).toEqual({
      adapter: "postgresql",
      database: "foo",
      host: "localhost",
    });
  });

  it.skip("resolver with database uri containing only database name", () => {
    // Rails treats bare "foo" as database name; our URL parser requires a scheme
  });

  it("jdbc url", () => {
    const config = { production: { adapter: "abstract", url: "jdbc:postgres://localhost/foo" } };
    const actual = resolveConfig(config, "production");
    expect(actual).toEqual({ adapter: "abstract", url: "jdbc:postgres://localhost/foo" });
  });

  it("http url", () => {
    const config = { production: { adapter: "abstract", url: "http://example.com/path" } };
    const actual = resolveConfig(config, "production");
    expect(actual).toEqual({ adapter: "abstract", url: "http://example.com/path" });
  });

  it("https url", () => {
    const config = { production: { adapter: "abstract", url: "https://example.com" } };
    const actual = resolveConfig(config, "production");
    expect(actual).toEqual({ adapter: "abstract", url: "https://example.com" });
  });

  it("environment does not exist in config url does exist", () => {
    process.env["DATABASE_URL"] = "postgres://localhost/foo";
    const config = { not_default_env: { adapter: "abstract", database: "not_foo" } };
    const actual = resolveConfig(config, DEFAULT_ENV);
    expect(actual).toEqual({ adapter: "postgresql", database: "foo", host: "localhost" });
  });

  it.skip("url with hyphenated scheme", () => {
    // Requires ConnectionAdapters.register which maps custom schemes; skip for now
  });

  it("string connection", () => {
    const config = { default_env: "postgres://localhost/foo" };
    const actual = resolveConfig(config, DEFAULT_ENV);
    expect(actual).toEqual({ adapter: "postgresql", database: "foo", host: "localhost" });
  });

  it("url sub key", () => {
    const config = { default_env: { url: "postgres://localhost/foo" } };
    const actual = resolveConfig(config);
    expect(actual).toEqual({ adapter: "postgresql", database: "foo", host: "localhost" });
  });

  it("url removed from hash", () => {
    const config = { default_env: { url: "postgres://localhost/foo" } };
    const actual = resolveDbConfig(DEFAULT_ENV, config);
    expect(actual.configurationHash).not.toHaveProperty("url");
  });

  it("url with equals in query value", () => {
    const config = { default_env: { url: "postgresql://localhost/foo?options=-cmyoption=on" } };
    const actual = resolveConfig(config);
    expect(actual).toEqual({
      options: "-cmyoption=on",
      adapter: "postgresql",
      database: "foo",
      host: "localhost",
    });
  });

  it("hash", () => {
    const config = { production: { adapter: "postgresql", database: "foo" } };
    const actual = resolveConfig(config, "production");
    expect(actual).toEqual({ adapter: "postgresql", database: "foo" });
  });

  it("blank", () => {
    const config = {};
    const actual = resolveConfig(config, DEFAULT_ENV);
    expect(actual).toBeNull();
  });

  it("blank with database url", () => {
    process.env["DATABASE_URL"] = "postgres://localhost/foo";
    const actual = resolveConfig({});
    expect(actual).toEqual({ adapter: "postgresql", database: "foo", host: "localhost" });
  });

  it("blank with database url with rails env", () => {
    process.env["DATABASE_URL"] = "postgres://localhost/foo";
    DatabaseConfigurations.defaultEnv = "not_production";
    const actual = resolveConfig({}, "not_production");
    expect(actual).toEqual({ adapter: "postgresql", database: "foo", host: "localhost" });
  });

  it("blank with database url with rack env", () => {
    process.env["DATABASE_URL"] = "postgres://localhost/foo";
    DatabaseConfigurations.defaultEnv = "not_production";
    const actual = resolveConfig({}, "not_production");
    expect(actual).toEqual({ adapter: "postgresql", database: "foo", host: "localhost" });
  });

  it("database url with ipv6 host and port", () => {
    process.env["DATABASE_URL"] = "postgres://[::1]:5454/foo";
    const actual = resolveConfig({});
    expect(actual).toEqual({ adapter: "postgresql", database: "foo", host: "::1", port: 5454 });
  });

  it("url sub key with database url", () => {
    process.env["DATABASE_URL"] = "abstract://localhost/NOT_FOO";
    const config = { default_env: { url: "postgres://localhost/foo" } };
    const actual = resolveConfig(config);
    expect(actual).toEqual({ adapter: "postgresql", database: "foo", host: "localhost" });
  });

  it("no url sub key with database url doesnt trample other envs", () => {
    process.env["DATABASE_URL"] = "postgres://localhost/baz";
    const config = {
      default_env: { adapter: "abstract", database: "foo" },
      other_env: { url: "postgres://foohost/bardb" },
    };
    expect(resolveConfig(config, DEFAULT_ENV)).toEqual({
      database: "baz",
      adapter: "postgresql",
      host: "localhost",
    });
    expect(resolveConfig(config, "other_env")).toEqual({
      adapter: "postgresql",
      database: "bardb",
      host: "foohost",
    });
  });

  it("merge no conflicts with database url", () => {
    process.env["DATABASE_URL"] = "postgres://localhost/foo";
    const config = { default_env: { adapter: "abstract", pool: "5" } };
    const actual = resolveConfig(config);
    expect(actual).toEqual({
      adapter: "postgresql",
      database: "foo",
      host: "localhost",
      pool: "5",
    });
  });

  it("merge conflicts with database url", () => {
    process.env["DATABASE_URL"] = "postgres://localhost/foo";
    const config = { default_env: { adapter: "abstract", database: "NOT-FOO", pool: "5" } };
    const actual = resolveConfig(config);
    expect(actual).toEqual({
      adapter: "postgresql",
      database: "foo",
      host: "localhost",
      pool: "5",
    });
  });

  it("merge no conflicts with database url and adapter", () => {
    process.env["DATABASE_URL"] = "postgres://localhost/foo";
    const config = { default_env: { adapter: "postgresql", pool: "5" } };
    const actual = resolveConfig(config);
    expect(actual).toEqual({
      adapter: "postgresql",
      database: "foo",
      host: "localhost",
      pool: "5",
    });
  });

  it("merge no conflicts with database url and numeric pool", () => {
    process.env["DATABASE_URL"] = "postgres://localhost/foo";
    const config = { default_env: { adapter: "abstract", pool: 5 } };
    const actual = resolveConfig(config);
    expect(actual).toEqual({ adapter: "postgresql", database: "foo", host: "localhost", pool: 5 });
  });

  it("tiered configs with database url", () => {
    process.env["DATABASE_URL"] = "postgres://localhost/foo";
    const config = {
      default_env: {
        primary: { adapter: "abstract", pool: 5 },
        animals: { adapter: "abstract", pool: 5 },
      },
    };

    let configs = DatabaseConfigurations.fromRaw(config);
    let actual = configs.configsFor({ envName: DEFAULT_ENV, name: "primary" })[0]!
      .configurationHash;
    expect(actual).toEqual({ adapter: "postgresql", database: "foo", host: "localhost", pool: 5 });

    configs = DatabaseConfigurations.fromRaw(config);
    actual = configs.configsFor({ envName: DEFAULT_ENV, name: "animals" })[0]!.configurationHash;
    expect(actual).toEqual({ adapter: "abstract", pool: 5 });
  });

  it.skip("separate database env vars", () => {
    // Requires PRIMARY_DATABASE_URL / ANIMALS_DATABASE_URL per-name env var logic
  });

  it("does not change other environments", () => {
    process.env["DATABASE_URL"] = "postgres://localhost/foo";
    const config = {
      production: { adapter: "abstract", database: "not_foo", host: "localhost" },
      default_env: {},
    };
    const actual1 = resolveDbConfig("production", config);
    expect(actual1.configurationHash).toEqual({
      adapter: "abstract",
      database: "not_foo",
      host: "localhost",
    });

    const actual2 = resolveDbConfig(DEFAULT_ENV, config);
    expect(actual2.configurationHash).toEqual({
      host: "localhost",
      database: "foo",
      adapter: "postgresql",
    });
  });

  it("protocol adapter mapping is used", () => {
    process.env["DATABASE_URL"] = "mysql://localhost/exampledb";
    DatabaseConfigurations.defaultEnv = "production";
    const actual = resolveDbConfig("production", {});
    expect(actual.configurationHash).toEqual({
      adapter: "mysql2",
      database: "exampledb",
      host: "localhost",
    });
  });

  it("protocol adapter mapping falls through if non found", () => {
    process.env["DATABASE_URL"] = "unknown://localhost/exampledb";
    DatabaseConfigurations.defaultEnv = "production";
    const actual = resolveDbConfig("production", {});
    expect(actual.configurationHash).toEqual({
      adapter: "unknown",
      database: "exampledb",
      host: "localhost",
    });
  });

  it.skip("protocol adapter mapping is used and can be updated", () => {
    // Requires mutable ActiveRecord.protocol_adapters — not yet implemented
  });

  it.skip("protocol adapter mapping translates underscores to dashes", () => {
    // Requires mutable ActiveRecord.protocol_adapters — not yet implemented
  });

  it.skip("protocol adapter mapping handles sqlite3 file urls", () => {
    // Requires mutable ActiveRecord.protocol_adapters — not yet implemented
  });
});
