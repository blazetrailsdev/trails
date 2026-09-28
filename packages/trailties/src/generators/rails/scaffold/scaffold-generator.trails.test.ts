import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ScaffoldGenerator } from "./scaffold-generator.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
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
    expect(controller).toContain('this.redirectTo("/admin/accounts")');
    expect(controller).toContain('this.redirectTo("/admin/accounts/" + this.params.get("id"))');
    expect(read("app/views/admin/accounts/index.html.tse")).toContain('href="/admin/accounts/new"');
    for (const view of ["new", "edit"])
      expect(read(`app/views/admin/accounts/${view}.html.tse`)).toContain('href="/admin/accounts"');
    const rerun = new ScaffoldGenerator({ ...options, force: true }).run();
    await expect(rerun).resolves.toContain("app/models/admin/account.ts");
  });
});
