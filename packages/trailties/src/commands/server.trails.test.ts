import { BroadcastLogger, Logger } from "@blazetrails/activesupport";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { env, setEnv } from "@blazetrails/ruby-compat";
import { MockRequest, type RackEnv } from "@blazetrails/rack";
import { Handler } from "@blazetrails/rackup";
import { Builder } from "@blazetrails/rack";
import { Trails, _resetTrailsEnv } from "../trails.js";
import { Application } from "../application.js";

const devServerStarts = vi.hoisted(() => [] as unknown[]);

vi.mock("../command/actions.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../command/actions.js")>()),
  requireApplicationBang: async () => {},
}));
const devServerLoads = vi.hoisted(() => [] as string[]);
vi.mock("../server/dev-server.js", async () => {
  devServerLoads.push("dev-server");
  const { Handler } = await import("@blazetrails/rackup");
  class DevServer {
    static async run(app: unknown, options: object) {
      devServerStarts.push({ ...options, app });
      return { on() {} };
    }
  }
  Handler.register("vite", DevServer);
  return { DevServer };
});

vi.mock("@blazetrails/trails-tsc", () => ({ watchViews: async () => ({ close() {} }) }));

const { ServerCommand } = await import("./server.js");

const run = (...args: string[]): Promise<void> => ServerCommand.perform("server", args, {});

describe("trails server environment (trails)", () => {
  let tmpDir: string;
  let origCwd: string;
  let savedTrailsEnv: string | undefined;
  let savedNodeEnv: string | undefined;
  let runOptions: Array<Record<string, unknown>>;
  let runApps: Application[];
  let said: string[];

  beforeEach(() => {
    said = [];
    origCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-server-env-"));
    fs.writeFileSync(path.join(tmpDir, "vite.config.ts"), "export default {};\n");
    fs.writeFileSync(path.join(tmpDir, "config.ts"), "");
    process.chdir(tmpDir);
    savedTrailsEnv = env.TRAILS_ENV;
    savedNodeEnv = env.NODE_ENV;
    setEnv("TRAILS_ENV", undefined);
    setEnv("NODE_ENV", undefined);
    _resetTrailsEnv();
    devServerStarts.length = 0;
    runOptions = [];
    runApps = [];
    Trails.logger = new BroadcastLogger(new Logger(null));
    vi.spyOn(Trails, "initialize").mockResolvedValue({
      app: () => () => [200, {}, []],
      loadServer: async () => {},
    } as never);
    vi.spyOn(Handler.Node, "run").mockImplementation((async (
      app: Application,
      options: Record<string, unknown>,
    ) => {
      runApps.push(app);
      runOptions.push(options);
      return { on() {} };
    }) as never);
    vi.spyOn(Trails, "root").mockReturnValue(tmpDir);
    const aref = Handler.aref.bind(Handler);
    vi.spyOn(Handler, "aref").mockImplementation((name: string) =>
      name === "vite" && !Trails.env["development?"]() ? null : aref(name),
    );
    vi.spyOn(Builder, "parseFile").mockImplementation((async () => {
      const app = await Trails.initialize();
      await app.loadServer();
      return app;
    }) as never);
    vi.spyOn(Trails, "application", "get").mockReturnValue({
      root: () => tmpDir,
      config: { root: tmpDir },
    } as never);
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
    expect(runOptions).toEqual([expect.objectContaining({ Port: 3000, Host: "0.0.0.0" })]);
    expect(env.TRAILS_ENV).toBe("production");
    expect(said[0]).toContain("application starting in production http://0.0.0.0:3000");
  });

  it("starts the dev server in development", async () => {
    await run();

    expect(runOptions).toEqual([]);
    expect(devServerStarts).toHaveLength(1);
    expect(env.TRAILS_ENV).toBe("development");
  });

  it("serves development through the Node handler under -u node", async () => {
    await run("-u", "node");

    expect(devServerStarts).toEqual([]);
    expect(runOptions).toEqual([expect.objectContaining({ Port: 3000, Host: "localhost" })]);
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
      return { on() {} };
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
      vi.spyOn(Trails, "application", "get").mockReturnValue(app as never);
      vi.spyOn(app, "root").mockReturnValue(tmpDir);
    });

    afterAll(() => {
      Trails.application = null;
      Application.appClass = null;
    });

    async function served(trailsApp: Application): Promise<RackEnv> {
      const rackEnv = MockRequest.envFor("/up", { HTTP_ACCEPT: "*/*" });
      const [status] = await trailsApp.call(rackEnv);
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
      const rackEnv = await served((devServerStarts[0] as { app: Application }).app);
      expect(rackEnv["action_dispatch.key_generator"]).toBe(app.keyGenerator());
    });
  });
});
