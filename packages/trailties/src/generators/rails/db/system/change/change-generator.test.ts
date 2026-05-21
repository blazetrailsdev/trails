import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ChangeGenerator } from "./change-generator.js";

let tmpDir: string;

function write(rel: string, content: string): void {
  const full = path.join(tmpDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(tmpDir, rel), "utf-8");
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(tmpDir, rel));
}

function seedPackageJson(): void {
  write(
    "package.json",
    JSON.stringify(
      {
        name: "tmp",
        dependencies: {
          "@blazetrails/activerecord": "*",
          "better-sqlite3": "^12.6.2",
        },
      },
      null,
      2,
    ) + "\n",
  );
}

function seedDockerfile(): void {
  write(
    "Dockerfile",
    `FROM node:22-slim AS base
RUN apt-get update -qq && apt-get install --no-install-recommends -y build-essential git
RUN apt-get update -qq && apt-get install --no-install-recommends -y curl libvips sqlite3
`,
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-db-change-"));
  seedPackageJson();
  seedDockerfile();
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("ChangeGeneratorTest", () => {
  it("change to invalid database", () => {
    expect(() => new ChangeGenerator({ cwd: tmpDir, output: () => {}, to: "invalid-db" })).toThrow(
      /Invalid value for --to option/,
    );
  });

  it("change to postgresql", () => {
    new ChangeGenerator({ cwd: tmpDir, output: () => {}, to: "postgresql", appName: "tmp" }).run();

    const cfg = read("src/config/database.ts");
    expect(cfg).toContain('adapter: "postgresql"');
    expect(cfg).toContain('database: "tmp_development"');

    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies.pg).toBe("^8.19.0");
    expect(pkg.dependencies["better-sqlite3"]).toBeUndefined();

    const dockerfile = read("Dockerfile");
    expect(dockerfile).toContain("build-essential git libpq-dev");
    expect(dockerfile).toContain("curl libvips postgresql-client");
  });

  it("change to mysql", () => {
    new ChangeGenerator({ cwd: tmpDir, output: () => {}, to: "mysql", appName: "tmp" }).run();

    const cfg = read("src/config/database.ts");
    expect(cfg).toContain('adapter: "mysql2"');
    expect(cfg).toContain('database: "tmp_development"');

    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies.mysql2).toBe("^3.18.2");
    expect(pkg.dependencies["better-sqlite3"]).toBeUndefined();

    const dockerfile = read("Dockerfile");
    expect(dockerfile).toContain("build-essential default-libmysqlclient-dev git");
    expect(dockerfile).toContain("curl default-mysql-client libvips");
  });

  it("change to sqlite3", () => {
    write(
      "package.json",
      JSON.stringify({ name: "tmp", dependencies: { pg: "^8.19.0" } }, null, 2) + "\n",
    );
    new ChangeGenerator({ cwd: tmpDir, output: () => {}, to: "sqlite3", appName: "tmp" }).run();

    const cfg = read("src/config/database.ts");
    expect(cfg).toContain('adapter: "sqlite3"');
    expect(cfg).toContain("db/development.sqlite3");

    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies["better-sqlite3"]).toBe("^12.6.2");
    expect(pkg.dependencies.pg).toBeUndefined();
  });

  it("change to mariadb", () => {
    new ChangeGenerator({
      cwd: tmpDir,
      output: () => {},
      to: "mariadb-mysql",
      appName: "tmp",
    }).run();

    const cfg = read("src/config/database.ts");
    expect(cfg).toContain('adapter: "mysql2"');

    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies.mysql2).toBe("^3.18.2");

    const dockerfile = read("Dockerfile");
    expect(dockerfile).toContain("default-libmysqlclient-dev");
  });

  it("change from versioned dep to other versioned dep", () => {
    new ChangeGenerator({ cwd: tmpDir, output: () => {}, to: "postgresql", appName: "tmp" }).run();
    new ChangeGenerator({ cwd: tmpDir, output: () => {}, to: "mysql", appName: "tmp" }).run();
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies.mysql2).toBe("^3.18.2");
    expect(pkg.dependencies.pg).toBeUndefined();
  });

  it("no Dockerfile is a no-op", () => {
    fs.rmSync(path.join(tmpDir, "Dockerfile"));
    new ChangeGenerator({ cwd: tmpDir, output: () => {}, to: "mysql", appName: "tmp" }).run();
    expect(exists("Dockerfile")).toBe(false);
    expect(exists("src/config/database.ts")).toBe(true);
  });
});
