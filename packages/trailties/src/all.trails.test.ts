// Cover for `all.ts`, the port of `railties/lib/rails/all.rb`: an application
// whose only trailties import is `all.ts` still boots every framework
// trailtie. Trails-only — Rails proves the same thing by `require "rails/all"`
// in a generated app, not by a unit test.
import { describe, expect, it } from "vitest";
import "./all.js";
import { Application } from "./application.js";

describe("rails/all", () => {
  it("boots every framework trailtie an app that only imports all.ts", async () => {
    class AllBootApp extends Application {}
    Application.register(AllBootApp);
    const app = AllBootApp.instance();
    await app.initialize();

    for (const framework of [
      "activeSupport",
      "activeModel",
      "activeRecord",
      "actionDispatch",
      "actionController",
      "actionView",
    ]) {
      expect(app.deprecators.get(framework), framework).toBeDefined();
    }
  });
});
