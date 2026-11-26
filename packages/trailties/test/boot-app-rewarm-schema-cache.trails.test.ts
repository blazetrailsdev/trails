import { afterEach, describe, expect, it, vi } from "vitest";
import { Base, ConnectionNotEstablished, SchemaReflection } from "@blazetrails/activerecord";
import { env, getFs, getOsAsync, getPath, setEnv } from "@blazetrails/ruby-compat";
import { Application } from "../lib/application.js";
import { Trails, _resetTrailsEnv } from "../lib/trails.js";

describe("a booted app whose boot schema warm failed", () => {
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

  it("re-warms a cold schema cache on the first request, then does no extra work", async () => {
    const dir = await getFs().mkdtemp!(`${(await getOsAsync()).tmpdir()}${getPath().sep}boot-app-`);
    savedEnv = env.TRAILS_ENV;
    savedUrl = env.DATABASE_URL;
    setEnv("TRAILS_ENV", "development");
    setEnv("DATABASE_URL", `sqlite3:${dir}/development.sqlite3`);
    await getFs().writeFile!(`${dir}/development.sqlite3`, "");
    _resetTrailsEnv();
    const loadAll = vi
      .spyOn(SchemaReflection.prototype, "loadAllBang")
      .mockRejectedValueOnce(new ConnectionNotEstablished("down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await import("./fixtures/boot-app/config/application.js");
    Trails.application!.config.setRoot(new URL("./fixtures/boot-app", import.meta.url).pathname);
    await Trails.initialize();
    expect(loadAll).toHaveBeenCalledTimes(1);

    await Trails.application!.executor.wrap(() => undefined);
    expect(loadAll).toHaveBeenCalledTimes(2);
    await expect(loadAll.mock.results[1].value).resolves.toBeDefined();

    await Trails.application!.executor.wrap(() => undefined);
    expect(loadAll).toHaveBeenCalledTimes(2);
  }, 15_000);
});
