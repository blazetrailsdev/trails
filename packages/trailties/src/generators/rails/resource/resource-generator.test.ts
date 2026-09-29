import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ResourceGenerator } from "./resource-generator.js";
import { assertMatch } from "@blazetrails/activesupport";
import { ModelHelpers } from "../../model-helpers.js";
import { assertFile, assertInstanceMethod } from "../../testing/assertions.js";

let tmpDir: string;
const opts = (extra: object = {}): any => ({ cwd: tmpDir, output: () => {}, ...extra });
const host = () => ({ destinationRoot: tmpDir }) as never;
const routes = (): string => fs.readFileSync(path.join(tmpDir, "config/routes.ts"), "utf-8");
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-resource-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "config/routes.ts"),
    "export function drawRoutes(mapper: Mapper): void {\n}\n",
  );
  ModelHelpers.skipWarn = false;
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("ResourceGeneratorTest", () => {
  it("files from inherited invocation", async () => {
    const files = await new ResourceGenerator(
      opts({ name: "Product", attributes: ["name:string"] }),
    ).run();
    expect(files).toContain("app/models/product.ts");
  });

  it("resource routes are added", async () => {
    await ResourceGenerator.start(["Account"], opts());
    expect(routes()).toContain('mapper.resources("accounts");');
  });

  it("resource controller with pluralized class name", async () => {
    await ResourceGenerator.start(["account"], opts());
    await assertFile.call(host(), "app/controllers/accounts-controller.ts", (content) =>
      assertMatch(/class AccountsController extends ApplicationController/, content),
    );
    await assertFile.call(host(), "test/controllers/accounts-controller.test.ts");
    await assertFile.call(host(), "app/helpers/accounts-helper.ts", (content) =>
      assertMatch(/AccountsHelper/, content),
    );
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
