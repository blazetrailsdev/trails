import { File } from "@blazetrails/ruby-compat";
import { SystemTestCase } from "@blazetrails/actionpack/system-testing";
import { vite } from "../../actionpack/lib/action-dispatch/system-testing/server.js";
import type { SystemTestHelper } from "../lib/system-test-helper.js";
import "../../activerecord/test/support/test-setup-dy.js";
import "../../activerecord/test/cases/helper.js";
import "./test-helper.js";

vite.config.root = File.expandPath("dummy", import.meta.dirname);
await SystemTestCase.startApplication(await import("vitest"), await import("vite"));

export class ApplicationSystemTestCase extends SystemTestCase {
  declare fillInRichTextarea: (typeof SystemTestHelper)["fillInRichTextarea"];

  newMessageUrl(): string {
    return new URL("messages/new", vite.url).href;
  }
}
ApplicationSystemTestCase.drivenBy("playwright", { using: "chromium" });
