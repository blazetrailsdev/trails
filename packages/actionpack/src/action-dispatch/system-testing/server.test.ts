import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ViteDevServer } from "vite";
import { Server, vite } from "./server.js";

describe("ServerTest", () => {
  let oldVitestServer: ViteDevServer | undefined;

  beforeEach(() => {
    oldVitestServer = vite.server;
    vite.app = async () => [200, {}, ["ok"]];
  });

  afterEach(async () => {
    if (vite.server !== oldVitestServer) await vite.server?.close();
    vite.server = oldVitestServer;
    vite.url = undefined;
  });

  it("port is always included", async () => {
    await new Server().run();
    expect(vite.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  });

  it("server is changed from `default` to `puma`", async () => {
    vite.server = undefined;
    Server.silencePuma = true;
    try {
      await new Server().run();
    } finally {
      Server.silencePuma = false;
    }
    expect(vite.server).not.toBeUndefined();
    expect(vite.server!.config.logLevel).toBe("silent");
    const response = await fetch(vite.url!);
    expect(await response.text()).toBe("ok");
  });

  it("server is not changed to `puma` when is different than default", async () => {
    const webrick = { resolvedUrls: { local: ["http://127.0.0.1:3000/"] } } as ViteDevServer;
    vite.server = webrick;
    await new Server().run();
    expect(vite.server).toBe(webrick);
    vite.server = oldVitestServer;
  });
});
