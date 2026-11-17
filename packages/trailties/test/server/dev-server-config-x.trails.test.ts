import { afterEach, describe, expect, it } from "vitest";
import { Base } from "@blazetrails/activerecord";
import { env, getFs, getOsAsync, getPath, setEnv } from "@blazetrails/ruby-compat";
import { Application } from "../../lib/application.js";
import { DevServer } from "../../lib/server/dev-server.js";
import { Trails, _resetTrailsEnv } from "../../lib/trails.js";

describe("the development server", () => {
  let savedEnv: string | undefined;
  let savedUrl: string | undefined;
  let server: DevServer | undefined;

  afterEach(async () => {
    await server?.stop();
    await Base.connectionHandler.clearAllConnectionsBang("all");
    setEnv("TRAILS_ENV", savedEnv);
    setEnv("DATABASE_URL", savedUrl);
    _resetTrailsEnv();
    Trails.application = null;
    Application.appClass = null;
  });

  it("answers a request with the config.x value the application class set at boot", async () => {
    const dir = await getFs().mkdtemp!(`${(await getOsAsync()).tmpdir()}${getPath().sep}boot-app-`);
    savedEnv = env.TRAILS_ENV;
    savedUrl = env.DATABASE_URL;
    setEnv("TRAILS_ENV", "development");
    setEnv("DATABASE_URL", `sqlite3:${dir}/development.sqlite3`);
    _resetTrailsEnv();

    await import("../fixtures/boot-app/config/application.js");
    const root = new URL("../fixtures/boot-app", import.meta.url).pathname;
    Trails.application!.config.setRoot(root);
    await Trails.initialize();

    server = new DevServer({ port: 0, host: "127.0.0.1", cwd: root, app: Trails.application! });
    await server.start();
    const address = (
      server as unknown as { server: { httpServer: { address(): { port: number } } } }
    ).server.httpServer.address();

    const response = await fetch(`http://127.0.0.1:${address.port}/setting`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("set at boot");
  }, 30_000);
});
