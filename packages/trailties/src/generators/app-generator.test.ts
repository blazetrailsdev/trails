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

const UNPORTED = {
  skipActionCable: false,
  skipActionMailer: false,
  skipActiveJob: false,
  skipActiveStorage: false,
};

function makeGen(
  database: AppDatabase = "sqlite",
  opts: { skipDocker?: boolean; [k: `skip${string}`]: boolean | undefined } = {},
) {
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

    expect(exists("config/application.ts")).toBe(true);
    expect(exists("config/environment.ts")).toBe(true);
    expect(exists("config/routes.ts")).toBe(true);
    expect(exists("config/database.ts")).toBe(true);
    expect(exists("config/environments/development.ts")).toBe(true);
    expect(exists("config/environments/test.ts")).toBe(true);
    expect(exists("config/environments/production.ts")).toBe(true);
    expect(exists("config/initializers/content-security-policy.ts")).toBe(true);
    expect(exists("config/initializers/filter-parameter-logging.ts")).toBe(true);
    expect(exists("config/initializers/inflections.ts")).toBe(true);
    expect(exists("config/initializers/permissions-policy.ts")).toBe(true);
    expect(exists("config/locales/en.json")).toBe(true);

    expect(exists("app/controllers/application-controller.ts")).toBe(true);
    expect(exists("app/controllers/concerns/.gitkeep")).toBe(true);
    expect(exists("app/models/application-record.ts")).toBe(true);
    expect(exists("app/models/concerns/.gitkeep")).toBe(true);
    expect(exists("app/helpers/application-helper.ts")).toBe(true);
    expect(exists("app/views/layouts/application.html.tse")).toBe(true);
    expect(exists("app/assets/stylesheets/application.css")).toBe(true);
    expect(exists("app/assets/images/.gitkeep")).toBe(true);
    expect(exists("vite.config.ts")).toBe(true);

    expect(exists("db/migrate/.gitkeep")).toBe(true);
    expect(exists("db/seeds.ts")).toBe(true);
    expect(exists("db/schema.ts")).toBe(true);

    expect(exists("test/test-helper.ts")).toBe(true);
    expect(exists("test/models/.gitkeep")).toBe(true);
    expect(exists("test/controllers/.gitkeep")).toBe(true);
    expect(exists("test/helpers/.gitkeep")).toBe(true);
    expect(exists("test/integration/.gitkeep")).toBe(true);
    expect(exists("test/fixtures/files/.gitkeep")).toBe(true);

    // Rails ships no `public/index.html` — a new app's welcome page is a route
    // to `Rails::WelcomeController`, and one on disk would shadow the root
    // route `add_internal_routes` appends (`finisher.rb:148-152`).
    expect(exists("public/index.html")).toBe(false);
    expect(exists("public/404.html")).toBe(true);
    expect(exists("public/422.html")).toBe(true);
    expect(exists("public/500.html")).toBe(true);
    expect(exists("public/robots.txt")).toBe(true);
    expect(exists("public/favicon.ico")).toBe(true);

    expect(exists("lib/tasks/.gitkeep")).toBe(true);
    expect(exists("log/.gitkeep")).toBe(true);
    expect(exists("tmp/.gitkeep")).toBe(true);
    expect(exists("tmp/pids/.gitkeep")).toBe(true);
    expect(exists("vendor/.gitkeep")).toBe(true);
  });

  it("skips scaffolding for subsystems trails has no package for", async () => {
    await makeGen().run();

    expect(exists("config/puma.ts")).toBe(false);
    expect(exists("config/cable.ts")).toBe(false);
    expect(exists("config/storage.ts")).toBe(false);
    expect(exists("app/jobs")).toBe(false);
    expect(exists("app/mailers")).toBe(false);
    expect(exists("app/channels")).toBe(false);
    expect(exists("app/views/layouts/mailer.html.tse")).toBe(false);
    expect(exists("app/views/layouts/mailer.text.tse")).toBe(false);
    expect(exists("storage")).toBe(false);
  });

  it("emits each subsystem's scaffolding once its skip flag is off", async () => {
    await makeGen("sqlite", UNPORTED).run();

    expect(exists("config/cable.ts")).toBe(true);
    expect(exists("config/storage.ts")).toBe(true);
    expect(exists("app/jobs/application-job.ts")).toBe(true);
    expect(exists("app/mailers/application-mailer.ts")).toBe(true);
    expect(exists("app/channels/application-cable/connection.ts")).toBe(true);
    expect(exists("app/channels/application-cable/channel.ts")).toBe(true);
    expect(exists("app/views/layouts/mailer.html.tse")).toBe(true);
    expect(exists("app/views/layouts/mailer.text.tse")).toBe(true);
    expect(exists("storage/.gitkeep")).toBe(true);
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
    expect(pkg.devDependencies.tsx).toBeDefined();
    // Every CLI command that executes application code enters through the tsx
    // loader; a bare `trails db seed` cannot resolve the `.js` specifiers a
    // Node16 `.ts` source spells.
    expect(pkg.scripts["db:seed"]).toContain("tsx");
    expect(pkg.scripts.dev).toContain("tsx");
    expect(pkg.scripts.trails).toContain("tsx");
  });

  it("emits prepare hook that builds .tse views", async () => {
    await makeGen().run();
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    expect(pkg.scripts.prepare).toBe("trails-tsc-views build --views app/views");
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

  it("tsconfig includes .trails alongside the app tree so augmentation participates in type-check", async () => {
    await makeGen().run();
    const tsconfig = JSON.parse(fs.readFileSync(appPath("tsconfig.json"), "utf-8"));
    expect(tsconfig.include).toContain(".trails/template-registry-augmentation.d.ts");
    expect(tsconfig.include).toEqual(expect.arrayContaining(["app", "config", "db"]));
    // rootDir: "." keeps dist layout stable (dist/config/... mirrors the source tree).
    // .d.ts files in .trails are exempt from rootDir constraints so both coexist.
    expect(tsconfig.compilerOptions.rootDir).toBe(".");
    expect(tsconfig.compilerOptions.allowArbitraryExtensions).toBe(true);
    expect(tsconfig.compilerOptions.plugins).toEqual([
      { name: "@blazetrails/trails-tsc/ts-plugin", viewsDir: "app/views" },
    ]);
  });

  it("configures postgres database", async () => {
    await makeGen("postgres").run();
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    expect(pkg.dependencies.pg).toBeDefined();
    const dbConfig = fs.readFileSync(appPath("config/database.ts"), "utf-8");
    expect(dbConfig).toContain("postgresql");
  });

  it("configures mysql database", async () => {
    await makeGen("mysql").run();
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    expect(pkg.dependencies.mysql2).toBeDefined();
    const dbConfig = fs.readFileSync(appPath("config/database.ts"), "utf-8");
    expect(dbConfig).toContain("mysql2");
  });

  it("configures sqlite database by default", async () => {
    await makeGen("sqlite").run();
    const dbConfig = fs.readFileSync(appPath("config/database.ts"), "utf-8");
    expect(dbConfig).toContain("sqlite3");
  });

  it("sqlite database config uses the sqlite3 adapter without a side-effect driver import", async () => {
    await makeGen("sqlite").run();
    const dbConfig = fs.readFileSync(appPath("config/database.ts"), "utf-8");
    expect(dbConfig).toContain('adapter: "sqlite3"');
    expect(dbConfig).not.toContain("@blazetrails/activerecord/sqlite/");
  });

  it("--package-manager npm uses npm install in bin/setup", async () => {
    const gen = new AppGenerator({
      cwd: tmpDir,
      output: (m) => lines.push(m),
      appPath: "my-app",
      packageManager: "npm",
    });
    await gen.run();
    const setup = fs.readFileSync(appPath("bin/setup"), "utf-8");
    expect(setup).toContain("npm install");
    expect(setup).not.toContain("pnpm");
  });

  it("--package-manager yarn uses yarn in bin/setup and Dockerfile", async () => {
    const gen = new AppGenerator({
      cwd: tmpDir,
      output: (m) => lines.push(m),
      appPath: "my-app",
      packageManager: "yarn",
    });
    await gen.run();
    const setup = fs.readFileSync(appPath("bin/setup"), "utf-8");
    expect(setup).toContain('system("yarn")');
    const dockerfile = fs.readFileSync(appPath("Dockerfile"), "utf-8");
    expect(dockerfile).toContain("yarn.lock");
    expect(dockerfile).not.toContain("pnpm");
  });

  it("--sqlite-driver node-sqlite omits better-sqlite3 dep", async () => {
    const gen = new AppGenerator({
      cwd: tmpDir,
      output: (m) => lines.push(m),
      appPath: "my-app",
      sqliteDriver: "node-sqlite",
    });
    await gen.run();
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    expect(pkg.dependencies["better-sqlite3"]).toBeUndefined();
    const dbConfig = fs.readFileSync(appPath("config/database.ts"), "utf-8");
    expect(dbConfig).toContain('adapter: "node-sqlite"');
    expect(dbConfig).not.toContain("@blazetrails/activerecord/sqlite/node-sqlite");
  });

  it("rejects an unknown sqlite driver", () => {
    expect(
      () =>
        new AppGenerator({
          cwd: tmpDir,
          output: (m) => lines.push(m),
          appPath: "my-app",
          sqliteDriver: "bogus-driver" as never,
        }),
    ).toThrow(/Unknown SQLite driver/);
  });

  it("scaffolds the expo-sqlite adapter for --sqlite-driver expo-sqlite", async () => {
    const gen = new AppGenerator({
      cwd: tmpDir,
      output: (m) => lines.push(m),
      appPath: "my-app",
      database: "sqlite",
      sqliteDriver: "expo-sqlite",
    });
    await gen.run();
    const dbConfig = fs.readFileSync(appPath("config/database.ts"), "utf-8");
    expect(dbConfig).toContain('adapter: "expo-sqlite"');
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    expect(pkg.dependencies["expo-sqlite"]).toBeDefined();
    expect(pkg.dependencies["better-sqlite3"]).toBeUndefined();
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

    const appConfig = fs.readFileSync(appPath("config/application.ts"), "utf-8");
    expect(appConfig).toContain("MyApp");

    const layout = fs.readFileSync(appPath("app/views/layouts/application.html.tse"), "utf-8");
    expect(layout).toContain("my-app");
  });

  it("generates an application class that subclasses Application", async () => {
    await makeGen().run();

    const appConfig = fs.readFileSync(appPath("config/application.ts"), "utf-8");
    expect(appConfig).toContain(`import { Application } from "@blazetrails/trailties";`);
    expect(appConfig).toContain("export class MyApp extends Application {");
    expect(appConfig).toContain("Application.register(MyApp);");

    const environment = fs.readFileSync(appPath("config/environment.ts"), "utf-8");
    expect(environment).toContain(`import "./application.js";`);
    expect(environment).toContain("await Trails.initialize()");

    const configRu = fs.readFileSync(appPath("config.ts"), "utf-8");
    expect(configRu).toContain(`import "./config/environment.js";`);
    expect(configRu).toContain("export default Trails.application;");
  });

  it("invalid application name raises an error", async () => {
    const gen = new AppGenerator({
      cwd: tmpDir,
      output: (m) => lines.push(m),
      appPath: "43-things",
      database: "sqlite",
    });
    await expect(gen.run()).rejects.toThrow(
      "Invalid application name 43-things. Please give a name which does not start with numbers.",
    );
  });

  it("invalid application name is fixed", async () => {
    const gen = new AppGenerator({
      cwd: tmpDir,
      output: (m) => lines.push(m),
      appPath: "things-43",
      database: "sqlite",
    });
    await gen.run();
    const read = (...segs: string[]) =>
      fs.readFileSync(path.join(tmpDir, "things-43", ...segs), "utf-8");
    expect(read("config/environment.ts")).toMatch(/Trails\.initialize\(\)/);
    expect(read("config/application.ts")).toMatch(/^export class Things43 /m);
  });

  it("types drawRoutes against Mapper", async () => {
    await makeGen().run();

    const routes = fs.readFileSync(appPath("config/routes.ts"), "utf-8");
    expect(routes).toContain(`import type { Mapper } from "@blazetrails/actionpack";`);
    expect(routes).toContain("export function drawRoutes(mapper: Mapper): void {");
    expect(routes).not.toContain(": any");
  });

  it("snapshots emitted TypeScript sources", async () => {
    await makeGen("sqlite", UNPORTED).run();
    const read = (...segs: string[]) => fs.readFileSync(appPath(...segs), "utf-8");
    expect(read("app/controllers/application-controller.ts")).toMatchSnapshot(
      "application-controller.ts",
    );
    expect(read("app/models/application-record.ts")).toMatchSnapshot("application-record.ts");
    expect(read("app/helpers/application-helper.ts")).toMatchSnapshot("application-helper.ts");
    expect(read("app/jobs/application-job.ts")).toMatchSnapshot("application-job.ts");
    expect(read("app/mailers/application-mailer.ts")).toMatchSnapshot("application-mailer.ts");
    expect(read("app/channels/application-cable/connection.ts")).toMatchSnapshot("connection.ts");
    expect(read("app/channels/application-cable/channel.ts")).toMatchSnapshot("channel.ts");
    expect(read("config/application.ts")).toMatchSnapshot("config/application.ts");
    expect(read("config/routes.ts")).toMatchSnapshot("config/routes.ts");
    expect(read("config/cable.ts")).toMatchSnapshot("config/cable.ts");
    expect(read("config/storage.ts")).toMatchSnapshot("config/storage.ts");
    expect(read("config/environments/development.ts")).toMatchSnapshot(
      "environments/development.ts",
    );
    expect(read("config/environments/test.ts")).toMatchSnapshot("environments/test.ts");
    expect(read("config/environments/production.ts")).toMatchSnapshot("environments/production.ts");
    expect(read("test/test-helper.ts")).toMatchSnapshot("test-helper.ts");
    expect(read("config.ts")).toMatchSnapshot("config.ts");
    expect(read("vite.config.ts")).toMatchSnapshot("vite.config.ts");
  });
});
