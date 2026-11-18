import { afterEach, describe, expect, it } from "vitest";
import { Base } from "@blazetrails/activerecord";
import { env, getFs, getOsAsync, getPath, setEnv } from "@blazetrails/ruby-compat";
import { Application } from "../lib/application.js";
import { Trails, _resetTrailsEnv } from "../lib/trails.js";

describe("a booted app whose boot flush emptied the pool", () => {
  let savedEnv: string | undefined;
  let savedUrl: string | undefined;

  afterEach(async () => {
    await Base.connectionHandler.clearAllConnectionsBang("all");
    setEnv("TRAILS_ENV", savedEnv);
    setEnv("DATABASE_URL", savedUrl);
    _resetTrailsEnv();
    Trails.application = null;
    Application.appClass = null;
  });

  it("connects the pool before the first request reads a model", async () => {
    const dir = await getFs().mkdtemp!(`${(await getOsAsync()).tmpdir()}${getPath().sep}boot-app-`);
    savedEnv = env.TRAILS_ENV;
    savedUrl = env.DATABASE_URL;
    setEnv("TRAILS_ENV", "development");
    setEnv("DATABASE_URL", `sqlite3:${dir}/development.sqlite3`);
    _resetTrailsEnv();

    await import("./fixtures/boot-app/config/application.js");
    Trails.application!.config.setRoot(new URL("./fixtures/boot-app", import.meta.url).pathname);
    await Trails.initialize();
    expect(Base.connectionPool().isConnected()).toBe(false);

    await Trails.application!.executor.wrap(() => undefined);
    expect(Base.connectionPool().isConnected()).toBe(true);
  }, 15_000);
});
