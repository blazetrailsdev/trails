import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { env, setEnv } from "@blazetrails/ruby-compat";
import { Handler } from "@blazetrails/rack";
import { Trails, _resetTrailsEnv } from "../rails.js";

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
    vi.spyOn(Trails, "initialize").mockResolvedValue({ app: () => () => [200, {}, []] } as never);
    vi.spyOn(Handler.Node, "run").mockImplementation((async (
      _app: unknown,
      options: Record<string, unknown>,
    ) => {
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
});
