import { BroadcastLogger, Logger } from "@blazetrails/activesupport";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { env, setEnv } from "@blazetrails/ruby-compat";
import { Handler, MockRequest, type RackApp, type RackEnv } from "@blazetrails/rack";
import { Trails, _resetTrailsEnv } from "../rails.js";
import { Application } from "../application.js";
import { DetailsKey } from "@blazetrails/actionview";
import type { BuildViewsResult, WatchViewsOptions } from "@blazetrails/trails-tsc";

const devServerStarts = vi.hoisted(() => [] as unknown[]);

vi.mock("../command/actions.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../command/actions.js")>()),
  requireApplicationBang: async () => {},
}));
const devServerLoads = vi.hoisted(() => [] as string[]);
vi.mock(
  "../server/dev-server.js",
  () => (
    devServerLoads.push("dev-server"),
    {
      DevServer: class {
        constructor(options: unknown) {
          devServerStarts.push(options);
        }
        async start(): Promise<void> {}
      },
    }
  ),
);

const viewWatches = vi.hoisted(() => [] as WatchViewsOptions[]);
const watchState = vi.hoisted(() => ({ initialError: null as Error | null, closed: 0 }));
vi.mock("@blazetrails/trails-tsc", () => ({
  watchViews: async (opts: WatchViewsOptions) => {
    viewWatches.push(opts);
    if (watchState.initialError) opts.onError!(watchState.initialError);
    return {
      close() {
        watchState.closed++;
      },
    };
  },
}));

const { ServerCommand } = await import("./server.js");

const run = (...args: string[]): Promise<void> => ServerCommand.perform("server", args, {});

describe("trails server environment (trails)", () => {
  let tmpDir: string;
  let origCwd: string;
  let savedTrailsEnv: string | undefined;
  let savedNodeEnv: string | undefined;
  let runOptions: Array<Record<string, unknown>>;
  let runApps: RackApp[];
  let said: string[];

  beforeEach(() => {
    said = [];
    origCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-server-env-"));
    fs.writeFileSync(path.join(tmpDir, "vite.config.ts"), "export default {};\n");
    process.chdir(tmpDir);
    savedTrailsEnv = env.TRAILS_ENV;
    savedNodeEnv = env.NODE_ENV;
    setEnv("TRAILS_ENV", undefined);
    setEnv("NODE_ENV", undefined);
    _resetTrailsEnv();
    devServerStarts.length = 0;
    viewWatches.length = 0;
    watchState.initialError = null;
    watchState.closed = 0;
    runOptions = [];
    runApps = [];
    Trails.logger = new BroadcastLogger(new Logger(null));
    vi.spyOn(Trails, "initialize").mockResolvedValue({
      app: () => () => [200, {}, []],
      loadServer: async () => {},
    } as never);
    vi.spyOn(Handler.Node, "run").mockImplementation((async (
      app: RackApp,
      options: Record<string, unknown>,
    ) => {
      runApps.push(app);
      runOptions.push(options);
      return { once() {} };
    }) as never);
    vi.spyOn(Trails, "root").mockReturnValue(tmpDir);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(ServerCommand.prototype, "say").mockImplementation(((message: string) => {
      said.push(message);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    setEnv("TRAILS_ENV", savedTrailsEnv);
    setEnv("NODE_ENV", savedNodeEnv);
    _resetTrailsEnv();
  });

  it("serves production through the Node handler, not the dev server, with a vite.config.ts present", async () => {
    await run("-e", "production");

    expect(devServerStarts).toEqual([]);
    expect(devServerLoads).toEqual([]);
    expect(runOptions).toEqual([{ Port: 3000, Host: "0.0.0.0" }]);
    expect(env.TRAILS_ENV).toBe("production");
    expect(said[0]).toContain("application starting in production http://0.0.0.0:3000");
  });

  it("starts the dev server in development", async () => {
    await run();

    expect(runOptions).toEqual([]);
    expect(devServerStarts).toHaveLength(1);
    expect(env.TRAILS_ENV).toBe("development");
  });

  it("broadcasts the Trails logger to stdout in development only", async () => {
    await run();
    expect((Trails.logger as BroadcastLogger).broadcasts).toHaveLength(2);

    Trails.logger = new BroadcastLogger(new Logger(null));
    await run("-e", "production");
    expect((Trails.logger as BroadcastLogger).broadcasts).toHaveLength(1);
  });

  it("does not override an already-set TRAILS_ENV", async () => {
    setEnv("TRAILS_ENV", "test");

    await run("-e", "production");

    expect(env.TRAILS_ENV).toBe("test");
  });

  it("leaves an explicitly-empty TRAILS_ENV alone", async () => {
    setEnv("TRAILS_ENV", "");

    await run("-e", "production");

    expect(env.TRAILS_ENV).toBe("");
  });

  it("awaits the server blocks before it binds", async () => {
    const order: string[] = [];
    vi.spyOn(Trails, "initialize").mockResolvedValue({
      app: () => () => [200, {}, []],
      loadServer: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push("loadServer");
      },
    } as never);
    vi.mocked(Handler.Node.run).mockImplementation((async () => {
      order.push("run");
      return { once() {} };
    }) as never);

    await run("-e", "production");

    expect(order).toEqual(["loadServer", "run"]);
  });

  it("does not bind when a server block rejects", async () => {
    vi.spyOn(Trails, "initialize").mockResolvedValue({
      app: () => () => [200, {}, []],
      loadServer: async () => {
        throw new Error("no database");
      },
    } as never);

    await expect(run("-e", "production")).rejects.toThrow("no database");
    expect(runOptions).toEqual([]);
  });

  describe("serves the application, not its middleware stack", () => {
    let app: Application;

    beforeAll(async () => {
      await import("../__fixtures__/boot-app/config/application.js");
      Trails.application!.config.setRoot(
        new URL("../__fixtures__/boot-app", import.meta.url).pathname,
      );
      app = await Trails.initialize();
    }, 15_000);

    beforeEach(() => {
      vi.spyOn(Trails, "initialize").mockResolvedValue(app);
    });

    afterAll(() => {
      Trails.application = null;
      Application.appClass = null;
    });

    async function served(railsApp: RackApp): Promise<RackEnv> {
      const rackEnv = MockRequest.envFor("/up", { HTTP_ACCEPT: "*/*" });
      const [status] = await railsApp(rackEnv);
      expect(status).toBe(200);
      return rackEnv;
    }

    it("hands the Node handler Engine#call, which seeds the request env with env_config", async () => {
      await run("-e", "test");

      expect(runApps).toHaveLength(1);
      const rackEnv = await served(runApps[0]);
      expect(rackEnv["action_dispatch.key_generator"]).toBe(app.keyGenerator());
    });

    it("hands the dev server Engine#call, which seeds the request env with env_config", async () => {
      await run();

      expect(devServerStarts).toHaveLength(1);
      const rackEnv = await served((devServerStarts[0] as { app: RackApp }).app);
      expect(rackEnv["action_dispatch.key_generator"]).toBe(app.keyGenerator());
    });
  });

  function initializeWith(actionView: Record<string, unknown>, reloading: boolean): void {
    vi.spyOn(Trails, "initialize").mockResolvedValue({
      app: () => () => [200, {}, []],
      loadServer: async () => {},
      config: { actionView, isReloadingEnabled: () => reloading },
    } as never);
  }

  it("watches app/views when template caching is off", async () => {
    initializeWith({ cacheTemplateLoading: null }, true);
    await run("-e", "development");

    expect(viewWatches.map((o) => o.cwd)).toEqual([process.cwd()]);
  });

  it("loads templates once from the build when template caching is on", async () => {
    initializeWith({ cacheTemplateLoading: null }, false);
    await run("-e", "production");
    initializeWith({ cacheTemplateLoading: true }, true);
    await run("-e", "development");

    expect(viewWatches).toEqual([]);
  });

  it("refuses to boot when the initial view build fails", async () => {
    initializeWith({ cacheTemplateLoading: null }, true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    watchState.initialError = new Error("bad view");

    await expect(run("-e", "development")).rejects.toThrow("bad view");
    expect(watchState.closed).toBe(1);
    expect(devServerStarts).toEqual([]);
  });

  it("clears the template caches on a rebuild, not on the initial build", async () => {
    initializeWith({ cacheTemplateLoading: null }, true);
    await run("-e", "development");
    const clear = vi.spyOn(DetailsKey, "clear");

    viewWatches[0].onRebuild!({ kind: "initial", result: { count: 0 } as BuildViewsResult });
    expect(clear).not.toHaveBeenCalled();
    viewWatches[0].onRebuild!({
      kind: "change",
      trigger: "a.html.tse",
      result: { count: 1 } as BuildViewsResult,
    });
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
