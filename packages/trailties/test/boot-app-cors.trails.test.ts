import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Application } from "../lib/application.js";
import { Trails } from "../lib/trails.js";

describe("a booted app runs the generated cors initializer", () => {
  beforeAll(async () => {
    await import("./fixtures/boot-app/config/application.js");
    Trails.application!.config.setRoot(new URL("./fixtures/boot-app", import.meta.url).pathname);
    await Trails.initialize();
  }, 15_000);

  afterAll(() => {
    Trails.application = null;
    Application.appClass = null;
  });

  it("answers a preflight request with access-control-allow-origin", async () => {
    const [, headers] = await Trails.application!.call({
      REQUEST_METHOD: "OPTIONS",
      PATH_INFO: "/ping",
      HTTP_ORIGIN: "http://example.com",
      HTTP_ACCESS_CONTROL_REQUEST_METHOD: "GET",
    });
    expect((headers as Record<string, string>)["access-control-allow-origin"]).toBe(
      "http://example.com",
    );
  });
});
