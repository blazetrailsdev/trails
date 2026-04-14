import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { AppGenerator } from "./app-generator.js";

let tmpDir: string;
let lines: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  lines = [];
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeGen() {
  return new AppGenerator({ cwd: tmpDir, output: (m) => lines.push(m) });
}

function appPath(...segments: string[]) {
  return path.join(tmpDir, "my-app", ...segments);
}

function exists(...segments: string[]) {
  return fs.existsSync(appPath(...segments));
}

describe("AppGenerator", () => {
  it("creates application directory structure", async () => {
    const gen = makeGen();
    await gen.run("my-app", { database: "sqlite" });

    // Root files
    expect(exists("package.json")).toBe(true);
    expect(exists("tsconfig.json")).toBe(true);
    expect(exists(".gitignore")).toBe(true);
    expect(exists(".gitattributes")).toBe(true);
    expect(exists(".node-version")).toBe(true);
    expect(exists("README.md")).toBe(true);
    expect(exists("config.ts")).toBe(true);
    expect(exists("Dockerfile")).toBe(true);
    expect(exists(".dockerignore")).toBe(true);

    // Bin
    expect(exists("bin/trails")).toBe(true);
    expect(exists("bin/setup")).toBe(true);
    expect(exists("bin/dev")).toBe(true);

    // Config
    expect(exists("src/config/application.ts")).toBe(true);
    expect(exists("src/config/environment.ts")).toBe(true);
    expect(exists("src/config/routes.ts")).toBe(true);
    expect(exists("src/config/database.ts")).toBe(true);
    expect(exists("src/config/puma.ts")).toBe(true);
    expect(exists("src/config/cable.ts")).toBe(true);
    expect(exists("src/config/storage.ts")).toBe(true);
    expect(exists("src/config/environments/development.ts")).toBe(true);
    expect(exists("src/config/environments/test.ts")).toBe(true);
    expect(exists("src/config/environments/production.ts")).toBe(true);
    expect(exists("src/config/initializers/content-security-policy.ts")).toBe(true);
    expect(exists("src/config/initializers/filter-parameter-logging.ts")).toBe(true);
    expect(exists("src/config/initializers/inflections.ts")).toBe(true);
    expect(exists("src/config/initializers/permissions-policy.ts")).toBe(true);
    expect(exists("src/config/locales/en.json")).toBe(true);

    // App
    expect(exists("src/app/controllers/application-controller.ts")).toBe(true);
    expect(exists("src/app/controllers/concerns/.gitkeep")).toBe(true);
    expect(exists("src/app/models/application-record.ts")).toBe(true);
    expect(exists("src/app/models/concerns/.gitkeep")).toBe(true);
    expect(exists("src/app/helpers/application-helper.ts")).toBe(true);
    expect(exists("src/app/jobs/application-job.ts")).toBe(true);
    expect(exists("src/app/mailers/application-mailer.ts")).toBe(true);
    expect(exists("src/app/channels/application-cable/connection.ts")).toBe(true);
    expect(exists("src/app/channels/application-cable/channel.ts")).toBe(true);
    expect(exists("src/app/views/layouts/application.html.ejs")).toBe(true);
    expect(exists("src/app/views/layouts/mailer.html.ejs")).toBe(true);
    expect(exists("src/app/views/layouts/mailer.text.ejs")).toBe(true);
    expect(exists("src/app/assets/stylesheets/application.css")).toBe(true);
    expect(exists("src/app/assets/images/.gitkeep")).toBe(true);
    expect(exists("vite.config.ts")).toBe(true);

    // Database
    expect(exists("db/migrations/.gitkeep")).toBe(true);
    expect(exists("db/seeds.ts")).toBe(true);
    expect(exists("db/schema.ts")).toBe(true);

    // Test
    expect(exists("test/test-helper.ts")).toBe(true);
    expect(exists("test/models/.gitkeep")).toBe(true);
    expect(exists("test/controllers/.gitkeep")).toBe(true);
    expect(exists("test/helpers/.gitkeep")).toBe(true);
    expect(exists("test/integration/.gitkeep")).toBe(true);
    expect(exists("test/fixtures/files/.gitkeep")).toBe(true);

    // Public
    expect(exists("public/404.html")).toBe(true);
    expect(exists("public/422.html")).toBe(true);
    expect(exists("public/500.html")).toBe(true);
    expect(exists("public/robots.txt")).toBe(true);
    expect(exists("public/favicon.ico")).toBe(true);

    // Directories
    expect(exists("lib/tasks/.gitkeep")).toBe(true);
    expect(exists("log/.gitkeep")).toBe(true);
    expect(exists("storage/.gitkeep")).toBe(true);
    expect(exists("tmp/.gitkeep")).toBe(true);
    expect(exists("tmp/pids/.gitkeep")).toBe(true);
    expect(exists("vendor/.gitkeep")).toBe(true);
  });

  it("generates valid package.json", async () => {
    const gen = makeGen();
    await gen.run("my-app", { database: "sqlite" });
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    expect(pkg.name).toBe("my-app");
    expect(pkg.dependencies["better-sqlite3"]).toBeDefined();
    expect(pkg.dependencies["@blazetrails/activerecord"]).toBeDefined();
    expect(pkg.dependencies["@blazetrails/activemodel"]).toBeDefined();
    expect(pkg.scripts["db:migrate"]).toBeDefined();
    expect(pkg.scripts["db:seed"]).toBeDefined();
    expect(pkg.scripts["db:setup"]).toBeDefined();
    expect(pkg.devDependencies.vite).toBeDefined();
  });

  it("configures postgres database", async () => {
    const gen = makeGen();
    await gen.run("my-app", { database: "postgres" });
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    expect(pkg.dependencies.pg).toBeDefined();
    const dbConfig = fs.readFileSync(appPath("src/config/database.ts"), "utf-8");
    expect(dbConfig).toContain("postgresql");
  });

  it("configures mysql database", async () => {
    const gen = makeGen();
    await gen.run("my-app", { database: "mysql" });
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    expect(pkg.dependencies.mysql2).toBeDefined();
    const dbConfig = fs.readFileSync(appPath("src/config/database.ts"), "utf-8");
    expect(dbConfig).toContain("mysql2");
  });

  it("configures sqlite database by default", async () => {
    const gen = makeGen();
    await gen.run("my-app", { database: "sqlite" });
    const dbConfig = fs.readFileSync(appPath("src/config/database.ts"), "utf-8");
    expect(dbConfig).toContain("sqlite3");
  });

  it("skips docker files when --skip-docker", async () => {
    const gen = makeGen();
    await gen.run("my-app", {
      database: "sqlite",

      skipDocker: true,
    });
    expect(exists("Dockerfile")).toBe(false);
    expect(exists(".dockerignore")).toBe(false);
  });

  it("includes app name in generated files", async () => {
    const gen = makeGen();
    await gen.run("my-app", { database: "sqlite" });

    const readme = fs.readFileSync(appPath("README.md"), "utf-8");
    expect(readme).toContain("my-app");

    const appConfig = fs.readFileSync(appPath("src/config/application.ts"), "utf-8");
    expect(appConfig).toContain("my-app");

    const layout = fs.readFileSync(appPath("src/app/views/layouts/application.html.ejs"), "utf-8");
    expect(layout).toContain("my-app");
  });
});
