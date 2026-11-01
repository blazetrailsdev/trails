import { stdout } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { assertNoMatch } from "@blazetrails/activesupport";
import { execFile } from "node:child_process";
import { AppGenerator, type AppDatabase } from "./rails/app/app-generator.js";
import * as Assertions from "./testing/assertions.js";

let tmpDir: string;
let lines: string[];
const destination = { destinationRoot: "" };
const assertFile = Assertions.assertFile.bind(destination);
const assertNoFile = Assertions.assertNoFile.bind(destination);
const assertNoDirectory = Assertions.assertNoDirectory.bind(destination);

function assertGem(name: string): Promise<void> {
  return assertFile("my-app/package.json", new RegExp(`"${name}": `));
}

function assertNoGem(name: string): Promise<void> {
  return assertFile("my-app/package.json", (content) => {
    assertNoMatch(new RegExp(`"${name}": `), content);
  });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  destination.destinationRoot = tmpDir;
  lines = [];
  vi.spyOn(stdout, "write").mockImplementation(
    (chunk) => lines.push(String(chunk).replace(/\n$/, "")) > 0,
  );
});

const startDir = process.cwd();
afterEach(() => {
  process.chdir(startDir);
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
  return new AppGenerator(["my-app"], { database, ...opts }, { destinationRoot: tmpDir });
}

describe("AppGeneratorTest", () => {
  it("version control initializes git repo", async () => {
    await makeGen().invokeAll();
    expect(exists(".git")).toBe(true);
  });

  it("skip git", async () => {
    await makeGen("sqlite", { skipGit: true }).invokeAll();
    expect(exists(".git")).toBe(false);
  });
});

function appPath(...segments: string[]) {
  return path.join(tmpDir, "my-app", ...segments);
}

function exists(...segments: string[]) {
  return fs.existsSync(appPath(...segments));
}

describe("AppGenerator", () => {
  it("creates application directory structure", async () => {
    await makeGen().invokeAll();

    expect(exists("package.json")).toBe(true);
    expect(exists("tsconfig.json")).toBe(true);
    expect(exists(".gitignore")).toBe(true);
    expect(exists(".gitattributes")).toBe(true);
    expect(exists(".node-version")).toBe(true);
    expect(exists("README.md")).toBe(true);
    expect(exists("config.ts")).toBe(true);
    expect(exists("Dockerfile")).toBe(true);
    expect(exists(".dockerignore")).toBe(true);
    expect(exists("eslint.config.mjs")).toBe(true);

    expect(exists("bin/eslint")).toBe(true);
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
    expect(exists("db/schema.ts")).toBe(false);

    expect(exists("test/test-helper.ts")).toBe(true);
    expect(exists("test/global-setup.ts")).toBe(true);
    expect(exists("test/models/.gitkeep")).toBe(true);
    expect(exists("test/controllers/.gitkeep")).toBe(true);
    expect(exists("test/helpers/.gitkeep")).toBe(true);
    expect(exists("test/integration/.gitkeep")).toBe(true);
    expect(exists("test/fixtures/files/.gitkeep")).toBe(true);

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
    await makeGen().invokeAll();

    expect(exists("config/puma.ts")).toBe(false);
    expect(exists("config/storage.ts")).toBe(false);
    expect(exists("app/mailers")).toBe(false);
    expect(exists("app/channels")).toBe(false);
    expect(exists("app/views/layouts/mailer.html.tse")).toBe(false);
    expect(exists("app/views/layouts/mailer.text.tse")).toBe(false);
  });

  it("keeps storage/ for a sqlite3 app with Active Storage skipped", async () => {
    await makeGen("sqlite").invokeAll();

    expect(exists("storage/.gitkeep")).toBe(true);
  });

  it("skips storage/ for a non-sqlite3 app with Active Storage skipped", async () => {
    await makeGen("postgres").invokeAll();

    expect(exists("storage")).toBe(false);
  });

  it("writes the sqlite3 database under storage/", async () => {
    await makeGen("sqlite").invokeAll();

    const config = fs.readFileSync(appPath("config/database.ts"), "utf-8");
    expect(config).toContain('database: "storage/development.sqlite3"');
    expect(config).toContain('database: "storage/test.sqlite3"');
    expect(config).toContain('database: "storage/production.sqlite3"');
  });

  it("does not ignore db/*.sqlite3 in the generated .gitignore", async () => {
    await makeGen("sqlite").invokeAll();

    const gitignore = fs.readFileSync(appPath(".gitignore"), "utf-8");
    expect(gitignore).not.toContain("sqlite3");
    expect(gitignore).toContain("/storage/*");
  });

  it("emits each subsystem's scaffolding once its skip flag is off", async () => {
    await makeGen("sqlite", UNPORTED).invokeAll();

    expect(exists("config/cable.ts")).toBe(true);
    expect(exists("config/storage.ts")).toBe(true);
    expect(exists("app/jobs/application-job.ts")).toBe(true);
    expect(exists("app/mailers/application-mailer.ts")).toBe(true);
    expect(exists("app/views/layouts/mailer.html.tse")).toBe(true);
    expect(exists("app/views/layouts/mailer.text.tse")).toBe(true);
    expect(exists("storage/.gitkeep")).toBe(true);
  });

  it("generator if skip action cable is given", async () => {
    await makeGen("sqlite", { skipActionCable: true }).invokeAll();
    await assertFile("my-app/config/application.ts", (content) => {
      expect(content).toMatch(
        /^\/\/\s+import\s+"@blazetrails\/trailties\/trailties\/action-cable";/m,
      );
    });
    expect(exists("config/cable.ts")).toBe(false);
    await assertFile("my-app/package.json", (content) => {
      assertNoMatch(/@blazetrails\/actioncable/, content);
    });
    await assertFile("my-app/config/environments/development.ts", (content) => {
      assertNoMatch(/actionCable/, content);
    });
  });

  it("implied options with conflicting option", async () => {
    await expect(
      makeGen("sqlite", { skipActiveJob: true, skipActiveStorage: false }).invokeAll(),
    ).rejects.toThrow(/conflicting option/i);
  });

  it("--api implies its options and a default run reports nothing", async () => {
    const api = new AppGenerator(["my-app"], { api: true }, { destinationRoot: tmpDir });
    expect(api.options.skipAssetPipeline).toBe(true);
    expect(api.options.skipJavascript).toBe(true);
    makeGen().reportImpliedOptions();
    expect(lines.join("\n")).not.toMatch(/will also be activated/);
    const minimal = new AppGenerator(
      ["my-app"],
      { minimal: true, skipActionText: false },
      { destinationRoot: tmpDir },
    );
    expect(() => minimal.reportImpliedOptions()).not.toThrow();
  });

  it("skip active job option", async () => {
    await makeGen("sqlite", { skipActiveJob: true }).invokeAll();

    for (const env of ["production", "development", "test"]) {
      await assertFile(`my-app/config/environments/${env}.ts`, (content) => {
        assertNoMatch(/activeJob/, content);
      });
    }
  });

  it("skip git", async () => {
    await makeGen("sqlite", { skipGit: true }).invokeAll();
    await assertNoFile("my-app/.gitignore");
    await assertNoFile("my-app/.gitattributes");
    await assertNoDirectory("my-app/.git");
  });

  it("generates valid package.json", async () => {
    await makeGen().invokeAll();
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    expect(pkg.name).toBe("my-app");
    expect(pkg.dependencies["better-sqlite3"]).toBeDefined();
    expect(pkg.dependencies["@blazetrails/activerecord"]).toBeDefined();
    expect(pkg.dependencies["@blazetrails/activemodel"]).toBeDefined();
    expect(fs.existsSync(appPath("app/jobs/application-job.ts"))).toBe(true);
    expect(pkg.dependencies["@blazetrails/activejob"]).toBeDefined();
    expect(pkg.scripts["db:migrate"]).toBeDefined();
    expect(pkg.scripts["db:seed"]).toBeDefined();
    expect(pkg.scripts["db:setup"]).toBeDefined();
    expect(pkg.devDependencies.vite).toBeDefined();
    expect(pkg.devDependencies.tsx).toBeUndefined();
    expect(pkg.devDependencies.typescript).toBe("^5.8.0");
    expect(pkg.scripts["db:seed"]).toBe("trails db seed");
    expect(pkg.scripts.dev).toBe("trails server");
    expect(pkg.scripts.trails).toBe("trails");
    const tsconfig = JSON.parse(fs.readFileSync(appPath("tsconfig.json"), "utf-8"));
    expect(tsconfig.compilerOptions.rewriteRelativeImportExtensions).toBe(true);
    expect(tsconfig.compilerOptions.erasableSyntaxOnly).toBe(true);
    const binstub = (n: string) => fs.readFileSync(appPath("bin", n), "utf-8");
    expect(binstub("trails")).toContain(
      'setAppPath(join(import.meta.dirname, "../config/application.ts"));',
    );
    expect(binstub("trails")).toContain('await import("@blazetrails/trailties/commands");');
    expect(binstub("setup")).toContain("bin/trails");
    expect(binstub("dev")).toContain('"trails"');
    for (const n of ["dev"]) {
      expect(binstub(n)).toContain("spawnSync");
      expect(binstub(n)).not.toContain('.join(" ")');
      expect(binstub(n)).toContain("fileURLToPath(import.meta.url)");
    }
    const readme = fs.readFileSync(appPath("README.md"), "utf-8");
    expect(readme).not.toMatch(/^\| `trails /m);
  });

  it("emits prepare hook that builds .tse views", async () => {
    await makeGen().invokeAll();
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    expect(pkg.scripts.prepare).toBe("trails-tsc-views build --views app/views");
    expect(pkg.scripts.postinstall).toBeUndefined();
    expect(pkg.devDependencies["@blazetrails/trails-tsc"]).toBeDefined();
    expect(pkg.dependencies["@blazetrails/date"]).toBeDefined();
    expect(pkg.devDependencies["@types/node"]).toBeDefined();
    const gitignore = fs.readFileSync(appPath(".gitignore"), "utf-8");
    expect(gitignore).toContain("/.trails/");
  });

  it("exports *.tse with types before default", async () => {
    await makeGen().invokeAll();
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    const tseExport = pkg.exports["./*.tse"];
    expect(tseExport).toBeDefined();
    expect(tseExport.types).toBe("./.trails/views/*.tse.d.ts");
    expect(tseExport.default).toBe("./.trails/views/*.tse.js");
    const keys = Object.keys(tseExport);
    expect(keys.indexOf("types")).toBeLessThan(keys.indexOf("default"));
  });

  it("tsconfig includes .trails alongside the app tree so augmentation participates in type-check", async () => {
    await makeGen().invokeAll();
    const tsconfig = JSON.parse(fs.readFileSync(appPath("tsconfig.json"), "utf-8"));
    expect(tsconfig.include).toContain(".trails/template-registry-augmentation.d.ts");
    expect(tsconfig.include).toContain(".trails/views");
    expect(tsconfig.include).toEqual(expect.arrayContaining(["app", "config", "db"]));
    expect(tsconfig.compilerOptions.rootDir).toBe(".");
    expect(tsconfig.compilerOptions.allowArbitraryExtensions).toBe(true);
    expect(tsconfig.compilerOptions.types).toEqual(["node"]);
    expect(tsconfig.compilerOptions.plugins).toEqual([
      { name: "@blazetrails/trails-tsc/ts-plugin", viewsDir: "app/views" },
    ]);
  });

  it("configures postgres database", async () => {
    await makeGen("postgres").invokeAll();
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    expect(pkg.dependencies.pg).toBeDefined();
    const dbConfig = fs.readFileSync(appPath("config/database.ts"), "utf-8");
    expect(dbConfig).toContain("postgresql");
  });

  it("configures mysql database", async () => {
    await makeGen("mysql").invokeAll();
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    expect(pkg.dependencies.mysql2).toBeDefined();
    const dbConfig = fs.readFileSync(appPath("config/database.ts"), "utf-8");
    expect(dbConfig).toContain("mysql2");
  });

  it("configures sqlite database by default", async () => {
    await makeGen("sqlite").invokeAll();
    const dbConfig = fs.readFileSync(appPath("config/database.ts"), "utf-8");
    expect(dbConfig).toContain("sqlite3");
  });

  it("sqlite database config uses the sqlite3 adapter without a side-effect driver import", async () => {
    await makeGen("sqlite").invokeAll();
    const dbConfig = fs.readFileSync(appPath("config/database.ts"), "utf-8");
    expect(dbConfig).toContain('adapter: "sqlite3"');
    expect(dbConfig).not.toContain("@blazetrails/activerecord/sqlite/");
  });

  it("--package-manager npm uses npm install in bin/setup", async () => {
    const gen = new AppGenerator(
      ["my-app"],
      { packageManager: "npm" },
      { destinationRoot: tmpDir },
    );
    await gen.invokeAll();
    const setup = fs.readFileSync(appPath("bin/setup"), "utf-8");
    expect(setup).toContain("npm install");
    expect(setup).not.toContain("pnpm");
  });

  it("--package-manager yarn uses yarn in bin/setup and Dockerfile", async () => {
    const gen = new AppGenerator(
      ["my-app"],
      { packageManager: "yarn" },
      { destinationRoot: tmpDir },
    );
    await gen.invokeAll();
    const setup = fs.readFileSync(appPath("bin/setup"), "utf-8");
    expect(setup).toContain('system("yarn")');
    const dockerfile = fs.readFileSync(appPath("Dockerfile"), "utf-8");
    expect(dockerfile).toContain("yarn.lock");
    expect(dockerfile).not.toContain("pnpm");
  });

  it("--sqlite-driver node-sqlite omits better-sqlite3 dep", async () => {
    const gen = new AppGenerator(
      ["my-app"],
      { sqliteDriver: "node-sqlite" },
      { destinationRoot: tmpDir },
    );
    await gen.invokeAll();
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    expect(pkg.dependencies["better-sqlite3"]).toBeUndefined();
    const dbConfig = fs.readFileSync(appPath("config/database.ts"), "utf-8");
    expect(dbConfig).toContain('adapter: "node-sqlite"');
    expect(dbConfig).not.toContain("@blazetrails/activerecord/sqlite/node-sqlite");
  });

  it("rejects an unknown sqlite driver", () => {
    expect(
      () =>
        new AppGenerator(
          ["my-app"],
          { sqliteDriver: "bogus-driver" as never },
          { destinationRoot: tmpDir },
        ),
    ).toThrow(/Unknown SQLite driver/);
  });

  it("scaffolds the expo-sqlite adapter for --sqlite-driver expo-sqlite", async () => {
    const gen = new AppGenerator(
      ["my-app"],
      { database: "sqlite", sqliteDriver: "expo-sqlite" },
      { destinationRoot: tmpDir },
    );
    await gen.invokeAll();
    const dbConfig = fs.readFileSync(appPath("config/database.ts"), "utf-8");
    expect(dbConfig).toContain('adapter: "expo-sqlite"');
    const pkg = JSON.parse(fs.readFileSync(appPath("package.json"), "utf-8"));
    expect(pkg.dependencies["expo-sqlite"]).toBeDefined();
    expect(pkg.dependencies["better-sqlite3"]).toBeUndefined();
  });

  it("skips docker files when --skip-docker", async () => {
    await makeGen("sqlite", { skipDocker: true }).invokeAll();
    expect(exists("Dockerfile")).toBe(false);
    expect(exists(".dockerignore")).toBe(false);
  });

  it("inclusion of eslint", async () => {
    await makeGen().invokeAll();
    await assertGem("eslint");
    await assertFile(
      "my-app/config/environments/development.ts",
      /\/\/ Apply autocorrection by ESLint to files generated by `bin\/trails generate`\./,
    );
  });

  it("eslint is skipped if required", async () => {
    await makeGen("sqlite", { skipEslint: true }).invokeAll();

    await assertNoGem("eslint");
    assertNoFile("my-app/bin/eslint");
    assertNoFile("my-app/eslint.config.mjs");
    await assertFile("my-app/config/environments/development.ts", (content) => {
      assertNoMatch(
        /\/\/ Apply autocorrection by ESLint to files generated by `bin\/trails generate`\./,
        content,
      );
    });
  });

  it("inclusion of ci files", async () => {
    await makeGen().invokeAll();
    await assertFile("my-app/.github/workflows/ci.yml");
    await assertFile("my-app/.github/dependabot.yml");
  });

  it("ci files are skipped if required", async () => {
    await makeGen("sqlite", { skipCi: true }).invokeAll();

    assertNoFile("my-app/.github/workflows/ci.yml");
    assertNoFile("my-app/.github/dependabot.yml");
  });

  it("generated files have no eslint warnings", async () => {
    await makeGen().invokeAll();
    fs.symlinkSync(
      new URL("../../../../node_modules", import.meta.url).pathname,
      appPath("node_modules"),
    );

    const { success, output } = await new Promise<{ success: boolean; output: string }>((resolve) =>
      execFile(appPath("bin/eslint"), [], { cwd: appPath() }, (error, stdout, stderr) =>
        resolve({ success: error === null, output: stdout + stderr }),
      ),
    );

    expect(success, `bin/eslint did not exit successfully:\n${output}`).toBe(true);
  }, 60_000);

  it("includes app name in generated files", async () => {
    await makeGen().invokeAll();

    const readme = fs.readFileSync(appPath("README.md"), "utf-8");
    expect(readme).toContain("my-app");

    const appConfig = fs.readFileSync(appPath("config/application.ts"), "utf-8");
    expect(appConfig).toContain("MyApp");

    const layout = fs.readFileSync(appPath("app/views/layouts/application.html.tse"), "utf-8");
    expect(layout).toContain(`contentFor("title") ?? "My App"`);
  });

  it("rejects a name whose constant is already in use", async () => {
    await expect(
      new AppGenerator(["string"], {}, { destinationRoot: "/tmp/string" }).createRoot(),
    ).rejects.toThrow(
      "Invalid application name string, constant String is already in use. Please choose another application name.",
    );
  });

  it("generates an application class that subclasses Application", async () => {
    await makeGen().invokeAll();

    const appConfig = fs.readFileSync(appPath("config/application.ts"), "utf-8");
    expect(appConfig).toContain(`import { Application } from "@blazetrails/trailties";`);
    expect(appConfig).toContain("export class MyApp extends Application {");
    expect(appConfig).toContain("Application.register(MyApp, import.meta.dirname);");

    const environment = fs.readFileSync(appPath("config/environment.ts"), "utf-8");
    expect(environment).toContain(`import "./application.ts";`);
    expect(environment).toContain("await Trails.initialize()");

    const configRu = fs.readFileSync(appPath("config.ts"), "utf-8");
    expect(configRu).toContain(`import "./config/environment.ts";`);
    expect(configRu).toContain("export default Trails.application;");
    expect(configRu).toContain("await Trails.application.loadServer();");
  });

  it("invalid application name raises an error", async () => {
    const gen = new AppGenerator(
      ["43-things"],
      { database: "sqlite" },
      { destinationRoot: tmpDir },
    );
    await expect(gen.invokeAll()).rejects.toThrow(
      "Invalid application name 43-things. Please give a name which does not start with numbers.",
    );
  });

  it("invalid application name is fixed", async () => {
    const gen = new AppGenerator(
      ["things-43"],
      { database: "sqlite" },
      { destinationRoot: tmpDir },
    );
    await gen.invokeAll();
    await assertFile("things-43/config/environment.ts", /Trails\.initialize\(\)/);
    await assertFile("things-43/config/application.ts", /^export class Things43 /m);
  });

  it("name option", async () => {
    const gen = new AppGenerator(
      ["app-dir"],
      { name: "my-app", database: "sqlite" },
      { destinationRoot: tmpDir },
    );
    await gen.invokeAll();
    await assertFile("app-dir/config/application.ts", /^export class MyApp /m);
  });

  it("types drawRoutes against Mapper", async () => {
    await makeGen().invokeAll();

    const routes = fs.readFileSync(appPath("config/routes.ts"), "utf-8");
    expect(routes).toContain(`import { Trails } from "@blazetrails/trailties";`);
    expect(routes).toContain("Trails.application.routes().draw(function () {");
    expect(routes).not.toContain(": any");
  });

  it("snapshots emitted TypeScript sources", async () => {
    await makeGen("sqlite", UNPORTED).invokeAll();
    const read = (...segs: string[]) => fs.readFileSync(appPath(...segs), "utf-8");
    expect(read("app/controllers/application-controller.ts")).toMatchSnapshot(
      "application-controller.ts",
    );
    expect(read("app/models/application-record.ts")).toMatchSnapshot("application-record.ts");
    expect(read("app/helpers/application-helper.ts")).toMatchSnapshot("application-helper.ts");
    expect(read("app/jobs/application-job.ts")).toMatchSnapshot("application-job.ts");
    expect(read("app/mailers/application-mailer.ts")).toMatchSnapshot("application-mailer.ts");
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
    expect(read("test/global-setup.ts")).toMatchSnapshot("global-setup.ts");
    expect(read("config.ts")).toMatchSnapshot("config.ts");
    expect(read("vite.config.ts")).toMatchSnapshot("vite.config.ts");
  });

  it("template from absolute path", async () => {
    const template = path.join(tmpDir, "template.mjs");
    fs.writeFileSync(template, 'export default (g) => g.say("It works from file!");\n');
    await makeGen("sqlite", { template } as never).invokeAll();
    expect(lines.join("\n")).toMatch("It works from file!");
  });

  it("template raises an error with invalid path", async () => {
    const content = makeGen("sqlite", { template: "non/existent/path" } as never).invokeAll();
    await expect(content).rejects.toThrow(/The template \[.*\] could not be loaded/);
    await expect(content).rejects.toThrow(/non\/existent\/path/);
  });
});
