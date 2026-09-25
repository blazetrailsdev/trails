import { describe, expect, it } from "vitest";
import { useInMemoryDatabaseUrl } from "./support/in-memory-database-url.js";
import "./all.js";
import { Application } from "./application.js";

describe("rails/all", () => {
  useInMemoryDatabaseUrl();

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
