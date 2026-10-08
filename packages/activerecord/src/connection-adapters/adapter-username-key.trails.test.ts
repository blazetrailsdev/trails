import { describe, expect, it, vi } from "vitest";
import mysql from "mysql2/promise";

import { Mysql2Adapter } from "./mysql2-adapter.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

async function mysqlPoolConfig(config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const createConnection = vi.spyOn(mysql, "createConnection").mockRejectedValue(new Error("stub"));
  try {
    await Mysql2Adapter.newClient(config as never).catch(() => {});
    return createConnection.mock.calls[0][0] as unknown as Record<string, unknown>;
  } finally {
    createConnection.mockRestore();
  }
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
  it("maps Rails' username onto the driver's user", async () => {
    const driverConfig = await driverConfigFor({ ...BASE, username: "rails" });
    expect(driverConfig.user).toBe("rails");
    expect(driverConfig).not.toHaveProperty("username");
  });

  it("passes an explicit user through untouched", async () => {
    const driverConfig = await driverConfigFor({ ...BASE, user: "driver" });
    expect(driverConfig.user).toBe("driver");
  });

  it("lets username overwrite an explicit user", async () => {
    const driverConfig = await driverConfigFor({ ...BASE, username: "rails", user: "driver" });
    expect(driverConfig.user).toBe("rails");
    expect(driverConfig).not.toHaveProperty("username");
  });

  it("maps a blank username, since Ruby treats an empty string as truthy", async () => {
    const driverConfig = await driverConfigFor({ ...BASE, username: "", user: "driver" });
    expect(driverConfig.user).toBe("");
    expect(driverConfig).not.toHaveProperty("username");
  });

  it("leaves an explicit user alone when username is false", async () => {
    const driverConfig = await driverConfigFor({ ...BASE, username: false, user: "driver" });
    expect(driverConfig.user).toBe("driver");
  });

  it("leaves user absent when neither key is given", async () => {
    expect(await driverConfigFor({ ...BASE })).not.toHaveProperty("user");
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
