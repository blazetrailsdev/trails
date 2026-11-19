import { File } from "@blazetrails/ruby-compat";
import { SystemTestCase } from "@blazetrails/actionpack/system-testing";
import { vite } from "../../actionpack/lib/action-dispatch/system-testing/server.js";
import "../../activerecord/test/support/test-setup-worker-db.js";
import "../../activerecord/test/support/test-setup-dy.js";
import "../../activerecord/test/cases/helper.js";
import "./test-helper.js";

vite.config.root = File.expandPath("dummy", import.meta.dirname);
await SystemTestCase.startApplication(
  await import("vitest"),
  await import("vite"),
  await import("playwright"),
);

export class ApplicationSystemTestCase extends SystemTestCase {}
ApplicationSystemTestCase.drivenBy("playwright", {
  using: "chromium",
  screenSize: [1400, 1400],
});
