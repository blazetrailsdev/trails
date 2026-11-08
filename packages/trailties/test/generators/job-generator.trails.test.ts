import { Dir, File } from "@blazetrails/ruby-compat";
import { expect, it } from "vitest";
import { Application } from "../../lib/application.js";
import "../../lib/generators.js";
import { Trails } from "../../lib/trails.js";
import "../../lib/test-unit/trailtie.js";

class ParentApp extends Application {}

it("aliases a namespaced parent to the constant its file exports", async () => {
  await ParentApp.instance().loadGenerators();
  Trails.application = ParentApp.instance();
  const { JobGenerator } = await import("../../lib/generators/trails/job/job-generator.js");
  const root = Dir.mktmpdir();
  File.write(File.join(root, "tsconfig.json"), "{}");
  await JobGenerator.start(["sync", "--parent", "Admin::Base"], { destinationRoot: root });
  Trails.application = null;
  const job = File.read(File.join(root, "app/jobs/sync-job.ts"));
  expect(job).toContain('import { Base as AdminBase } from "./admin/base.ts";');
  expect(job).toContain("class SyncJob extends AdminBase");
});
