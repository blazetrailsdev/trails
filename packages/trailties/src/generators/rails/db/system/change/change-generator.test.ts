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

  describe("editDevcontainerFiles", () => {
    function seedDevcontainer(dbName: string, hasService: boolean): void {
      const features: Record<string, unknown> = {
        "ghcr.io/devcontainers/features/github-cli:1": {},
      };
      if (dbName === "sqlite3") features["ghcr.io/rails/devcontainer/features/sqlite3"] = {};
      else if (dbName === "postgres")
        features["ghcr.io/rails/devcontainer/features/postgres-client"] = {};
      else if (dbName === "mysql")
        features["ghcr.io/rails/devcontainer/features/mysql-client"] = {};
      const dc: Record<string, unknown> = {
        name: "tmp",
        features,
        forwardPorts: [3000],
      };
      if (hasService) dc.containerEnv = { DB_HOST: dbName };
      write(".devcontainer/devcontainer.json", JSON.stringify(dc, null, 2) + "\n");
      const services: Record<string, unknown> = { "rails-app": { command: "sleep infinity" } };
      if (hasService) {
        (services["rails-app"] as Record<string, unknown>).depends_on = [dbName];
        services[dbName] = { image: "fake:latest" };
      }
      const compose: Record<string, unknown> = { name: "tmp", services };
      if (hasService) compose.volumes = { [`${dbName}-data`]: null };
      write(".devcontainer/compose.yaml", JSON.stringify(compose, null, 2) + "\n");
    }

    it("editDevcontainerFiles skipped when no .devcontainer dir", () => {
      run("postgresql");
      expect(exists(".devcontainer/devcontainer.json")).toBe(false);
    });

    it("change to postgresql adds service, volume, DB_HOST, feature", () => {
      seedDevcontainer("sqlite3", false);
      run("postgresql");
      const dc = JSON.parse(read(".devcontainer/devcontainer.json")) as Record<string, unknown>;
      expect((dc.containerEnv as Record<string, string>).DB_HOST).toBe("postgres");
      expect(
        (dc.features as Record<string, unknown>)[
          "ghcr.io/rails/devcontainer/features/postgres-client"
        ],
      ).toEqual({});
      expect(
        (dc.features as Record<string, unknown>)["ghcr.io/rails/devcontainer/features/sqlite3"],
      ).toBeUndefined();
      const cm = JSON.parse(read(".devcontainer/compose.yaml")) as Record<string, unknown>;
      expect((cm.services as Record<string, unknown>)["postgres"]).toBeDefined();
      expect((cm.volumes as Record<string, unknown>)["postgres-data"]).toBeDefined();
      const railsApp = (cm.services as Record<string, Record<string, unknown>>)["rails-app"];
      expect(railsApp.depends_on).toContain("postgres");
    });

    it("change to sqlite3 removes service, volume, DB_HOST, swaps feature", () => {
      seedDevcontainer("postgres", true);
      run("sqlite3");
      const dc = JSON.parse(read(".devcontainer/devcontainer.json")) as Record<string, unknown>;
      expect(dc.containerEnv).toBeUndefined();
      expect(
        (dc.features as Record<string, unknown>)["ghcr.io/rails/devcontainer/features/sqlite3"],
      ).toEqual({});
      expect(
        (dc.features as Record<string, unknown>)[
          "ghcr.io/rails/devcontainer/features/postgres-client"
        ],
      ).toBeUndefined();
      const cm = JSON.parse(read(".devcontainer/compose.yaml")) as Record<string, unknown>;
      expect((cm.services as Record<string, unknown>)["postgres"]).toBeUndefined();
      expect(cm.volumes).toBeUndefined();
      const railsApp = (cm.services as Record<string, Record<string, unknown>>)["rails-app"];
      expect(railsApp.depends_on).toBeUndefined();
    });

    it("editDevcontainerJson throws on unparseable JSON", () => {
      write(".devcontainer/devcontainer.json", "{ not json");
      expect(() => run("postgresql")).toThrow(/Could not parse .*devcontainer\.json/);
    });

    it("editComposeYaml throws on unparseable JSON", () => {
      seedDevcontainer("sqlite3", false);
      write(".devcontainer/compose.yaml", "{ not json");
      expect(() => run("postgresql")).toThrow(/Could not parse .*compose\.yaml/);
    });

    it("non-DB depends_on entries are preserved when swapping database", () => {
      seedDevcontainer("postgres", true);
      // Inject non-DB depends_on entries that the devcontainer generator may add.
      const composePath = ".devcontainer/compose.yaml";
      const compose = JSON.parse(read(composePath)) as {
        services: Record<string, { depends_on?: string[]; [k: string]: unknown }>;
        [k: string]: unknown;
      };
      (compose.services["rails-app"].depends_on ??= []).push("selenium", "redis");
      write(composePath, JSON.stringify(compose, null, 2) + "\n");
      run("mysql");
      const cm = JSON.parse(read(composePath)) as Record<string, unknown>;
      const railsApp = (cm.services as Record<string, Record<string, unknown>>)["rails-app"];
      expect(railsApp.depends_on).toContain("mysql");
      expect(railsApp.depends_on).toContain("selenium");
      expect(railsApp.depends_on).toContain("redis");
      expect(railsApp.depends_on).not.toContain("postgres");
    });

    it("change from mysql to postgresql swaps service and feature", () => {
      seedDevcontainer("mysql", true);
      run("postgresql");
      const cm = JSON.parse(read(".devcontainer/compose.yaml")) as Record<string, unknown>;
      expect((cm.services as Record<string, unknown>)["mysql"]).toBeUndefined();
      expect((cm.services as Record<string, unknown>)["postgres"]).toBeDefined();
      const dc = JSON.parse(read(".devcontainer/devcontainer.json")) as Record<string, unknown>;
      expect(
        (dc.features as Record<string, unknown>)[
          "ghcr.io/rails/devcontainer/features/mysql-client"
        ],
      ).toBeUndefined();
      expect(
        (dc.features as Record<string, unknown>)[
          "ghcr.io/rails/devcontainer/features/postgres-client"
        ],
      ).toEqual({});
    });
  });
});
