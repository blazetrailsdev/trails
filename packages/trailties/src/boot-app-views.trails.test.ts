// End-to-end cover for RFC 0104: a generated app renders its own `.tse` view,
// wrapped in `app/views/layouts/application.html.tse`. Trails-only — Rails has
// no `.tse` handler, so there is no counterpart test to mirror.
import { afterEach, describe, expect, it } from "vitest";
import { bodyToString } from "@blazetrails/rack";
import { Application } from "./application.js";
import { Trails } from "./rails.js";

describe("a generated app renders its own views", () => {
  afterEach(() => {
    Trails.application = null;
    Application.appClass = null;
  });

  it("renders a .tse template wrapped in the application layout", async () => {
    await import("./__fixtures__/boot-app/config/application.js");
    const app = Trails.application!;
    app.config.setRoot(new URL("./__fixtures__/boot-app", import.meta.url).pathname);

    await Trails.initialize();

    const [status, headers, body] = await app.app()({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/posts/show",
      HTTP_ACCEPT: "*/*",
    });
    const html = await bodyToString(body);
    expect(status).toBe(200);
    expect(headers["content-type"]).toMatch(/text\/html/);
    expect(html).toContain("<h1>Posts</h1>");
    expect(html).toContain("<p>Hello from TSE</p>");
    expect(html).toContain("<!DOCTYPE html>");
  });
});
