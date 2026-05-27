import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { AppGenerator, type AppDatabase } from "./app-generator.js";

let tmpDir: string;
let lines: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  lines = [];
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeGen(database: AppDatabase = "sqlite", opts: { skipDocker?: boolean } = {}) {
  return new AppGenerator({
    cwd: tmpDir,
    output: (m) => lines.push(m),
    appPath: "my-app",
    database,
    ...opts,
  });
}

function appPath(...segments: string[]) {
  return path.join(tmpDir, "my-app", ...segments);
}

function exists(...segments: string[]) {
  return fs.existsSync(appPath(...segments));
}

describe("AppGenerator", () => {
  it("creates application directory structure", async () => {
    await makeGen().run();

    expect(exists("package.json")).toBe(true);
    expect(exists("tsconfig.json")).toBe(true);
    expect(exists(".gitignore")).toBe(true);
    expect(exists(".gitattributes")).toBe(true);
    expect(exists(".node-version")).toBe(true);
    expect(exists("README.md")).toBe(true);
    expect(exists("config.ts")).toBe(true);
    expect(exists("Dockerfile")).toBe(true);
    expect(exists(".dockerignore")).toBe(true);

    expect(exists("bin/trails")).toBe(true);
    expect(exists("bin/setup")).toBe(true);
    expect(exists("bin/dev")).toBe(true);

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

    expect(exists("src/app/controllers/application-controller.ts")).toBe(true);
    expect(exists("src/app/controllers/concerns/.gitkeep")).toBe(true);
    expect(exists("src/app/models/application-record.ts")).toBe(true);
    expect(exists("src/app/models/concerns/.gitkeep")).toBe(true);
    expect(exists("src/app/helpers/application-helper.ts")).toBe(true);
    expect(exists("src/app/jobs/application-job.ts")).toBe(true);
    expect(exists("src/app/mailers/application-mailer.ts")).toBe(true);
    expect(exists("src/app/channels/application-cable/connection.ts")).toBe(true);
    expect(exists("src/app/channels/application-cable/channel.ts")).toBe(true);
    expect(exists("src/app/views/layouts/application.html.tse")).toBe(true);
    expect(exists("src/app/views/layouts/mailer.html.tse")).toBe(true);
    expect(exists("src/app/views/layouts/mailer.text.tse")).toBe(true);
    expect(exists("src/app/assets/stylesheets/application.css")).toBe(true);
    expect(exists("src/app/assets/images/.gitkeep")).toBe(true);
    expect(exists("vite.config.ts")).toBe(true);

    expect(exists("db/migrations/.gitkeep")).toBe(true);
    expect(exists("db/seeds.ts")).toBe(true);
    expect(exists("db/schema.ts")).toBe(true);

    expect(exists("test/test-helper.ts")).toBe(true);
    expect(exists("test/models/.gitkeep")).toBe(true);
    expect(exists("test/controllers/.gitkeep")).toBe(true);
    expect(exists("test/helpers/.gitkeep")).toBe(true);
    expect(exists("test/integration/.gitkeep")).toBe(true);
    expect(exists("test/fixtures/files/.gitkeep")).toBe(true);

    expect(exists("public/404.html")).toBe(true);
    expect(exists("public/422.html")).toBe(true);
    expect(exists("public/500.html")).toBe(true);
    expect(exists("public/robots.txt")).toBe(true);
    expect(exists("public/favicon.ico")).toBe(true);

    expect(exists("lib/tasks/.gitkeep")).toBe(true);
    expect(exists("log/.gitkeep")).toBe(true);
    expect(exists("storage/.gitkeep")).toBe(true);
    expect(exists("tmp/.gitkeep")).toBe(true);
    expect(exists("tmp/pids/.gitkeep")).toBe(true);
    expect(exists("vendor/.gitkeep")).toBe(true);
  });

  it("generates valid package.json", async () => {
    await makeGen().run();
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

  it("emits prepare hook that builds .tse views", async () => {
    await makeGen().run();
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    expect(pkg.scripts.prepare).toBe("trails-tsc-views build --views src/app/views");
    expect(pkg.scripts.postinstall).toBeUndefined();
    expect(pkg.devDependencies["@blazetrails/trails-tsc"]).toBeDefined();
    const gitignore = fs.readFileSync(appPath(".gitignore"), "utf-8");
    expect(gitignore).toContain("/.trails/");
  });

  it("exports *.tse with types before default", async () => {
    await makeGen().run();
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    const tseExport = pkg.exports["./*.tse"];
    expect(tseExport).toBeDefined();
    expect(tseExport.types).toBe("./.trails/views/*.tse.d.ts");
    expect(tseExport.default).toBe("./.trails/views/*.tse.js");
    const keys = Object.keys(tseExport);
    expect(keys.indexOf("types")).toBeLessThan(keys.indexOf("default"));
  });

  it("tsconfig includes .trails alongside src so augmentation participates in type-check", async () => {
    await makeGen().run();
    const tsconfig = JSON.parse(fs.readFileSync(appPath("tsconfig.json"), "utf-8"));
    expect(tsconfig.include).toContain(".trails/template-registry-augmentation.d.ts");
    expect(tsconfig.include).toContain("src");
    // rootDir: "src" keeps dist layout stable (dist/config/... not dist/src/config/...)
    // .d.ts files in .trails are exempt from rootDir constraints so both coexist.
    expect(tsconfig.compilerOptions.rootDir).toBe("src");
    expect(tsconfig.compilerOptions.allowArbitraryExtensions).toBe(true);
    expect(tsconfig.compilerOptions.plugins).toEqual([
      { name: "@blazetrails/trails-tsc/ts-plugin", viewsDir: "src/app/views" },
    ]);
  });

  it("configures postgres database", async () => {
    await makeGen("postgres").run();
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    expect(pkg.dependencies.pg).toBeDefined();
    const dbConfig = fs.readFileSync(appPath("src/config/database.ts"), "utf-8");
    expect(dbConfig).toContain("postgresql");
  });

  it("configures mysql database", async () => {
    await makeGen("mysql").run();
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    expect(pkg.dependencies.mysql2).toBeDefined();
    const dbConfig = fs.readFileSync(appPath("src/config/database.ts"), "utf-8");
    expect(dbConfig).toContain("mysql2");
  });

  it("configures sqlite database by default", async () => {
    await makeGen("sqlite").run();
    const dbConfig = fs.readFileSync(appPath("src/config/database.ts"), "utf-8");
    expect(dbConfig).toContain("sqlite3");
  });

  it("skips docker files when --skip-docker", async () => {
    await makeGen("sqlite", { skipDocker: true }).run();
    expect(exists("Dockerfile")).toBe(false);
    expect(exists(".dockerignore")).toBe(false);
  });

  it("includes app name in generated files", async () => {
    await makeGen().run();

    const readme = fs.readFileSync(appPath("README.md"), "utf-8");
    expect(readme).toContain("my-app");

    const appConfig = fs.readFileSync(appPath("src/config/application.ts"), "utf-8");
    expect(appConfig).toContain("my-app");

    const layout = fs.readFileSync(appPath("src/app/views/layouts/application.html.tse"), "utf-8");
    expect(layout).toContain("my-app");
  });

  it("snapshots emitted TypeScript sources", async () => {
    await makeGen().run();
    const read = (...segs: string[]) => fs.readFileSync(appPath(...segs), "utf-8");
    expect(read("src/app/controllers/application-controller.ts")).toMatchSnapshot(
      "application-controller.ts",
    );
    expect(read("src/app/models/application-record.ts")).toMatchSnapshot("application-record.ts");
    expect(read("src/app/helpers/application-helper.ts")).toMatchSnapshot("application-helper.ts");
    expect(read("src/app/jobs/application-job.ts")).toMatchSnapshot("application-job.ts");
    expect(read("src/app/mailers/application-mailer.ts")).toMatchSnapshot("application-mailer.ts");
    expect(read("src/app/channels/application-cable/connection.ts")).toMatchSnapshot(
      "connection.ts",
    );
    expect(read("src/app/channels/application-cable/channel.ts")).toMatchSnapshot("channel.ts");
    expect(read("src/config/application.ts")).toMatchSnapshot("config/application.ts");
    expect(read("src/config/routes.ts")).toMatchSnapshot("config/routes.ts");
    expect(read("src/config/puma.ts")).toMatchSnapshot("config/puma.ts");
    expect(read("src/config/cable.ts")).toMatchSnapshot("config/cable.ts");
    expect(read("src/config/storage.ts")).toMatchSnapshot("config/storage.ts");
    expect(read("src/config/environments/development.ts")).toMatchSnapshot(
      "environments/development.ts",
    );
    expect(read("src/config/environments/test.ts")).toMatchSnapshot("environments/test.ts");
    expect(read("src/config/environments/production.ts")).toMatchSnapshot(
      "environments/production.ts",
    );
    expect(read("test/test-helper.ts")).toMatchSnapshot("test-helper.ts");
    expect(read("config.ts")).toMatchSnapshot("config.ts");
    expect(read("vite.config.ts")).toMatchSnapshot("vite.config.ts");
  });
});
