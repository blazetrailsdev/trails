import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ModelHelpers } from "./model-helpers.js";
import { assertFile, assertInstanceMethod, assertMigration } from "./testing/assertions.js";
import { Application } from "../application.js";
import "../trailties/active-record.js";
import "../test-unit/trailtie.js";

class ResourceGeneratorApp extends Application {}
let ResourceGenerator: typeof import("./rails/resource/resource-generator.js").ResourceGenerator;

beforeAll(async () => {
  await ResourceGeneratorApp.instance().loadGenerators();
  ({ ResourceGenerator } = await import("./rails/resource/resource-generator.js"));
});

let tmpDir: string;
const opts = (extra: object = {}): any => ({ destinationRoot: tmpDir, ...extra });
const host = () => ({ destinationRoot: tmpDir }) as never;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-resource-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "config/routes.ts"),
    "Trails.application!.routes().draw(function () {\n});\n",
  );
  ModelHelpers.skipWarn = false;
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("ResourceGeneratorTest", () => {
  it("files from inherited invocation", async () => {
    await ResourceGenerator.start(["Account"], opts());

    for (const path of ["app/models/account.ts", "test/models/account.test.ts"])
      await assertFile.call(host(), path);

    await assertMigration.call(host(), "db/migrate/create_accounts.ts");
  });

  it("resource routes are added", async () => {
    await ResourceGenerator.start(["Account"], opts());
    await assertFile.call(host(), "config/routes.ts", (route) => {
      expect(route).toMatch(/this\.resources\("accounts"\);$/m);
    });
  });

  it("resource controller with pluralized class name", async () => {
    await ResourceGenerator.start(["account"], opts());
    await assertFile.call(
      host(),
      "app/controllers/accounts-controller.ts",
      /class AccountsController extends ApplicationController/,
    );
    await assertFile.call(
      host(),
      "test/controllers/accounts-controller.test.ts",
      /describe\("AccountsController"/,
    );

    await assertFile.call(host(), "app/helpers/accounts-helper.ts", /AccountsHelper/);
  });

  it("resource controller with actions", async () => {
    await ResourceGenerator.start(["account", "--actions", "index", "new"], opts());

    await assertFile.call(host(), "app/controllers/accounts-controller.ts", async (controller) => {
      await assertInstanceMethod("index", controller);
      await assertInstanceMethod("new", controller);
    });

    await assertFile.call(host(), "app/views/accounts/index.html.tse");
    await assertFile.call(host(), "app/views/accounts/new.html.tse");
  });
});
