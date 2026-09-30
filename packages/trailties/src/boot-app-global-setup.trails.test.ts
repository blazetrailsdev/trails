import { afterEach, describe, expect, it, vi } from "vitest";
import { Base, Migration } from "@blazetrails/activerecord";
import { env, getFs, getOsAsync, getPath, setEnv } from "@blazetrails/ruby-compat";
import { Application } from "./application.js";
import { Trails, _resetTrailsEnv } from "./rails.js";

describe("a generated app's vitest globalSetup", () => {
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

  it("maintains the test schema once, so concurrent workers find it current on a fresh database", async () => {
    const dir = await getFs().mkdtemp!(`${(await getOsAsync()).tmpdir()}${getPath().sep}boot-app-`);
    savedEnv = env.TRAILS_ENV;
    savedUrl = env.DATABASE_URL;
    setEnv("TRAILS_ENV", "test");
    setEnv("DATABASE_URL", `sqlite3:${dir}/test.sqlite3`);
    _resetTrailsEnv();

    const { setup } = await import("./__fixtures__/boot-app/test/global-setup.js");
    await setup();

    const loadSchemaBang = vi.spyOn(
      Migration as unknown as { loadSchemaBang(): Promise<void> },
      "loadSchemaBang",
    );
    await Promise.all([Migration.maintainTestSchemaBang(), Migration.maintainTestSchemaBang()]);

    expect(loadSchemaBang).not.toHaveBeenCalled();
    expect(await Base.withConnection((conn) => conn.tableExists("posts"))).toBe(true);
  }, 15_000);
});
