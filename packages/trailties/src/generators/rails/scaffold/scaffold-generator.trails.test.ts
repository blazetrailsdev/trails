import { capture } from "@blazetrails/activesupport";
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { run } from "@blazetrails/activerecord-cli";
import { AppGenerator } from "../app/app-generator.js";
import { parseTs } from "../../../template-builder/testing.js";
import { Application } from "../../../application.js";
import "../../../trailties/active-record.js";
import "../../../test-unit/trailtie.js";

class ScaffoldGeneratorApp extends Application {}
let ScaffoldGenerator: typeof import("./scaffold-generator.js").ScaffoldGenerator;

beforeAll(async () => {
  await ScaffoldGeneratorApp.instance().loadGenerators();
  ({ ScaffoldGenerator } = await import("./scaffold-generator.js"));
});

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  fs.mkdirSync(path.join(tmpDir, "config"));
  fs.writeFileSync(
    path.join(tmpDir, "config/routes.ts"),
    "Trails.application!.routes().draw(function () {\n});\n",
  );
});
const startDir = process.cwd();
afterEach(() => {
  process.chdir(startDir);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
const read = (relativePath: string) => fs.readFileSync(path.join(tmpDir, relativePath), "utf-8");

describe("ScaffoldGenerator (namespaced)", () => {
  it("names a namespaced scaffold's migration create_<table_name> and routes it under /admin/accounts", async () => {
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
    const config = { destinationRoot: tmpDir };
    await ScaffoldGenerator.start(["admin/account", "name:string"], config);
    const migration = fs
      .readdirSync(tmpDir, { recursive: true })
      .map(String)
      .find((f) => f.startsWith("db/migrate/"))!;
    expect(migration).toMatch(/^db\/migrate\/\d+_create_admin_accounts\.ts$/);
    expect(read(migration)).toContain('this.createTable("admin_accounts"');
    const controller = read("app/controllers/admin/accounts-controller.ts");
    const model = read("app/models/admin/account.ts");
    expect(model).toContain('import { ApplicationRecord } from "../application-record.ts";');
    expect(model).toContain("export class AdminAccount extends ApplicationRecord");
    expect(controller).toContain('import { AdminAccount } from "../../models/admin/account.ts";');
    for (const source of [model, controller, read("app/models/admin.ts")])
      expect(parseTs(source).diagnostics).toEqual([]);
    expect(controller).toContain("this.redirectTo(this.adminAccountsPath(),");
    expect(controller).toContain("this.redirectTo(this.admin_account,");
    expect(read("app/views/admin/accounts/index.html.tse")).toContain(
      'linkTo("New account", newAdminAccountPath())',
    );
    for (const view of ["new", "edit"])
      expect(read(`app/views/admin/accounts/${view}.html.tse`)).toContain(
        'linkTo("Back to accounts", adminAccountsPath())',
      );
    const functionalTest = read("test/controllers/admin/accounts-controller.test.ts");
    expect(functionalTest).toContain("declare admin_accounts: FixtureSetAccessor<AdminAccount>;");
    expect(functionalTest).toContain('this["@admin_account"] = await this.admin_accounts("one");');
    expect(parseTs(functionalTest).diagnostics).toEqual([]);
    const rerun = ScaffoldGenerator.start(["admin/account", "--force"], config);
    await expect(rerun).resolves.toEqual(expect.any(Array));
  });
});

describe("ScaffoldGenerator (routes)", () => {
  it("logs and writes the resource route with the mapper as this", async () => {
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
    const output = await capture("stdout", () =>
      ScaffoldGenerator.start(["post", "title:string"], { destinationRoot: tmpDir }),
    );
    expect(output).toMatch(/^ +route +this\.resources\("posts"\);$/m);
    expect(read("config/routes.ts")).toBe(
      'Trails.application!.routes().draw(function () {\n  this.resources("posts");\n});\n',
    );
  });
});

describe("ScaffoldGenerator (views)", () => {
  it("emits Rails' scaffold copy and a record partial that show and index render", async () => {
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
    await ScaffoldGenerator.start(["post", "title:string"], { destinationRoot: tmpDir });
    const index = read("app/views/posts/index.html.tse");
    expect(index).toContain('<%= linkTo("Show this post", post) %>');
    expect(index).toContain("<%= render(post) %>");
    const show = read("app/views/posts/show.html.tse");
    expect(show).toContain("<%= render(this.post) %>");
    expect(show).toContain('<%= linkTo("Back to posts", postsPath()) %>');
    expect(show).toContain('<%= buttonTo("Destroy this post", this.post, { method: "delete" }) %>');
    expect(read("app/views/posts/edit.html.tse")).toContain("<h1>Editing post</h1>");
    expect(read("app/views/posts/_post.html.tse")).toBe(`<div id="<%= domId(post) %>">
  <p>
    <strong>Title:</strong>
    <%= post.title %>
  </p>

</div>
`);
  });
});

describe("ScaffoldGenerator (type-check)", () => {
  const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

  it("emits a controller that trails-tsc builds against the scaffolded model", async () => {
    const tmpApps = fs.mkdtempSync(path.join(PACKAGE_DIR, "tmp-scaffold-build-"));
    try {
      await new AppGenerator(
        ["blog"],
        { skipBundle: true, database: "sqlite" },
        { destinationRoot: tmpApps },
      ).invokeAll();
      const appDir = path.join(tmpApps, "blog");
      const scope = path.join(appDir, "node_modules", "@blazetrails");
      fs.mkdirSync(scope, { recursive: true });
      const packagesDir = path.dirname(PACKAGE_DIR);
      for (const pkg of fs.readdirSync(packagesDir)) {
        if (fs.existsSync(path.join(packagesDir, pkg, "package.json")))
          fs.symlinkSync(path.join(packagesDir, pkg), path.join(scope, pkg));
      }
      fs.mkdirSync(path.join(appDir, "node_modules", "@types"));
      fs.symlinkSync(
        path.join(packagesDir, "activerecord-cli", "node_modules", "@types", "node"),
        path.join(appDir, "node_modules", "@types", "node"),
      );
      await ScaffoldGenerator.start(["Post", "title:string", "body:text"], {
        destinationRoot: appDir,
      });

      fs.writeFileSync(
        path.join(appDir, "db/schema.ts"),
        [
          'import type { DatabaseAdapter } from "@blazetrails/activerecord";',
          "export default async function defineSchema(ctx: DatabaseAdapter) {",
          '  await ctx.createTable("posts", { force: "cascade" }, (t) => {',
          '    t.string("title");',
          '    t.text("body");',
          '    t.datetime("created_at", { null: false });',
          '    t.datetime("updated_at", { null: false });',
          "  });",
          "}",
        ].join("\n"),
      );
      fs.writeFileSync(
        path.join(appDir, "config/routes.ts"),
        [
          'import { Trails } from "@blazetrails/trailties";',
          "Trails.application.routes().draw(function () {",
          '  this.resources("posts");',
          '  this.resource("session");',
          '  this.get("about", { to: "pages#about", as: "about_us" });',
          '  this.namespace("admin", function () {',
          '    this.resources("posts", function () {',
          '      this.resources("comments");',
          "    });",
          "  });",
          '  this.root("posts#index");',
          "});",
        ].join("\n"),
      );
      fs.writeFileSync(
        path.join(appDir, "app/controllers/pages-controller.ts"),
        [
          'import { ApplicationController } from "./application-controller.ts";',
          "export class PagesController extends ApplicationController {",
          "  about(): void {",
          "    this.redirectTo(this.rootPath());",
          "    this.redirectTo(this.aboutUsUrl());",
          "    this.redirectTo(this.newSessionPath());",
          "    this.redirectTo(this.adminPostCommentsPath(1));",
          "  }",
          "}",
        ].join("\n"),
      );
      fs.writeFileSync(
        path.join(appDir, "config/integration-test-helpers.ts"),
        [
          'import type { IntegrationTest } from "@blazetrails/actionpack";',
          "export function urls(t: IntegrationTest): string[] {",
          "  return [t.postsUrl(), t.newPostUrl(), t.rootUrl(), t.adminPostPath(1)];",
          "}",
        ].join("\n"),
      );
      const code = await run(
        [
          "typecheck",
          "-p",
          path.join(appDir, "tsconfig.json"),
          "--noEmit",
          "--schema",
          path.join(appDir, "db/schema.ts"),
        ],
        appDir,
      );
      expect(code).toBe(0);
    } finally {
      fs.rmSync(tmpApps, { recursive: true, force: true });
    }
  }, 30_000);
});
