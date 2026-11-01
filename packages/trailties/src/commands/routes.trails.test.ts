import { capture } from "@blazetrails/activesupport";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Base } from "@blazetrails/activerecord";
import { env, getFs, getOsAsync, getPath, setEnv, rbFLoad } from "@blazetrails/ruby-compat";
import { Application } from "../application.js";
import { invoke } from "../command.js";
import { Trails, _resetTrailsEnv } from "../rails.js";
import { lookupBang } from "../command/behavior.js";

await lookupBang();

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
    const output = await capture(":stdout", () => invoke("routes"));
    expect(output).not.toContain("You don't have any routes defined!");
    expect(output).toMatch(/posts GET\s+\/posts\(\.:format\)\s+posts#index/);
    expect(output).toMatch(/rails_health_check GET\s+\/up\(\.:format\)\s+rails\/health#show/);

    const controller = await capture(":stdout", () => invoke("routes", ["-c", "admin/users"]));
    expect(controller).toContain("admin/users#index");
    expect(controller).not.toContain("posts#index");
    const grep = await capture(":stdout", () => invoke("routes", ["-g", "legacy"]));
    expect(grep).toContain("legacy#index");
    expect(grep).not.toContain("posts#index");
    const expanded = await capture(":stdout", () => invoke("routes", ["-E"]));
    expect(expanded).toMatch(/--\[ Route 1 \]-/);
  }, 15_000);
});
