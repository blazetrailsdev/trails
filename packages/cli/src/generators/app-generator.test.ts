import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { AppGenerator } from "./app-generator.js";

let tmpDir: string;
let lines: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rails-ts-test-"));
  lines = [];
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeGen() {
  return new AppGenerator({ cwd: tmpDir, output: (m) => lines.push(m) });
}

describe("AppGenerator", () => {
  it("creates application directory structure", async () => {
    const gen = makeGen();
    await gen.run("my-app", { database: "sqlite", skipGit: true, skipInstall: true });
    const appDir = path.join(tmpDir, "my-app");

    expect(fs.existsSync(path.join(appDir, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, "tsconfig.json"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, ".gitignore"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, "src/app.ts"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, "src/server.ts"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, "src/config/routes.ts"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, "src/config/database.ts"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, "src/app/controllers/application-controller.ts"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(appDir, "db/seeds.ts"))).toBe(true);
  });

  it("generates valid package.json", async () => {
    const gen = makeGen();
    await gen.run("my-app", { database: "sqlite", skipGit: true, skipInstall: true });
    const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, "my-app/package.json"), "utf-8"));
    expect(pkg.name).toBe("my-app");
    expect(pkg.dependencies["better-sqlite3"]).toBeDefined();
    expect(pkg.dependencies["@blazetrails/activerecord"]).toBeDefined();
  });

  it("configures postgres database", async () => {
    const gen = makeGen();
    await gen.run("my-app", { database: "postgres", skipGit: true, skipInstall: true });
    const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, "my-app/package.json"), "utf-8"));
    expect(pkg.dependencies.pg).toBeDefined();
    const dbConfig = fs.readFileSync(path.join(tmpDir, "my-app/src/config/database.ts"), "utf-8");
    expect(dbConfig).toContain("postgresql");
  });

  it("configures mysql database", async () => {
    const gen = makeGen();
    await gen.run("my-app", { database: "mysql", skipGit: true, skipInstall: true });
    const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, "my-app/package.json"), "utf-8"));
    expect(pkg.dependencies.mysql2).toBeDefined();
    const dbConfig = fs.readFileSync(path.join(tmpDir, "my-app/src/config/database.ts"), "utf-8");
    expect(dbConfig).toContain("mysql2");
  });

  it("configures sqlite database by default", async () => {
    const gen = makeGen();
    await gen.run("my-app", { database: "sqlite", skipGit: true, skipInstall: true });
    const dbConfig = fs.readFileSync(path.join(tmpDir, "my-app/src/config/database.ts"), "utf-8");
    expect(dbConfig).toContain("sqlite3");
  });

  it("prints completion message", async () => {
    const gen = makeGen();
    await gen.run("my-app", { database: "sqlite", skipGit: true, skipInstall: true });
    expect(lines.some((l) => l.includes("Done!"))).toBe(true);
    expect(lines.some((l) => l.includes("my-app"))).toBe(true);
  });
});
