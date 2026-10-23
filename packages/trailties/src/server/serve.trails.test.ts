import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { env, setEnv } from "@blazetrails/ruby-compat";
import { Application } from "../application.js";
import { Trails, _resetTrailsEnv } from "../rails.js";
import { serve } from "./boot.js";
import type { HttpServer } from "@blazetrails/ruby-compat";

describe("serve (trails)", () => {
  let server: HttpServer | null = null;
  let savedTrailsEnv: string | undefined;

  beforeAll(async () => {
    await import("../__fixtures__/boot-app/config/application.js");
    Trails.application!.config.setRoot(
      new URL("../__fixtures__/boot-app", import.meta.url).pathname,
    );
  }, 30_000);

  beforeEach(() => {
    savedTrailsEnv = env.TRAILS_ENV;
    setEnv("TRAILS_ENV", undefined);
    _resetTrailsEnv();
  });

  afterEach(async () => {
    if (server) await new Promise((done) => server!.close(done));
    server = null;
    setEnv("TRAILS_ENV", savedTrailsEnv);
    _resetTrailsEnv();
  });

  afterAll(() => {
    Trails.application = null;
    Application.appClass = null;
  });

  it("serves a real HTTP request outside development, on a port the OS picks", async () => {
    server = await serve({ environment: "test", port: 0, binding: "127.0.0.1", banner: false });

    const address = server.address();
    expect(address).toBeTruthy();
    const port = typeof address === "object" ? address!.port : 0;
    expect(port).toBeGreaterThan(0);

    const response = await fetch(`http://127.0.0.1:${port}/up`);

    expect(response.status).toBe(200);
    expect(env.TRAILS_ENV).toBe("test");
  }, 30_000);
});
