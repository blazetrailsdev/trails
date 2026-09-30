import { afterEach, describe, expect, it, vi } from "vitest";
import { Base, ConnectionNotEstablished, SchemaReflection } from "@blazetrails/activerecord";
import { env, getFs, getOsAsync, getPath, setEnv } from "@blazetrails/ruby-compat";
import { Application } from "./application.js";
import { Trails, _resetTrailsEnv } from "./rails.js";

describe("a booted app against an unhealthy database", () => {
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

  it("warns and still boots when warming the schema cache raises", async () => {
    const dir = await getFs().mkdtemp!(`${(await getOsAsync()).tmpdir()}${getPath().sep}boot-app-`);
    savedEnv = env.TRAILS_ENV;
    savedUrl = env.DATABASE_URL;
    setEnv("TRAILS_ENV", "development");
    setEnv("DATABASE_URL", `sqlite3:${dir}/development.sqlite3`);
    _resetTrailsEnv();
    vi.spyOn(SchemaReflection.prototype, "loadAllBang").mockRejectedValue(
      new ConnectionNotEstablished("down"),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await import("./__fixtures__/boot-app/config/application.js");
    Trails.application!.config.setRoot(
      new URL("./__fixtures__/boot-app", import.meta.url).pathname,
    );
    await Trails.initialize();

    expect(warn).toHaveBeenCalledWith(
      "Failed to load the schema cache because of ConnectionNotEstablished: down",
    );
  }, 15_000);
});
