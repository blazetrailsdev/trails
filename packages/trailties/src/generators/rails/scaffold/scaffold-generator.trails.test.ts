import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ScaffoldGenerator } from "./scaffold-generator.js";

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
const read = (relativePath: string) => fs.readFileSync(path.join(tmpDir, relativePath), "utf-8");

describe("ScaffoldGenerator (namespaced)", () => {
  it("names a namespaced scaffold's migration create_<table_name> and routes it under /admin/accounts", async () => {
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
    fs.mkdirSync(path.join(tmpDir, "config"));
    fs.writeFileSync(
      path.join(tmpDir, "config/routes.ts"),
      "export function drawRoutes(mapper: Mapper): void {\n}\n",
    );
    const options = { cwd: tmpDir, output: () => {}, name: "admin/account" };
    const files = await new ScaffoldGenerator({ ...options, attributes: ["name:string"] }).run();
    const migration = files.find((f) => f.startsWith("db/migrate/"))!;
    expect(migration).toMatch(/^db\/migrate\/\d+_create_admin_accounts\.ts$/);
    expect(read(migration)).toContain('this.createTable("admin_accounts"');
    const controller = read("app/controllers/admin/accounts-controller.ts");
    expect(controller).toContain('this.redirectTo("/admin/accounts")');
    expect(controller).toContain('this.redirectTo("/admin/accounts/" + this.params.get("id"))');
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
