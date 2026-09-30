import { afterEach, describe, expect, it } from "vitest";
import { Base, modelRegistry } from "@blazetrails/activerecord";
import { BetterSQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/better-sqlite3-adapter.js";
import { env, getFs, getOsAsync, getPath, setEnv } from "@blazetrails/ruby-compat";
import { Application } from "./application.js";
import { Trails, _resetTrailsEnv } from "./rails.js";

describe("a booted app's models are warm before user code runs", () => {
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

  it("builds a model with attributes as its first access", async () => {
    const fs = getFs();
    const dir = await fs.mkdtemp!(`${(await getOsAsync()).tmpdir()}${getPath().sep}boot-app-`);
    const database = `${dir}/development.sqlite3`;
    const adapter = new BetterSQLite3Adapter({ database });
    await adapter.execute("CREATE TABLE posts (id integer PRIMARY KEY, title varchar)");
    await adapter.disconnectBang();

    savedEnv = env.TRAILS_ENV;
    savedUrl = env.DATABASE_URL;
    setEnv("TRAILS_ENV", "development");
    setEnv("DATABASE_URL", `sqlite3:${database}`);
    _resetTrailsEnv();

    await import("./__fixtures__/boot-app/config/application.js");
    const app = Trails.application!;
    app.config.setRoot(new URL("./__fixtures__/boot-app", import.meta.url).pathname);
    await Trails.initialize();

    const Post = modelRegistry.get("Post")! as unknown as { new: (attrs: object) => Base };
    const post = Post.new({ title: "x" });
    expect(post.readAttribute("title")).toBe("x");
  }, 15_000);
});
