import { afterEach, describe, expect, it } from "vitest";
import { Base } from "@blazetrails/activerecord";
import { MockRequest, bodyToString } from "@blazetrails/rack";
import { env, getFs, getOsAsync, getPath, setEnv, rbFLoad } from "@blazetrails/ruby-compat";
import { Application } from "./application.js";
import { Trails, _resetTrailsEnv } from "./rails.js";

describe("a booted app's models are warm before user code runs", () => {
  let savedEnv: string | undefined;
  let savedUrl: string | undefined;

  async function boot(): Promise<void> {
    const fs = getFs();
    const dir = await fs.mkdtemp!(`${(await getOsAsync()).tmpdir()}${getPath().sep}boot-app-`);
    const database = `${dir}/development.sqlite3`;
    await Base.establishConnection({ adapter: "sqlite3", database });
    await rbFLoad(new URL("./__fixtures__/boot-app/db/schema.ts", import.meta.url).pathname);
    await Base.removeConnection();

    savedEnv = env.TRAILS_ENV;
    savedUrl = env.DATABASE_URL;
    setEnv("TRAILS_ENV", "development");
    setEnv("DATABASE_URL", `sqlite3:${database}`);
    _resetTrailsEnv();

    await import("./__fixtures__/boot-app/config/application.js");
    Trails.application!.config.setRoot(
      new URL("./__fixtures__/boot-app", import.meta.url).pathname,
    );
    await Trails.initialize();
  }

  afterEach(async () => {
    await Base.connectionHandler.clearAllConnectionsBang("all");
    setEnv("TRAILS_ENV", savedEnv);
    setEnv("DATABASE_URL", savedUrl);
    _resetTrailsEnv();
    Trails.application = null;
    Application.appClass = null;
  });

  it("answers a first-request form POST that builds the model with new", async () => {
    await boot();
    const [status, , body] = await Trails.application!.app()(
      MockRequest.envFor("/posts", {
        ":method": "POST",
        ":params": { post: { title: "x" } },
        HTTP_ACCEPT: "application/json",
      }),
    );
    expect([status, await bodyToString(body)]).toEqual([201, '{"title":"x"}']);
  }, 15_000);
});
