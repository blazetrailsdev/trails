import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { bodyToString } from "@blazetrails/rack";
import { Application } from "./application.js";
import { HealthController } from "./health-controller.js";
import { Trails } from "./rails.js";

async function requestUp(): Promise<[number, string]> {
  const [status, , body] = await Trails.application!.app()({
    REQUEST_METHOD: "GET",
    PATH_INFO: "/up",
    HTTP_ACCEPT: "*/*",
  });
  return [status, await bodyToString(body)];
}

describe("a generated app routes /up to Rails::HealthController", () => {
  beforeAll(async () => {
    await import("./__fixtures__/boot-app/config/application.js");
    Trails.application!.config.setRoot(
      new URL("./__fixtures__/boot-app", import.meta.url).pathname,
    );
    await Trails.initialize();
  }, 15_000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    Trails.application = null;
    Application.appClass = null;
  });

  it("answers the green page with no app-side controller registration", async () => {
    const [status, html] = await requestUp();
    expect(status).toBe(200);
    expect(html).toContain("background-color: green");
  });

  it("answers the red page with a 500 when the check raises", async () => {
    vi.spyOn(HealthController.prototype, "renderUp").mockImplementation(() => {
      throw new Error("boom");
    });
    const [status, html] = await requestUp();
    expect(status).toBe(500);
    expect(html).toContain("background-color: red");
  });
});
