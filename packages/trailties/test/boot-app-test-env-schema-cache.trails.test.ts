import { afterEach, describe, expect, it, vi } from "vitest";
import { Base, SchemaReflection } from "@blazetrails/activerecord";
import { getFs, getPath } from "@blazetrails/ruby-compat/fs-adapter";
import { getOsAsync } from "@blazetrails/ruby-compat/os-adapter";
import { env, setEnv } from "@blazetrails/ruby-compat/process-adapter";
import { Application } from "../lib/application.js";
import { Trails, _resetTrailsEnv } from "../lib/trails.js";

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

    await import("./fixtures/boot-app/config/application.js");
    Trails.application!.config.setRoot(new URL("./fixtures/boot-app", import.meta.url).pathname);
    await Trails.initialize();

    expect(loadAllBang).not.toHaveBeenCalled();
  }, 15_000);
});
