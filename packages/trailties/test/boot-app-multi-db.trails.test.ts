import type { RackResponse } from "@blazetrails/rack";
import { afterEach, describe, expect, it } from "vitest";
import { Base } from "@blazetrails/activerecord";
import { MockRequest } from "@blazetrails/rack";
import { env, getFs, getOsAsync, getPath, rbProcCall, setEnv } from "@blazetrails/ruby-compat";
import { Application } from "../lib/application.js";
import { Trails, _resetTrailsEnv } from "../lib/trails.js";

describe("a booted multi-database app's pools are warm before user code runs", () => {
  const saved: Record<string, string | undefined> = {};
  const keys = ["TRAILS_ENV", "DATABASE_URL", "BOOT_MULTI_DB_PRIMARY", "BOOT_MULTI_DB_ANIMALS"];

  async function createTable(database: string, sql: string): Promise<void> {
    await Base.establishConnection({ adapter: "sqlite3", database });
    await Base.withConnection((conn) => conn.execute(sql));
    await Base.removeConnection();
  }

  async function boot(): Promise<void> {
    const dir = await getFs().mkdtemp!(
      `${(await getOsAsync()).tmpdir()}${getPath().sep}boot-multi-db-`,
    );
    const primary = `${dir}/primary.sqlite3`;
    const animals = `${dir}/animals.sqlite3`;
    await createTable(primary, "CREATE TABLE posts (id INTEGER PRIMARY KEY, title VARCHAR)");
    await createTable(animals, "CREATE TABLE dogs (id INTEGER PRIMARY KEY, name VARCHAR)");

    for (const key of keys) saved[key] = env[key];
    setEnv("TRAILS_ENV", "development");
    setEnv("DATABASE_URL", undefined);
    setEnv("BOOT_MULTI_DB_PRIMARY", primary);
    setEnv("BOOT_MULTI_DB_ANIMALS", animals);
    _resetTrailsEnv();

    await import("./fixtures/boot-app-multi-db/config/application.js");
    Trails.application!.config.setRoot(
      new URL("./fixtures/boot-app-multi-db", import.meta.url).pathname,
    );
    await Trails.initialize();
  }

  function post(path: string, params: Record<string, unknown>): Promise<RackResponse> {
    return rbProcCall(
      Trails.application!.app(),
      MockRequest.envFor(path, {
        ":method": "POST",
        ":params": params,
        HTTP_ACCEPT: "application/json",
      }),
    ) as Promise<RackResponse>;
  }

  async function answer(response: Promise<RackResponse>): Promise<[number, string]> {
    const [status, , body] = await response;
    return [status, [...(body as Iterable<string>)].join("")];
  }

  afterEach(async () => {
    await Base.connectionHandler.clearAllConnectionsBang("all");
    for (const key of keys) setEnv(key, saved[key]);
    _resetTrailsEnv();
    Trails.application = null;
    Application.appClass = null;
  });

  it("answers a first-request new on each database and role", async () => {
    await boot();
    expect(await answer(post("/posts", { post: { title: "x" } }))).toEqual([201, '{"title":"x"}']);
    expect(await answer(post("/posts/preview", { post: { title: "y" } }))).toEqual([
      200,
      '{"title":"y"}',
    ]);
    expect(await answer(post("/dogs", { dog: { name: "rex" } }))).toEqual([201, '{"name":"rex"}']);
  }, 30_000);
});
