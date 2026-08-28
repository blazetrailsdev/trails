import { describe, expect, it } from "vitest";

import { buildAdapterArg } from "./adapter-args.js";
import { Mysql2Adapter } from "./mysql2-adapter.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

function mysqlPoolConfig(config: Record<string, unknown>): Record<string, unknown> {
  const adapter = new Mysql2Adapter({ ...config, _fakeConnection: true } as never);
  return (adapter as unknown as { _poolConfig: Record<string, unknown> })._poolConfig;
}

function pgClientOptions(config: Record<string, unknown>): Record<string, unknown> {
  const adapter = new PostgreSQLAdapter(config as never);
  return (adapter as unknown as { _pgClientOptions: Record<string, unknown> })._pgClientOptions;
}

const BASE = { host: "127.0.0.1", database: "d" };

describe.each([
  ["Mysql2Adapter", mysqlPoolConfig],
  ["PostgreSQLAdapter", pgClientOptions],
])("%s credential key", (_name, driverConfigFor) => {
  it("maps Rails' username onto the driver's user", () => {
    const driverConfig = driverConfigFor({ ...BASE, username: "rails" });
    expect(driverConfig.user).toBe("rails");
    expect(driverConfig).not.toHaveProperty("username");
  });

  it("passes an explicit user through untouched", () => {
    const driverConfig = driverConfigFor({ ...BASE, user: "driver" });
    expect(driverConfig.user).toBe("driver");
  });

  it("lets username overwrite an explicit user", () => {
    const driverConfig = driverConfigFor({ ...BASE, username: "rails", user: "driver" });
    expect(driverConfig.user).toBe("rails");
    expect(driverConfig).not.toHaveProperty("username");
  });

  it("maps a blank username, since Ruby treats an empty string as truthy", () => {
    const driverConfig = driverConfigFor({ ...BASE, username: "", user: "driver" });
    expect(driverConfig.user).toBe("");
    expect(driverConfig).not.toHaveProperty("username");
  });

  it("leaves an explicit user alone when username is false", () => {
    const driverConfig = driverConfigFor({ ...BASE, username: false, user: "driver" });
    expect(driverConfig.user).toBe("driver");
  });

  it("leaves user absent when neither key is given", () => {
    expect(driverConfigFor({ ...BASE })).not.toHaveProperty("user");
  });
});

describe("through buildAdapterArg (the connection-handling path)", () => {
  it("maps username to user for mysql2", () => {
    const [config] = buildAdapterArg("mysql2", {
      adapter: "mysql2",
      database: "d",
      username: "rails",
    }) as [Record<string, unknown>];
    expect(mysqlPoolConfig(config).user).toBe("rails");
  });

  it("maps username to user for postgresql", () => {
    const [config] = buildAdapterArg("postgresql", {
      adapter: "postgresql",
      database: "d",
      username: "rails",
    }) as [Record<string, unknown>];
    expect(pgClientOptions(config).user).toBe("rails");
  });

  it("lets username overwrite user end to end", () => {
    const [config] = buildAdapterArg("postgresql", {
      adapter: "postgresql",
      database: "d",
      username: "rails",
      user: "driver",
    }) as [Record<string, unknown>];
    expect(pgClientOptions(config).user).toBe("rails");
  });

  it("keeps an explicit user when username is false end to end", () => {
    const [config] = buildAdapterArg("mysql2", {
      adapter: "mysql2",
      database: "d",
      username: false,
      user: "driver",
    }) as [Record<string, unknown>];
    expect(mysqlPoolConfig(config).user).toBe("driver");
  });
});

describe("retained config", () => {
  it.each([
    [
      "Mysql2Adapter",
      (c: Record<string, unknown>) => new Mysql2Adapter({ ...c, _fakeConnection: true } as never),
    ],
    ["PostgreSQLAdapter", (c: Record<string, unknown>) => new PostgreSQLAdapter(c as never)],
  ])("%s keeps username in the config the driver mapping read from", (_name, build) => {
    const adapter = build({ ...BASE, username: "rails" });
    const config = (adapter as unknown as { _config: Record<string, unknown> })._config;
    expect(config.username).toBe("rails");
  });
});
