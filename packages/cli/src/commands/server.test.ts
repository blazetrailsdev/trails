import { describe, it, expect } from "vitest";
import { DevServer } from "../server/dev-server.js";

describe("ServerCommand", () => {
  it("creates a dev server with defaults", () => {
    const server = new DevServer({ port: 3000, host: "127.0.0.1", cwd: "." });
    expect(server).toBeDefined();
  });

  it("starts and stops", async () => {
    const server = new DevServer({ port: 0, host: "127.0.0.1", cwd: "." });
    await server.start();
    server.stop();
  });
});
