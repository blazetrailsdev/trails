import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { useInMemoryDatabaseUrl } from "./support/in-memory-database-url.js";
import "./all.js";
import { Base } from "@blazetrails/activejob";
import { Base as RecordBase } from "@blazetrails/activerecord";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Application } from "./application.js";
import { Trails } from "./rails.js";

describe("rails/all", () => {
  useInMemoryDatabaseUrl();

  it("keeps each railtie's Configuration augmentation in its emitted declarations", () => {
    const source = readFileSync(new URL("./all.ts", import.meta.url), "utf8");
    for (const railtie of ["active-record", "action-controller", "action-view", "active-job"]) {
      expect(source).toContain(`export type {} from "./trailties/${railtie}.js";`);
    }
  });

  it("boots every framework trailtie an app that only imports all.ts", async () => {
    class AllBootApp extends Application {}
    Application.register(AllBootApp);
    const app = AllBootApp.instance();
    await app.initializeBang();

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
    expect(rbObjRespondTo(RecordBase, "hasOneAttached")).toBe(true);
  });
});
