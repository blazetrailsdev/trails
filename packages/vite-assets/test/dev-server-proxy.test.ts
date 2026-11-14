import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { Proxy } from "@blazetrails/rack-proxy";
import { Session } from "@blazetrails/rack-test";
import { beforeEach, describe, expect, it } from "vitest";
import { DevServerProxy } from "../lib/dev-server-proxy.js";
import { ViteAssets } from "../lib/vite-assets.js";
import { refreshConfig, withDevServerRunning } from "./support/test-helper.js";

describe("DevServerProxyTest", () => {
  let session: Session | undefined;

  function app(): DevServerProxy {
    const captureApp: RackApp = async (env: RackEnv): Promise<RackResponse> => [
      200,
      { "Content-Type": "application/json" },
      [JSON.stringify(env, (k, v: unknown) => (k === "rack.backend" ? String(v) : v))],
    ];
    Proxy.prototype.performRequest = (env) => captureApp(env);

    return new DevServerProxy(captureApp);
  }

  beforeEach(async () => {
    await refreshConfig();
    session = undefined;
  });

  const currentSession = () => (session ??= new Session(app() as unknown as RackApp));
  const get = (uri: string) => currentSession().get(uri);
  const header = (name: string, value: string) => currentSession().header(name, value);
  const lastResponse = () => currentSession().lastResponse();
  const getWithDevServerRunning = (uri: string) => withDevServerRunning(() => get(uri));

  function assertNotForwarded(): void {
    expect(lastResponse().isOk).toBe(true);
    const env = JSON.parse(lastResponse().body);

    expect(env["HTTP_X_FORWARDED_HOST"]).toBeUndefined();
    expect(env["HTTP_X_FORWARDED_PORT"]).toBeUndefined();
  }

  async function assertForwarded({ to = null }: { to?: string | null } = {}): Promise<void> {
    expect(lastResponse().isOk).toBe(true);
    const env = JSON.parse(lastResponse().body);
    const config = await ViteAssets.config();

    expect(env["HTTP_X_FORWARDED_HOST"]).toBe(config.host);
    expect(Number.parseInt(env["HTTP_X_FORWARDED_PORT"], 10)).toBe(config.port);

    if (to == null) return;

    const [path, query] = to.split("?");

    expect(env["PATH_INFO"]).toBe(path);
    expect(String(env["QUERY_STRING"] ?? "")).toBe(query ?? "");
    expect(env["REQUEST_URI"]).toBe(to);
  }

  it("non asset", async () => {
    await getWithDevServerRunning("/");

    assertNotForwarded();
  });

  it("non vite asset", async () => {
    await getWithDevServerRunning("/fake_import.js");

    assertNotForwarded();
  });

  it("vite asset", async () => {
    await getWithDevServerRunning("/vite-production/application.js");

    await assertForwarded({ to: "/vite-production/application.js" });
  });

  it("forwards to configured backend", async () => {
    await getWithDevServerRunning("/vite-production/application.js");

    const env = JSON.parse(lastResponse().body);

    expect(env["rack.backend"]).toBe((await ViteAssets.config()).origin());
  });

  it("vite client", async () => {
    await getWithDevServerRunning("/@vite/client");

    assertNotForwarded();
  });

  it("vite client with empty prefix", async () => {
    await refreshConfig({ publicOutputDir: "" });
    await getWithDevServerRunning("/@vite/client");

    await assertForwarded({ to: "/@vite/client" });
  });

  it("vite import", async () => {
    await getWithDevServerRunning(
      "/@fs//package/example/app/frontend/App.vue?import&t=1611322300214&vue&type=style&index=0&lang.css",
    );

    assertNotForwarded();
  });

  it("vite import with empty prefix", async () => {
    await refreshConfig({ publicOutputDir: "" });
    await getWithDevServerRunning(
      "/@fs//package/example/app/frontend/App.vue?import&t=1611322300214&vue&type=style&index=0&lang.css",
    );

    await assertForwarded({
      to: "/@fs//package/example/app/frontend/App.vue?import&t=1611322300214&vue&type=style&index=0&lang.css",
    });
  });

  it("hmr for stylesheet", async () => {
    await getWithDevServerRunning("/entrypoints/colored.css?t=1611322562923");

    await assertForwarded({ to: "/entrypoints/colored.css?t=1611322562923" });
  });

  it("hmr for imported entrypoint", async () => {
    await getWithDevServerRunning("/entrypoints/colored.css?import&t=1611322562923");

    await assertForwarded({ to: "/entrypoints/colored.css?import&t=1611322562923" });
  });

  it("entrypoint imported from entrypoint", async () => {
    header("Referer", "http://localhost:3000/vite-production/application.js");
    await getWithDevServerRunning("/entrypoints/example_import.js");

    await assertForwarded({ to: "/entrypoints/example_import.js" });
  });

  it("scss with extra css", async () => {
    await getWithDevServerRunning("/vite-production/entrypoints/sassy.scss.css");

    await assertForwarded({ to: "/vite-production/entrypoints/sassy.scss" });
  });

  it("stylus with extra css", async () => {
    await getWithDevServerRunning("/vite-production/entrypoints/sassy.stylus.css");

    await assertForwarded({ to: "/vite-production/entrypoints/sassy.stylus" });
  });

  it("min css", async () => {
    await getWithDevServerRunning("/vite-production/colored.min.css");

    await assertForwarded({ to: "/vite-production/colored.min.css" });
  });

  it("module css", async () => {
    await getWithDevServerRunning("/vite-production/colored.module.css");

    await assertForwarded({ to: "/vite-production/colored.module.css" });
  });

  it("random extension css", async () => {
    await getWithDevServerRunning("/vite-production/colored.bubble.css");

    await assertForwarded({ to: "/vite-production/colored.bubble.css" });
  });

  it("without dev server running", async () => {
    await get("/vite-production/application.js");

    assertNotForwarded();

    await get("/entrypoints/colored.css?import&t=1611322562923");

    assertNotForwarded();

    header("Referer", "http://localhost:3000/vite-production/application.js");
    await get("/entrypoints/example_import.js");

    assertNotForwarded();
  });

  it("empty public output dir", async () => {
    await refreshConfig({ publicOutputDir: "" });
    await getWithDevServerRunning("/");

    assertNotForwarded();

    await getWithDevServerRunning("/entrypoints/application.js");

    await assertForwarded({ to: "/entrypoints/application.js" });

    await getWithDevServerRunning("/entrypoints/sassy.scss.css");

    await assertForwarded({ to: "/entrypoints/sassy.scss" });
  });
});
