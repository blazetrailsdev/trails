import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { API } from "typescript/unstable/sync";
import { ScaffoldGenerator } from "./scaffold-generator.js";
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
    const options = { cwd: tmpDir, output: () => {}, name: "admin/account" };
    const files = await new ScaffoldGenerator({ ...options, attributes: ["name:string"] }).run();
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
    expect(controller).toContain('this.redirectTo("/admin/accounts"');
    expect(controller).toContain("this.redirectTo(`/admin/accounts/${this.admin_account.id}`");
    expect(read("app/views/admin/accounts/index.html.tse")).toContain(
      'linkTo("New account", newAdminAccountPath())',
    );
    for (const view of ["new", "edit"])
      expect(read(`app/views/admin/accounts/${view}.html.tse`)).toContain(
        'linkTo("Back to accounts", adminAccountsPath())',
      );
    const rerun = new ScaffoldGenerator({ ...options, force: true }).run();
    await expect(rerun).resolves.toContain("app/models/admin/account.ts");
  });
});

describe("ScaffoldGenerator (views)", () => {
  it("emits Rails' scaffold copy and a record partial that show and index render", async () => {
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
    await new ScaffoldGenerator({
      cwd: tmpDir,
      output: () => {},
      name: "post",
      attributes: ["title:string"],
    }).run();
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
  const compilerOptions = { strict: true, module: "nodenext", noEmit: true, skipLibCheck: true };
  const APP_FILES: Record<string, string> = {
    "package.json": `{ "type": "module" }`,
    "tsconfig.json": JSON.stringify({ compilerOptions, include: ["app/**/*.ts"] }),
    "app/controllers/application-controller.ts": `import { ActionController } from "@blazetrails/actionpack";\nexport class ApplicationController extends ActionController.Base {}\n`,
    "app/models/application-record.ts": `import { Base } from "@blazetrails/activerecord";\nexport class ApplicationRecord extends Base {}\n`,
    "config/routes.ts": "export function drawRoutes(mapper: Mapper): void {\n}\n",
  };

  it("emits a controller that type-checks against the scaffolded model", async () => {
    const appDir = fs.mkdtempSync(path.join(PACKAGE_DIR, "tmp-scaffold-strict-"));
    const api = new API();
    try {
      for (const [rel, content] of Object.entries(APP_FILES)) {
        fs.mkdirSync(path.dirname(path.join(appDir, rel)), { recursive: true });
        fs.writeFileSync(path.join(appDir, rel), content);
      }
      await new ScaffoldGenerator({
        cwd: appDir,
        output: () => {},
        name: "Post",
        attributes: ["title:string", "body:text"],
      }).run();

      const configPath = path.join(appDir, "tsconfig.json");
      const program = api
        .createSnapshot({ openProjects: [configPath] })
        .getConfiguredProject(configPath)!.program;
      const diagnostics = [
        ...program.getSyntacticDiagnostics(),
        ...program.getSemanticDiagnostics(),
      ].map((d) => `${path.relative(appDir, d.fileName ?? "")}: TS${d.code}`);

      expect(diagnostics).toEqual([]);
    } finally {
      api.close();
      fs.rmSync(appDir, { recursive: true, force: true });
    }
  });
});
