import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { HelperGenerator } from "./helper-generator.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-helper-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
});

afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function makeGen(name: string, options: object = {}, cwd = tmpDir) {
  return new HelperGenerator([name], options, { destinationRoot: cwd });
}

describe("HelperGeneratorTest", () => {
  it("helper", () => {
    makeGen("Account").createHelperFiles();
    const c = fs.readFileSync(path.join(tmpDir, "app/helpers/account-helper.ts"), "utf-8");
    expect(c).toContain("AccountHelper");
  });

  it("strips a trailing helper suffix", () => {
    makeGen("account_helper").createHelperFiles();
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/account-helper.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/account-helper-helper.ts"))).toBe(false);
  });

  it("strips a trailing dashed helper suffix", () => {
    makeGen("account-helper").createHelperFiles();
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/account-helper.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "app/helpers/account-helper-helper.ts"))).toBe(false);
  });

  it("nested namespace", () => {
    makeGen("admin/account").createHelperFiles();
    const c = fs.readFileSync(path.join(tmpDir, "app/helpers/admin/account-helper.ts"), "utf-8");
    expect(c).toContain("AdminAccountHelper");
  });

  it("generates .js helper for JS projects", () => {
    const jsDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-helper-js-"));
    try {
      const gen = makeGen("Posts", {}, jsDir);
      gen.createHelperFiles();
      const files = gen.getCreatedFiles();
      expect(files).toContain("app/helpers/posts-helper.js");
    } finally {
      fs.rmSync(jsDir, { recursive: true, force: true });
    }
  });
});
