import { describe, expect, it } from "vitest";

import { buildAdapterArg } from "./adapter-args.js";
import { Mysql2Adapter } from "./mysql2-adapter.js";

function poolConfigVia(configuration: Record<string, unknown>): Record<string, unknown> {
  const [config] = buildAdapterArg("mysql2", {
    adapter: "mysql2",
    database: "d",
    ...configuration,
  }) as [Record<string, unknown>];
  const adapter = new Mysql2Adapter({ ...config, _fakeConnection: true } as never);
  return (adapter as unknown as { _poolConfig: Record<string, unknown> })._poolConfig;
}

describe("Mysql2Adapter socket key through buildAdapterArg", () => {
  it("maps Rails' socket onto the driver's socketPath", () => {
    const driverConfig = poolConfigVia({ socket: "/var/run/mysqld/mysqld.sock" });
    expect(driverConfig.socketPath).toBe("/var/run/mysqld/mysqld.sock");
    expect(driverConfig).not.toHaveProperty("socket");
  });

  it("passes an explicit socketPath through untouched", () => {
    const driverConfig = poolConfigVia({ socketPath: "/driver.sock" });
    expect(driverConfig.socketPath).toBe("/driver.sock");
  });

  it("lets socket overwrite an explicit socketPath", () => {
    const driverConfig = poolConfigVia({ socket: "/rails.sock", socketPath: "/driver.sock" });
    expect(driverConfig.socketPath).toBe("/rails.sock");
    expect(driverConfig).not.toHaveProperty("socket");
  });

  it("maps a blank socket, since Ruby treats an empty string as truthy", () => {
    const driverConfig = poolConfigVia({ socket: "", socketPath: "/driver.sock" });
    expect(driverConfig.socketPath).toBe("");
    expect(driverConfig).not.toHaveProperty("socket");
  });

  it("leaves an explicit socketPath alone when socket is false", () => {
    const driverConfig = poolConfigVia({ socket: false, socketPath: "/driver.sock" });
    expect(driverConfig.socketPath).toBe("/driver.sock");
  });

  it("leaves socketPath absent when neither key is given", () => {
    expect(poolConfigVia({})).not.toHaveProperty("socketPath");
  });

  it("keeps host absent so the socket is not shadowed by a TCP default", () => {
    const [config] = buildAdapterArg("mysql2", {
      adapter: "mysql2",
      database: "d",
      socket: "/var/run/mysqld/mysqld.sock",
    }) as [Record<string, unknown>];
    expect(config).not.toHaveProperty("host");
  });

  it("actually connects over the socket rather than falling back to TCP", async () => {
    const [config] = buildAdapterArg("mysql2", {
      adapter: "mysql2",
      database: "d",
      socket: "/nonexistent/trails-socket-key.sock",
    }) as [Record<string, unknown>];
    const adapter = new Mysql2Adapter(config as never);
    await expect(adapter.connect()).rejects.toThrow(
      "connect ENOENT /nonexistent/trails-socket-key.sock",
    );
  });
});
