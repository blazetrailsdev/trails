import { afterEach, describe, expect, it, vi } from "vitest";
import { Base, SchemaReflection } from "@blazetrails/activerecord";
import { env, getFs, getOsAsync, getPath, setEnv } from "@blazetrails/ruby-compat";
import { Application } from "./application.js";
import { Trails, _resetTrailsEnv } from "./rails.js";

describe("a booted app in the test env", () => {
  let savedEnv: string | undefined;
  let savedUrl: string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await Base.connectionHandler.clearAllConnectionsBang("all");
    setEnv("TRAILS_ENV", savedEnv);
    setEnv("DATABASE_URL", savedUrl);
    _resetTrailsEnv();
    Trails.application = null;
    Application.appClass = null;
  });

  it("leaves the schema cache cold for db:test:prepare", async () => {
    const dir = await getFs().mkdtemp!(`${(await getOsAsync()).tmpdir()}${getPath().sep}boot-app-`);
    savedEnv = env.TRAILS_ENV;
    savedUrl = env.DATABASE_URL;
    setEnv("TRAILS_ENV", "test");
    setEnv("DATABASE_URL", `sqlite3:${dir}/test.sqlite3`);
    _resetTrailsEnv();
    const loadAllBang = vi.spyOn(SchemaReflection.prototype, "loadAllBang");

    await import("./__fixtures__/boot-app/config/application.js");
    Trails.application!.config.setRoot(
      new URL("./__fixtures__/boot-app", import.meta.url).pathname,
    );
    await Trails.initialize();

    expect(loadAllBang).not.toHaveBeenCalled();
  }, 15_000);
});
