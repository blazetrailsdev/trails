import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { env, setEnv } from "@blazetrails/ruby-compat";
import { Handler, MockRequest, type RackApp, type RackEnv } from "@blazetrails/rack";
import { Trails, _resetTrailsEnv } from "../rails.js";
import { Application } from "../application.js";

const devServerStarts = vi.hoisted(() => [] as unknown[]);

vi.mock("../command/actions.js", () => ({ requireApplicationBang: async () => {} }));
vi.mock("../server/dev-server.js", () => ({
  DevServer: class {
    constructor(options: unknown) {
      devServerStarts.push(options);
    }
    async start(): Promise<void> {}
  },
}));

const { serverCommand } = await import("./server.js");

describe("trails server environment (trails)", () => {
  let tmpDir: string;
  let origCwd: string;
  let savedTrailsEnv: string | undefined;
  let savedNodeEnv: string | undefined;
  let runOptions: Array<Record<string, unknown>>;
  let runApps: RackApp[];

  beforeEach(() => {
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
    runOptions = [];
    runApps = [];
    vi.spyOn(Trails, "initialize").mockResolvedValue({ app: () => () => [200, {}, []] } as never);
    vi.spyOn(Handler.Node, "run").mockImplementation((async (
      app: RackApp,
      options: Record<string, unknown>,
    ) => {
      runApps.push(app);
      runOptions.push(options);
      return { address: () => ({ port: options.Port }) };
    }) as never);
    vi.spyOn(console, "log").mockImplementation(() => {});
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
    await serverCommand().parseAsync(["-e", "production"], { from: "user" });

    expect(devServerStarts).toEqual([]);
    expect(runOptions).toEqual([{ Port: 3000, Host: "0.0.0.0" }]);
    expect(env.TRAILS_ENV).toBe("production");
    expect(console.log).toHaveBeenCalledWith(
      "=> Trails application starting in production on http://0.0.0.0:3000",
    );
  });

  it("starts the dev server in development", async () => {
    await serverCommand().parseAsync([], { from: "user" });

    expect(runOptions).toEqual([]);
    expect(devServerStarts).toHaveLength(1);
    expect(env.TRAILS_ENV).toBe("development");
  });

  it("does not override an already-set TRAILS_ENV", async () => {
    setEnv("TRAILS_ENV", "test");

    await serverCommand().parseAsync(["-e", "production"], { from: "user" });

    expect(env.TRAILS_ENV).toBe("test");
  });

  it("leaves an explicitly-empty TRAILS_ENV alone", async () => {
    setEnv("TRAILS_ENV", "");

    await serverCommand().parseAsync(["-e", "production"], { from: "user" });

    expect(env.TRAILS_ENV).toBe("");
  });

  describe("serves the application, not its middleware stack", () => {
    class ServedApp extends Application {}
    let app: ServedApp;

    beforeEach(() => {
      app = new ServedApp();
      app.config.secretKeyBase = "b3c631c314c0bbca50c1b2843150fe33";
      vi.spyOn(Trails, "initialize").mockResolvedValue(app);
    });

    async function served(railsApp: RackApp): Promise<RackEnv> {
      const env = MockRequest.envFor("/posts");
      await railsApp(env).catch(() => {});
      return env;
    }

    it("hands the Node handler Engine#call, which seeds the request env with env_config", async () => {
      await serverCommand().parseAsync(["-e", "production"], { from: "user" });

      expect(runApps).toHaveLength(1);
      const env = await served(runApps[0]);
      expect(env["action_dispatch.key_generator"]).toBe(app.keyGenerator());
    });

    it("hands the dev server Engine#call, which seeds the request env with env_config", async () => {
      await serverCommand().parseAsync([], { from: "user" });

      expect(devServerStarts).toHaveLength(1);
      const env = await served((devServerStarts[0] as { app: RackApp }).app);
      expect(env["action_dispatch.key_generator"]).toBe(app.keyGenerator());
    });
  });
});
