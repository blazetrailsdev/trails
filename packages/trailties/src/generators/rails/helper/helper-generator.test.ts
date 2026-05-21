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

function makeGen(cwd = tmpDir) {
  return new HelperGenerator({ cwd, output: () => {} });
}

describe("HelperGeneratorTest", () => {
  it("helper", () => {
    makeGen().run("Account");
    const c = fs.readFileSync(path.join(tmpDir, "src/app/helpers/account-helper.ts"), "utf-8");
    expect(c).toContain("AccountHelper");
  });

  it("invokes default test framework", () => {
    makeGen().run("Account");
    expect(fs.existsSync(path.join(tmpDir, "test/helpers/account-helper.test.ts"))).toBe(true);
  });

  it("does not invoke test framework if required", () => {
    makeGen().run("Account", { test: false });
    expect(fs.existsSync(path.join(tmpDir, "test/helpers/account-helper.test.ts"))).toBe(false);
  });

  it("strips a trailing helper suffix", () => {
    makeGen().run("account_helper");
    expect(fs.existsSync(path.join(tmpDir, "src/app/helpers/account-helper.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "src/app/helpers/account-helper-helper.ts"))).toBe(
      false,
    );
  });

  it("strips a trailing dashed helper suffix", () => {
    makeGen().run("account-helper");
    expect(fs.existsSync(path.join(tmpDir, "src/app/helpers/account-helper.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "src/app/helpers/account-helper-helper.ts"))).toBe(
      false,
    );
  });

  it("nested namespace", () => {
    makeGen().run("admin/account");
    const c = fs.readFileSync(
      path.join(tmpDir, "src/app/helpers/admin/account-helper.ts"),
      "utf-8",
    );
    expect(c).toContain("AdminAccountHelper");
  });

  it("generates .js helper for JS projects", () => {
    const jsDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-helper-js-"));
    try {
      const files = new HelperGenerator({ cwd: jsDir, output: () => {} }).run("Posts");
      expect(files).toContain("src/app/helpers/posts-helper.js");
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
