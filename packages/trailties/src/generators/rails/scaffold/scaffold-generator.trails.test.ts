import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { run } from "@blazetrails/activerecord-cli";
import { ScaffoldGenerator } from "./scaffold-generator.js";
import { AppGenerator } from "../../app-generator.js";
import { parseTs } from "../../../template-builder/testing.js";

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  fs.mkdirSync(path.join(tmpDir, "config"));
  fs.writeFileSync(
    path.join(tmpDir, "config/routes.ts"),
    "export function drawRoutes(mapper: Mapper): void {\n}\n",
  );
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
const read = (relativePath: string) => fs.readFileSync(path.join(tmpDir, relativePath), "utf-8");

describe("ScaffoldGenerator (namespaced)", () => {
  it("names a namespaced scaffold's migration create_<table_name> and routes it under /admin/accounts", async () => {
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
    const config = { cwd: tmpDir, output: () => {} };
    const files = await ScaffoldGenerator.start(["admin/account", "name:string"], config);
    const migration = files.find((f) => f.startsWith("db/migrate/"))!;
    expect(migration).toMatch(/^db\/migrate\/\d+_create_admin_accounts\.ts$/);
    expect(read(migration)).toContain('this.createTable("admin_accounts"');
    const controller = read("app/controllers/admin/accounts-controller.ts");
    const model = read("app/models/admin/account.ts");
    expect(model).toContain('import { ApplicationRecord } from "../application-record.js";');
    expect(model).toContain("export class AdminAccount extends ApplicationRecord");
    expect(controller).toContain('import { AdminAccount } from "../../models/admin/account.js";');
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
    const rerun = ScaffoldGenerator.start(["admin/account"], { ...config, force: true });
    await expect(rerun).resolves.toContain("app/models/admin/account.ts");
  });
});

describe("ScaffoldGenerator (views)", () => {
  it("emits Rails' scaffold copy and a record partial that show and index render", async () => {
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
    await ScaffoldGenerator.start(["post", "title:string"], { cwd: tmpDir, output: () => {} });
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
      await new AppGenerator({
        cwd: tmpApps,
        output: () => {},
        appPath: "blog",
        database: "sqlite",
      }).run();
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
      await new ScaffoldGenerator({
        cwd: appDir,
        output: () => {},
        name: "Post",
        attributes: ["title:string", "body:text"],
      }).run();

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
  });
});
