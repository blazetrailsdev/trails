import { afterEach, describe, expect, it, vi } from "vitest";
import { Base } from "@blazetrails/activerecord";
import { env, getFs, getOsAsync, getPath, setEnv, rbFLoad } from "@blazetrails/ruby-compat";
import { Application } from "../application.js";
import { createProgram } from "../cli.js";
import { Trails, _resetTrailsEnv } from "../rails.js";

describe("RoutesCommand", () => {
  let savedEnv: string | undefined;
  let savedUrl: string | undefined;

  async function boot(): Promise<void> {
    const fs = getFs();
    const dir = await fs.mkdtemp!(`${(await getOsAsync()).tmpdir()}${getPath().sep}boot-app-`);
    const database = `${dir}/development.sqlite3`;
    await Base.establishConnection({ adapter: "sqlite3", database });
    await rbFLoad(new URL("../__fixtures__/boot-app/db/schema.ts", import.meta.url).pathname);
    await Base.removeConnection();

    savedEnv = env.TRAILS_ENV;
    savedUrl = env.DATABASE_URL;
    setEnv("TRAILS_ENV", "development");
    setEnv("DATABASE_URL", `sqlite3:${database}`);
    _resetTrailsEnv();

    await import("../__fixtures__/boot-app/config/application.js");
    Trails.application!.config.setRoot(
      new URL("../__fixtures__/boot-app", import.meta.url).pathname,
    );
    await Trails.initialize();
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    await Base.connectionHandler.clearAllConnectionsBang("all");
    setEnv("TRAILS_ENV", savedEnv);
    setEnv("DATABASE_URL", savedUrl);
    _resetTrailsEnv();
    Trails.application = null;
    Application.appClass = null;
  });

  it("lists a booted app's routes before anything has drawn them", async () => {
    await boot();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await createProgram().parseAsync(["routes"], { from: "user" });
    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).not.toContain("You don't have any routes defined!");
    expect(output).toMatch(/posts GET\s+\/posts\(\.:format\)\s+posts#index/);
    expect(output).toMatch(/rails_health_check GET\s+\/up\(\.:format\)\s+rails\/health#show/);
  }, 15_000);
});
