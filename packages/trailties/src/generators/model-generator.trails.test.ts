import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ModelGenerator } from "./model-generator.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeGen() {
  return new ModelGenerator({ cwd: tmpDir, output: () => {} });
}

describe("ModelGeneratorTest", () => {
  it("password digest attribute adds has secure password as the last line", () => {
    makeGen().run("User", ["account:references", "token:token", "password:digest"]);
    const content = fs.readFileSync(path.join(tmpDir, "app/models/user.ts"), "utf-8");
    expect(content).toContain(
      '    this.belongsTo("account");\n    this.hasSecureToken();\n    this.hasSecurePassword();\n  }',
    );
  });

  it("password digest attribute creates password_digest string column", () => {
    const files = makeGen().run("User", ["name", "password:digest"]);
    const migFile = files.find((f) => f.startsWith("db/migrate/"));
    const content = fs.readFileSync(path.join(tmpDir, migFile!), "utf-8");
    expect(content).toContain('t.string("password_digest");');
    expect(content).not.toContain("t.digest");
  });

  it("digest attribute not named password does not add has secure password", () => {
    makeGen().run("User", ["recovery:digest"]);
    const content = fs.readFileSync(path.join(tmpDir, "app/models/user.ts"), "utf-8");
    expect(content).not.toContain("hasSecurePassword");
  });
});
