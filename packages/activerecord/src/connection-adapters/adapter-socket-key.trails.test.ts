import { describe, expect, it, vi } from "vitest";
import mysql from "mysql2/promise";

import { Mysql2Adapter } from "./mysql2-adapter.js";

async function poolConfigVia(
  configuration: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const config = { adapter: "mysql2", database: "d", ...configuration };
  const createConnection = vi.spyOn(mysql, "createConnection").mockRejectedValue(new Error("stub"));
  try {
    await Mysql2Adapter.newClient(config as never).catch(() => {});
    return createConnection.mock.calls[0][0] as unknown as Record<string, unknown>;
  } finally {
    createConnection.mockRestore();
  }
}

describe("Mysql2Adapter socket key through buildAdapterArg", () => {
  it("maps Rails' socket onto the driver's socketPath", async () => {
    const driverConfig = await poolConfigVia({ socket: "/var/run/mysqld/mysqld.sock" });
    expect(driverConfig.socketPath).toBe("/var/run/mysqld/mysqld.sock");
    expect(driverConfig).not.toHaveProperty("socket");
  });

  it("passes an explicit socketPath through untouched", async () => {
    const driverConfig = await poolConfigVia({ socketPath: "/driver.sock" });
    expect(driverConfig.socketPath).toBe("/driver.sock");
  });

  it("lets socket overwrite an explicit socketPath", async () => {
    const driverConfig = await poolConfigVia({ socket: "/rails.sock", socketPath: "/driver.sock" });
    expect(driverConfig.socketPath).toBe("/rails.sock");
    expect(driverConfig).not.toHaveProperty("socket");
  });

  it("maps a blank socket, since Ruby treats an empty string as truthy", async () => {
    const driverConfig = await poolConfigVia({ socket: "", socketPath: "/driver.sock" });
    expect(driverConfig.socketPath).toBe("");
    expect(driverConfig).not.toHaveProperty("socket");
  });

  it("leaves an explicit socketPath alone when socket is false", async () => {
    const driverConfig = await poolConfigVia({ socket: false, socketPath: "/driver.sock" });
    expect(driverConfig.socketPath).toBe("/driver.sock");
  });

  it("leaves socketPath absent when neither key is given", async () => {
    expect(await poolConfigVia({})).not.toHaveProperty("socketPath");
  });

  it("actually connects over the socket rather than falling back to TCP", async () => {
    const adapter = new Mysql2Adapter({
      adapter: "mysql2",
      database: "d",
      socket: "/nonexistent/trails-socket-key.sock",
    } as never);
    await expect(adapter.connect()).rejects.toThrow(
      "connect ENOENT /nonexistent/trails-socket-key.sock",
    );
  });
});
