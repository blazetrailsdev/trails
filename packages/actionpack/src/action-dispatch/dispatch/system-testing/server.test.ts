import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ViteDevServer } from "vite";
import { assert, assertNotEqual } from "@blazetrails/activesupport";
import { Server, vite } from "../../system-testing/server.js";

describe("ServerTest", () => {
  let oldVitestServer: ViteDevServer | undefined;

  beforeEach(() => {
    oldVitestServer = vite.server;
    vite.app = { call: async () => [200, {}, ["ok"]] };
  });

  afterEach(async () => {
    if (vite.server !== oldVitestServer) await vite.server?.close();
    vite.server = oldVitestServer;
    vite.url = undefined;
  });

  it("port is always included", async () => {
    await new Server().run();
    assert(
      /^http:\/\/127\.0\.0\.1:\d+\/$/.test(vite.url!),
      "expected vite.url to include the port",
    );
  });

  it("server is changed from `default` to `puma`", async () => {
    vite.server = undefined;
    Server.silencePuma = true;
    try {
      await new Server().run();
    } finally {
      Server.silencePuma = false;
    }
    assertNotEqual(vite.server, undefined);
  });

  it("server is not changed to `puma` when is different than default", async () => {
    const webrick = { resolvedUrls: { local: ["http://127.0.0.1:3000/"] } } as ViteDevServer;
    vite.server = webrick;
    await new Server().run();
    expect(vite.server).toBe(webrick);
    vite.server = oldVitestServer;
  });
});
