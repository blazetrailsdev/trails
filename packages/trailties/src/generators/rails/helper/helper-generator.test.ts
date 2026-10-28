import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { HelperGenerator, helperPaths } from "./helper-generator.js";

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

  it("invokes default test framework", () => {
    makeGen("Account").createHelperFiles();
    expect(fs.existsSync(path.join(tmpDir, "test/helpers/account-helper.test.ts"))).toBe(true);
  });

  it("does not invoke test framework if required", () => {
    makeGen("Account", { test: false }).createHelperFiles();
    expect(fs.existsSync(path.join(tmpDir, "test/helpers/account-helper.test.ts"))).toBe(false);
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
      expect(files).toContain("test/helpers/posts-helper.test.js");
    } finally {
      fs.rmSync(jsDir, { recursive: true, force: true });
    }
  });
});

describe("helperPaths", () => {
  it("derives canonical names", () => {
    expect(helperPaths("Account")).toMatchObject({
      helperName: "AccountHelper",
      helperFile: "account-helper",
    });
    expect(helperPaths("admin/account").helperName).toBe("AdminAccountHelper");
    expect(helperPaths("account_helper").helperFile).toBe("account-helper");
  });
});
