import { afterEach, describe, expect, it } from "vitest";
import { buildViews } from "@blazetrails/trails-tsc";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { useInMemoryDatabaseUrl } from "./support/in-memory-database-url.js";
import { Trailtie } from "../lib/trailtie.js";
import { Application } from "../lib/application.js";
import { Trails } from "../lib/trails.js";

const seats = globalThis as unknown as { trailsBuildViewsRan?: string[] };

describe("trails-tsc build views with an uninitialized app", () => {
  useInMemoryDatabaseUrl();

  afterEach(() => {
    delete seats.trailsBuildViewsRan;
    Trails.application = null;
    Application.appClass = null;
  });

  it("loads config/initializers after the framework initializers", async () => {
    const root = Dir.mktmpdir("build-views-initializes-app");
    try {
      FileUtils.mkdirP(File.join(root, "app/views/audits"));
      FileUtils.mkdirP(File.join(root, "config/initializers"));
      File.write(File.join(root, "app/views/audits/show.html.tse"), "audit");
      File.write(
        File.join(root, "config/initializers/hub-database.js"),
        'globalThis.trailsBuildViewsRan.push("load_config_initializers");\n',
      );
      seats.trailsBuildViewsRan = [];
      class AttachedTrailtie extends Trailtie {}
      Trailtie.register(AttachedTrailtie);
      AttachedTrailtie.initializer("active_storage.attached", () => {
        seats.trailsBuildViewsRan!.push("active_storage.attached");
      });
      class BuildViewsApp extends Application {}
      Application.register(BuildViewsApp, File.join(root, "config"));
      Trails.application!.config.setRoot(root);

      const { files } = await buildViews({ cwd: root, outDir: File.join(root, ".trails") });

      expect(files).toEqual(["audits/show.html.tse"]);
      expect(Trails.application!.initialized()).toBe(true);
      expect(seats.trailsBuildViewsRan).toEqual([
        "active_storage.attached",
        "load_config_initializers",
      ]);
    } finally {
      FileUtils.rmRf(root);
    }
  }, 30_000);
});
