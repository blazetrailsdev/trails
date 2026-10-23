import { describe, expect, it } from "vitest";
import { useInMemoryDatabaseUrl } from "./support/in-memory-database-url.js";
import "./all.js";
import { Base } from "@blazetrails/activejob";
import { Application } from "./application.js";
import { Trails } from "./rails.js";

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
      "activeJob",
      "actionDispatch",
      "actionController",
      "actionView",
    ]) {
      expect(app.deprecators.get(framework), framework).toBeDefined();
    }
    expect(app.config.activeJob).toBeDefined();
    expect(Base.queueAdapterName).toBe("test");
    expect(Base.logger).toBe(Trails.logger);
  });
});
