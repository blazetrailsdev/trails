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
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  seedPackageJson();
  seedDockerfile();
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function run(to: string, opts: { appName?: string; output?: (m: string) => void } = {}) {
  return new ChangeGenerator({
    cwd: tmpDir,
    output: opts.output ?? (() => {}),
    to,
    appName: opts.appName ?? "tmp",
  }).run();
}

describe("ChangeGeneratorTest", () => {
  it("change to invalid database", () => {
    expect(() => new ChangeGenerator({ cwd: tmpDir, output: () => {}, to: "invalid-db" })).toThrow(
      /Invalid value for --to option\. Supported preconfigurations are: mysql, postgresql, sqlite3, mariadb-mysql\./,
    );
  });

  it("appName defaults to basename of cwd", () => {
    new ChangeGenerator({ cwd: tmpDir, output: () => {}, to: "postgresql" }).run();
    expect(read("src/config/database.ts")).toContain(
      `database: "${path.basename(tmpDir)}_development"`,
    );
  });

  it("change to postgresql", () => {
    run("postgresql");
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
    run("mysql");
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
    write("package.json", JSON.stringify({ dependencies: { pg: "^8.19.0" } }) + "\n");
    run("sqlite3");
    expect(read("src/config/database.ts")).toContain("db/development.sqlite3");
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies["better-sqlite3"]).toBe("^12.6.2");
    expect(pkg.dependencies.pg).toBeUndefined();
  });

  it("change to mariadb", () => {
    run("mariadb-mysql");
    expect(read("src/config/database.ts")).toContain('adapter: "mysql2"');
    expect(JSON.parse(read("package.json")).dependencies.mysql2).toBe("^3.18.2");
    expect(read("Dockerfile")).toContain("default-libmysqlclient-dev");
  });

  it("change from versioned dep to other versioned dep", () => {
    run("postgresql");
    run("mysql");
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies.mysql2).toBe("^3.18.2");
    expect(pkg.dependencies.pg).toBeUndefined();
  });

  it("no Dockerfile is a no-op", () => {
    fs.rmSync(path.join(tmpDir, "Dockerfile"));
    run("mysql");
    expect(exists("Dockerfile")).toBe(false);
    expect(exists("src/config/database.ts")).toBe(true);
  });

  it("editDatabaseConfig targets existing config/database.ts when present", () => {
    write("config/database.ts", "// existing\n");
    run("postgresql");
    expect(read("config/database.ts")).toContain('adapter: "postgresql"');
    expect(exists("src/config/database.ts")).toBe(false);
  });

  it("editPackageJson throws on unparseable JSON", () => {
    write("package.json", "{ this is not json");
    expect(() => run("mysql")).toThrow(/Could not parse .*package\.json/);
  });

  it("editDatabaseConfig fallback honors isTypeScript()", () => {
    fs.rmSync(path.join(tmpDir, "tsconfig.json"));
    run("postgresql");
    expect(exists("src/config/database.js")).toBe(true);
    expect(exists("src/config/database.ts")).toBe(false);
  });

  it("editDockerfile prefers longest-match alternation", () => {
    // sqlite's build list ("build-essential git") is a prefix of pg's
    // ("build-essential git libpq-dev"); first-match alternation would
    // truncate. Verify the full line is replaced.
    write("Dockerfile", "RUN apt-get install -y build-essential git libpq-dev\n");
    run("mysql");
    expect(read("Dockerfile")).toBe(
      "RUN apt-get install -y build-essential default-libmysqlclient-dev git\n",
    );
  });

  it("editDockerfile does not match inside a longer word token", () => {
    // \b boundaries (mirroring Rails change_generator.rb) prevent matching
    // when a canonical token is the prefix of a longer word like "gitlab-cli".
    write("Dockerfile", "RUN apt-get install -y build-essential gitlab-cli\n");
    run("postgresql");
    expect(read("Dockerfile")).toBe("RUN apt-get install -y build-essential gitlab-cli\n");
  });

  it("editDockerfile is a no-op when no DB package lines match", () => {
    write("Dockerfile", "FROM node:22-slim\nRUN echo hello\n");
    const calls: string[] = [];
    run("mysql", { output: (m) => calls.push(m) });
    expect(read("Dockerfile")).toBe("FROM node:22-slim\nRUN echo hello\n");
    expect(calls.some((m) => m.includes("Dockerfile"))).toBe(false);
  });
});
