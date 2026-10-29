import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Application } from "./application.js";
import { Trails } from "./rails.js";

describe("a booted app dispatches to an ActionController::API controller", () => {
  beforeAll(async () => {
    await import("./__fixtures__/boot-app/config/application.js");
    Trails.application!.config.setRoot(
      new URL("./__fixtures__/boot-app", import.meta.url).pathname,
    );
    await Trails.initialize();
  }, 15_000);

  afterAll(() => {
    Trails.application = null;
    Application.appClass = null;
  });

  it("registers app/controllers classes that subclass ActionController::API", async () => {
    const [status, , body] = await Trails.application!.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/ping",
      HTTP_ACCEPT: "*/*",
    });
    expect(status).toBe(200);
    expect([...(body as Iterable<string>)].join("")).toBe('{"pong":true}');
  });
});
