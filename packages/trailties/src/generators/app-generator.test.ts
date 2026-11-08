import { Dir, File, FileUtils, Gem, Process, rbFBackquote } from "@blazetrails/ruby-compat";
import { assertNoChanges, assertNoMatch, capture } from "@blazetrails/activesupport";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppGenerator } from "./trails/app/app-generator.js";
import { TestCase } from "./test-case.js";
import { runAppUpdate } from "./generators-test-helper.js";
import { VERSION } from "../gem-version.js";
import { Application } from "../application.js";
import { Trails } from "../trails.js";

class AppGeneratorApp extends Application {}
const destinationRoot = Dir.mktmpdir();
const templateRoot = Dir.mktmpdir();

class AppGeneratorTest extends TestCase {}
AppGeneratorTest.destination(destinationRoot);
AppGeneratorTest.tests(AppGenerator);
AppGeneratorTest.arguments([destinationRoot]);
registerSpecType(/^AppGenerator(Test)?$/, AppGeneratorTest);
let t: TestCase;

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  Trails.application = AppGeneratorApp.instance();
});

afterEach(() => {
  Trails.application = null;
});

afterAll(async () => {
  await FileUtils.rmRfAsync([destinationRoot, templateRoot]);
});

const UNPORTED = [
  "--no-skip-action-cable",
  "--no-skip-action-mailer",
  "--no-skip-active-job",
  "--no-skip-active-storage",
];

function assertGem(name: string): Promise<void> {
  return t.assertFile("package.json", new RegExp(`"${name}": `));
}

function assertNoGem(name: string): Promise<void> {
  return t.assertFile("package.json", (content: string) => {
    assertNoMatch(new RegExp(`"${name}": `), content);
  });
}

function json(content: string) {
  return JSON.parse(content);
}

describe("AppGeneratorTest", () => {
  it("version control initializes git repo", async () => {
    await t.runGenerator([t.destinationRoot]);
    await t.assertDirectory(".git");
  });

  it("app update", async () => {
    await t.runGenerator();

    const defaultsPath = `config/initializers/new-framework-defaults-${VERSION.MAJOR}-${VERSION.MINOR}.ts`;

    t.assertNoFile(defaultsPath);
    t.assertNoFile("config/initializers/cors.ts");

    await runAppUpdate.call(t);

    await t.assertFile(defaultsPath);
    t.assertNoFile("config/initializers/cors.ts");
  });

  it("app update supports skip", async () => {
    await t.runGenerator();
    await Dir.chdir(t.destinationRoot, async () => {
      const config = "config/application.ts";
      await File.open(config, "a", (file) => file.puts("// some configuration"));
      await assertNoChanges(
        () => File.readlinesAsync(config),
        null,
        {},
        () => runAppUpdate.call(t, t.destinationRoot, { flags: "--skip" }),
      );
    });
  });

  it("app update supports pretend", async () => {
    await t.runGenerator();
    await Dir.chdir(t.destinationRoot, async () => {
      const config = "config/application.ts";
      await File.open(config, "a", (file) => file.puts("// some configuration"));
      await assertNoChanges(
        () => File.readlinesAsync(config),
        null,
        {},
        () => runAppUpdate.call(t, t.destinationRoot, { flags: "--pretend --force" }),
      );
      const defaultsPath = `config/initializers/new-framework-defaults-${VERSION.MAJOR}-${VERSION.MINOR}.ts`;
      t.assertNoFile(defaultsPath);
    });
  });

  it("app update does not remove rack cors if already present", async () => {
    await t.runGenerator();
    await FileUtils.touchAsync(`${t.destinationRoot}/config/initializers/cors.ts`);
    await runAppUpdate.call(t);

    await t.assertFile("config/initializers/cors.ts");
  });

  it("app update generates public folders", async () => {
    await t.runGenerator();

    await FileUtils.rmRfAsync(`${t.destinationRoot}/public/406-unsupported-browser.html`);

    await runAppUpdate.call(t);

    await t.assertFile("public/406-unsupported-browser.html");
  });

  it("app update preserves skip active job", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-active-job"]);

    await Dir.chdir(t.destinationRoot, async () => {
      const config = "config/application.ts";
      await assertNoChanges(
        async () => (await File.readlinesAsync(config)).filter((l) => /import /.test(l)),
        null,
        {},
        () => runAppUpdate.call(t),
      );
    });
  });

  it("app update preserves skip action mailbox", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-action-mailbox"]);

    await Dir.chdir(t.destinationRoot, async () => {
      const config = "config/application.ts";
      await assertNoChanges(
        async () => (await File.readlinesAsync(config)).filter((l) => /import /.test(l)),
        null,
        {},
        () => runAppUpdate.call(t),
      );
    });
  });

  it("app update preserves skip action text", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-action-text"]);

    await Dir.chdir(t.destinationRoot, async () => {
      const config = "config/application.ts";
      await assertNoChanges(
        async () => (await File.readlinesAsync(config)).filter((l) => /import /.test(l)),
        null,
        {},
        () => runAppUpdate.call(t),
      );
    });
  });

  it("app update preserves skip brakeman", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-brakeman"]);

    await Dir.chdir(t.destinationRoot, async () => {
      await assertNoChanges(
        () => File.isExist("bin/brakeman"),
        null,
        {},
        () => runAppUpdate.call(t),
      );
    });
  });

  it("app update preserves skip eslint", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-eslint"]);

    await Dir.chdir(t.destinationRoot, async () => {
      await assertNoChanges(
        () => File.isExist("bin/eslint"),
        null,
        {},
        () => runAppUpdate.call(t),
      );
    });
  });

  it("app update preserves skip thruster", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-thruster"]);

    await Dir.chdir(t.destinationRoot, async () => {
      await assertNoChanges(
        () => File.isExist("bin/thrust"),
        null,
        {},
        () => runAppUpdate.call(t),
      );
    });
  });

  it("app update preserves skip test", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-test"]);

    await Dir.chdir(t.destinationRoot, async () => {
      const config = "config/application.ts";
      await assertNoChanges(
        async () => (await File.readlinesAsync(config)).filter((l) => /import /.test(l)),
        null,
        {},
        () => runAppUpdate.call(t),
      );
    });
  });

  it("edge option", async () => {
    const stub = vi.spyOn(Trails, "gemVersion").mockReturnValue(new Gem.Version("2.1.0"));
    try {
      await t.runGenerator([t.destinationRoot, "--edge"]);
    } finally {
      stub.mockRestore();
    }
    await t.assertFile(
      "package.json",
      /"@blazetrails\/trailties": "github:blazetrailsdev\/trails#2-1-stable&path:\/packages\/trailties"/,
    );
  });

  it("edge option during alpha", async () => {
    const stub = vi.spyOn(Trails, "gemVersion").mockReturnValue(new Gem.Version("2.1.0.alpha"));
    try {
      await t.runGenerator([t.destinationRoot, "--edge"]);
    } finally {
      stub.mockRestore();
    }
    await t.assertFile(
      "package.json",
      /"@blazetrails\/trailties": "github:blazetrailsdev\/trails#main&path:\/packages\/trailties"/,
    );
  });

  it("main option", async () => {
    await t.runGenerator([t.destinationRoot, "--main"]);
    await t.assertFile(
      "package.json",
      /"@blazetrails\/trailties": "github:blazetrailsdev\/trails#main&path:\/packages\/trailties"/,
    );
  });

  it("master option", async () => {
    await t.runGenerator([t.destinationRoot, "--master"]);
    await t.assertFile(
      "package.json",
      /"@blazetrails\/trailties": "github:blazetrailsdev\/trails#main&path:\/packages\/trailties"/,
    );
  });

  it("skip git", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-git", "--full"]);
    t.assertNoFile(".gitignore");
    t.assertNoFile(".gitattributes");
    t.assertNoDirectory(".git");
  });

  it("generator if skip action cable is given", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-action-cable"]);
    await t.assertFile(
      "config/application.ts",
      /^\/\/\s+import\s+"@blazetrails\/trailties\/trailties\/action-cable";/m,
    );
    t.assertNoFile("config/cable.ts");
    await t.assertFile("package.json", (content: string) => {
      assertNoMatch(/"redis"/, content);
    });
  });

  it("implied options with conflicting option", async () => {
    await expect(
      t.runGenerator([t.destinationRoot, "--skip-active-job", "--no-skip-active-storage"]),
    ).rejects.toThrow(/conflicting option/i);
  });

  it("skip active job option", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-active-job"]);

    for (const env of ["production", "development", "test"]) {
      await t.assertFile(`config/environments/${env}.ts`, (content: string) => {
        assertNoMatch(/activeJob/, content);
      });
    }
  });

  it("inclusion of eslint", async () => {
    await t.runGenerator();
    await assertGem("eslint");
    await t.assertFile(
      "config/environments/development.ts",
      /\/\/ Apply autocorrection by ESLint to files generated by `bin\/trails generate`\./,
    );
  });

  it("eslint is skipped if required", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-eslint"]);

    await assertNoGem("eslint");
    t.assertNoFile("bin/eslint");
    t.assertNoFile("eslint.config.mjs");
    await t.assertFile("config/environments/development.ts", (content: string) => {
      assertNoMatch(
        /\/\/ Apply autocorrection by ESLint to files generated by `bin\/trails generate`\./,
        content,
      );
    });
  });

  it("inclusion of ci files", async () => {
    await t.runGenerator();
    await t.assertFile(".github/workflows/ci.yml");
    await t.assertFile(".github/dependabot.yml");
  });

  it("ci files are skipped if required", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-ci"]);

    t.assertNoFile(".github/workflows/ci.yml");
    t.assertNoFile(".github/dependabot.yml");
  });

  it("generated files have no eslint warnings", async () => {
    await t.runGenerator();
    await FileUtils.lnSAsync(
      new URL("../../../../node_modules", import.meta.url).pathname,
      File.join(t.destinationRoot, "node_modules"),
    );

    await Dir.chdir(t.destinationRoot, async () => {
      const output = await rbFBackquote("./bin/eslint 2>&1");

      expect(
        Process.lastStatus!.isSuccess(),
        `bin/eslint did not exit successfully:\n${output}`,
      ).toBe(true);
    });
  }, 60_000);

  it("invalid application name raises an error", async () => {
    const content = await capture("stderr", () =>
      t.runGenerator([File.join(t.destinationRoot, "43-things")]),
    );
    expect(content).toBe(
      "Invalid application name 43-things. Please give a name which does not start with numbers.\n",
    );
  });

  it("invalid application name is fixed", async () => {
    await t.runGenerator([File.join(t.destinationRoot, "things-43")]);
    await t.assertFile("things-43/config/environment.ts", /Trails\.initialize\(\)/);
    await t.assertFile("things-43/config/application.ts", /^export class Things43 /m);
  });

  it("name option", async () => {
    await t.runGenerator([t.destinationRoot, "--name=my-app"]);
    await t.assertFile("config/application.ts", /^export class MyApp /m);
  });

  it("template from absolute path", async () => {
    const template = File.join(templateRoot, "template.mjs");
    await File.writeAsync(template, 'export default (g) => g.say("It works from file!");\n');
    expect(await t.runGenerator([t.destinationRoot, "-m", template])).toMatch(
      "It works from file!",
    );
  });

  it("template raises an error with invalid path", async () => {
    const content = await capture("stderr", () =>
      t.runGenerator([t.destinationRoot, "-m", "non/existent/path"]),
    );

    expect(content).toMatch(/The template \[.*\] could not be loaded/);
    expect(content).toMatch(/non\/existent\/path/);
  });
});

describe("AppGenerator", () => {
  it("creates application directory structure", async () => {
    await t.runGenerator();

    for (const path of [
      "package.json",
      "tsconfig.json",
      ".gitignore",
      ".gitattributes",
      ".node-version",
      "README.md",
      "config.ts",
      "Dockerfile",
      ".dockerignore",
      "eslint.config.mjs",
      "bin/eslint",
      "bin/trails",
      "bin/setup",
      "bin/dev",
      "config/application.ts",
      "config/environment.ts",
      "config/routes.ts",
      "config/database.ts",
      "config/environments/development.ts",
      "config/environments/test.ts",
      "config/environments/production.ts",
      "config/initializers/content-security-policy.ts",
      "config/initializers/filter-parameter-logging.ts",
      "config/initializers/inflections.ts",
      "config/initializers/permissions-policy.ts",
      "config/locales/en.json",
      "app/controllers/application-controller.ts",
      "app/controllers/concerns/.keep",
      "app/models/application-record.ts",
      "app/models/concerns/.keep",
      "app/helpers/application-helper.ts",
      "app/views/layouts/application.html.tse",
      "app/assets/stylesheets/application.css",
      "app/assets/images/.keep",
      "vite.config.ts",
      "db/seeds.ts",
      "test/test-helper.ts",
      "test/global-setup.ts",
      "test/models/.keep",
      "test/controllers/.keep",
      "test/helpers/.keep",
      "test/integration/.keep",
      "test/fixtures/files/.keep",
      "public/404.html",
      "public/422.html",
      "public/500.html",
      "public/robots.txt",
      "public/favicon.ico",
      "lib/tasks/.keep",
      "log/.keep",
      "tmp/.keep",
      "tmp/pids/.keep",
      "vendor/.keep",
    ])
      await t.assertFile(path);
    t.assertNoFile("db/schema.ts");
    t.assertNoFile("public/index.html");
  });

  it("skips scaffolding for subsystems trails has no package for", async () => {
    await t.runGenerator();

    for (const path of [
      "config/puma.ts",
      "config/storage.ts",
      "app/mailers",
      "app/channels",
      "app/views/layouts/mailer.html.tse",
      "app/views/layouts/mailer.text.tse",
    ])
      t.assertNoFile(path);
  });

  it("keeps storage/ for a sqlite3 app with Active Storage skipped", async () => {
    await t.runGenerator([t.destinationRoot, "--database=sqlite3"]);

    await t.assertFile("storage/.keep");
  });

  it("skips storage/ for a non-sqlite3 app with Active Storage skipped", async () => {
    await t.runGenerator([t.destinationRoot, "--database=postgresql"]);

    t.assertNoDirectory("storage");
  });

  it("writes the sqlite3 database under storage/", async () => {
    await t.runGenerator([t.destinationRoot, "--database=sqlite3"]);

    await t.assertFile("config/database.ts", (config: string) => {
      expect(config).toContain('database: "storage/development.sqlite3"');
      expect(config).toContain('database: "storage/test.sqlite3"');
      expect(config).toContain('database: "storage/production.sqlite3"');
    });
  });

  it("does not ignore db/*.sqlite3 in the generated .gitignore", async () => {
    await t.runGenerator([t.destinationRoot, "--database=sqlite3"]);

    await t.assertFile(".gitignore", (gitignore: string) => {
      expect(gitignore).not.toContain("sqlite3");
      expect(gitignore).toContain("/storage/*");
    });
  });

  it("emits each subsystem's scaffolding once its skip flag is off", async () => {
    await t.runGenerator([t.destinationRoot, ...UNPORTED]);

    for (const path of [
      "config/cable.ts",
      "config/storage.ts",
      "app/jobs/application-job.ts",
      "app/mailers/application-mailer.ts",
      "app/views/layouts/mailer.html.tse",
      "app/views/layouts/mailer.text.tse",
      "storage/.keep",
    ])
      await t.assertFile(path);
  });

  it("--api implies its options and a default run reports nothing", async () => {
    const api = new AppGenerator(
      [t.destinationRoot],
      { skipInstall: true, api: true },
      { destinationRoot: t.destinationRoot },
    );
    expect(api.options.skipAssetPipeline).toBe(true);
    expect(api.options.skipJavascript).toBe(true);
    const output = await capture("stdout", () =>
      new AppGenerator(
        [t.destinationRoot],
        { skipInstall: true },
        { destinationRoot: t.destinationRoot },
      ).reportImpliedOptions(),
    );
    expect(output).not.toMatch(/will also be activated/);
    const minimal = new AppGenerator(
      [t.destinationRoot],
      { skipInstall: true, minimal: true, skipActionText: false },
      { destinationRoot: t.destinationRoot },
    );
    expect(() => minimal.reportImpliedOptions()).not.toThrow();
  });

  it("generates valid package.json", async () => {
    await t.runGenerator([File.join(t.destinationRoot, "my-app")]);
    await t.assertFile("my-app/package.json", (content: string) => {
      const pkg = json(content);
      expect(pkg.name).toBe("my-app");
      expect(pkg.dependencies["better-sqlite3"]).toBeDefined();
      expect(pkg.dependencies["@blazetrails/activerecord"]).toBeDefined();
      expect(pkg.dependencies["@blazetrails/activemodel"]).toBeDefined();
      expect(pkg.dependencies["@blazetrails/activejob"]).toBeDefined();
      expect(pkg.scripts["db:migrate"]).toBeDefined();
      expect(pkg.scripts["db:seed"]).toBeDefined();
      expect(pkg.scripts["db:setup"]).toBeDefined();
      expect(pkg.devDependencies.vite).toBeDefined();
      expect(pkg.devDependencies.tsx).toBeUndefined();
      expect(pkg.devDependencies.typescript).toBe("^5.8.0");
      expect(pkg.scripts["db:seed"]).toBe("trails db:seed");
      expect(pkg.scripts.dev).toBe("trails server");
      expect(pkg.scripts.trails).toBe("trails");
    });
    await t.assertFile("my-app/app/jobs/application-job.ts");
    await t.assertFile("my-app/tsconfig.json", (content: string) => {
      const tsconfig = json(content);
      expect(tsconfig.compilerOptions.rewriteRelativeImportExtensions).toBe(true);
      expect(tsconfig.compilerOptions.erasableSyntaxOnly).toBe(true);
    });
    await t.assertFile("my-app/bin/trails", (trails: string) => {
      expect(trails).toContain(
        'const APP_PATH = join(import.meta.dirname, "../config/application.ts");',
      );
      expect(trails).toContain("setAppPath(APP_PATH);");
      expect(trails).toContain('await import("@blazetrails/trailties/commands");');
    });
    await t.assertFile("my-app/bin/setup", /bin\/trails/);
    await t.assertFile("my-app/bin/dev", (dev: string) => {
      expect(dev).toContain('"trails"');
      expect(dev).toContain("spawnSync");
      expect(dev).not.toContain('.join(" ")');
      expect(dev).toContain("fileURLToPath(import.meta.url)");
    });
    await t.assertFile("my-app/README.md", (readme: string) => {
      expect(readme).not.toMatch(/^\| `trails /m);
    });
  });

  it("emits prepare hook that builds .tse views", async () => {
    await t.runGenerator();
    await t.assertFile("package.json", (content: string) => {
      const pkg = json(content);
      expect(pkg.scripts.prepare).toBe("trails-tsc-views build --views app/views");
      expect(pkg.scripts.postinstall).toBeUndefined();
      expect(pkg.devDependencies["@blazetrails/trails-tsc"]).toBeDefined();
      expect(pkg.dependencies["@blazetrails/date"]).toBeDefined();
      expect(pkg.devDependencies["@types/node"]).toBeDefined();
    });
    await t.assertFile(".gitignore", /\/\.trails\//);
  });

  it("exports *.tse with types before default", async () => {
    await t.runGenerator();
    await t.assertFile("package.json", (content: string) => {
      const tseExport = json(content).exports["./*.tse"];
      expect(tseExport).toBeDefined();
      expect(tseExport.types).toBe("./.trails/views/*.tse.d.ts");
      expect(tseExport.default).toBe("./.trails/views/*.tse.js");
      const keys = Object.keys(tseExport);
      expect(keys.indexOf("types")).toBeLessThan(keys.indexOf("default"));
    });
  });

  it("tsconfig includes .trails alongside the app tree so augmentation participates in type-check", async () => {
    await t.runGenerator();
    await t.assertFile("tsconfig.json", (content: string) => {
      const tsconfig = json(content);
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
  });

  it("configures postgres database", async () => {
    await t.runGenerator([t.destinationRoot, "--database=postgresql"]);
    await t.assertFile("package.json", (content: string) => {
      expect(json(content).dependencies.pg).toBeDefined();
    });
    await t.assertFile("config/database.ts", /postgresql/);
  });

  it("configures mysql database", async () => {
    await t.runGenerator([t.destinationRoot, "--database=mysql"]);
    await t.assertFile("package.json", (content: string) => {
      expect(json(content).dependencies.mysql2).toBeDefined();
    });
    await t.assertFile("config/database.ts", /mysql2/);
  });

  it("configures sqlite database by default", async () => {
    await t.runGenerator();
    await t.assertFile("config/database.ts", /sqlite3/);
  });

  it("sqlite database config uses the sqlite3 adapter without a side-effect driver import", async () => {
    await t.runGenerator([t.destinationRoot, "--database=sqlite3"]);
    await t.assertFile("config/database.ts", (dbConfig: string) => {
      expect(dbConfig).toContain('adapter: "sqlite3"');
      expect(dbConfig).not.toContain("@blazetrails/activerecord/sqlite/");
    });
  });

  it("--package-manager npm uses npm install in bin/setup", async () => {
    await t.runGenerator([t.destinationRoot, "--package-manager=npm"]);
    await t.assertFile("bin/setup", (setup: string) => {
      expect(setup).toContain("npm install");
      expect(setup).not.toContain("pnpm");
    });
  });

  it("--sqlite-driver node-sqlite omits better-sqlite3 dep", async () => {
    await t.runGenerator([t.destinationRoot, "--sqlite-driver=node-sqlite"]);
    await t.assertFile("package.json", (content: string) => {
      expect(json(content).dependencies["better-sqlite3"]).toBeUndefined();
    });
    await t.assertFile("config/database.ts", (dbConfig: string) => {
      expect(dbConfig).toContain('adapter: "node-sqlite"');
      expect(dbConfig).not.toContain("@blazetrails/activerecord/sqlite/node-sqlite");
    });
  });

  it("rejects an unknown sqlite driver", () => {
    expect(() => t.generator([t.destinationRoot], { sqliteDriver: "bogus-driver" })).toThrow(
      /Unknown SQLite driver/,
    );
  });

  it("scaffolds the expo-sqlite adapter for --sqlite-driver expo-sqlite", async () => {
    await t.runGenerator([t.destinationRoot, "--database=sqlite3", "--sqlite-driver=expo-sqlite"]);
    await t.assertFile("config/database.ts", /adapter: "expo-sqlite"/);
    await t.assertFile("package.json", (content: string) => {
      const pkg = json(content);
      expect(pkg.dependencies["expo-sqlite"]).toBeDefined();
      expect(pkg.dependencies["better-sqlite3"]).toBeUndefined();
    });
  });

  it("skips docker files when --skip-docker", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-docker"]);
    t.assertNoFile("Dockerfile");
    t.assertNoFile(".dockerignore");
  });

  it("includes app name in generated files", async () => {
    await t.runGenerator([File.join(t.destinationRoot, "my-app")]);

    await t.assertFile("my-app/config/application.ts", /MyApp/);
    await t.assertFile("my-app/app/views/layouts/application.html.tse", (layout: string) => {
      expect(layout).toContain(`contentFor("title") ?? "My App"`);
    });
  });

  it("rejects a name whose constant is already in use", async () => {
    const content = await capture("stderr", () =>
      t.runGenerator([File.join(t.destinationRoot, "string")]),
    );
    expect(content).toBe(
      "Invalid application name string, constant String is already in use. Please choose another application name.\n",
    );
  });

  it("generates an application class that subclasses Application", async () => {
    await t.runGenerator([File.join(t.destinationRoot, "my-app")]);

    await t.assertFile("my-app/config/application.ts", (appConfig: string) => {
      expect(appConfig).toContain(`import { Application } from "@blazetrails/trailties";`);
      expect(appConfig).toContain("export class MyApp extends Application {");
      expect(appConfig).toContain("Application.register(this, import.meta.dirname);");
    });
    await t.assertFile("my-app/config/environment.ts", (environment: string) => {
      expect(environment).toContain(`import "./application.ts";`);
      expect(environment).toContain("await Trails.initialize()");
      const importer = environment.indexOf("loader.importer = (url) => import(url);");
      expect(importer).toBeGreaterThan(-1);
      expect(importer).toBeLessThan(environment.indexOf("await Trails.initialize()"));
    });
    await t.assertFile("my-app/config.ts", (configRu: string) => {
      expect(configRu).toContain(`import "./config/environment.ts";`);
      expect(configRu).toContain("export const Config = Trails.application;");
      expect(configRu).toContain("await Trails.application.loadServer();");
    });
  });

  it("types drawRoutes against Mapper", async () => {
    await t.runGenerator();

    await t.assertFile("config/routes.ts", (routes: string) => {
      expect(routes).toContain(`import { Trails } from "@blazetrails/trailties";`);
      expect(routes).toContain("Trails.application.routes().draw(function () {");
      expect(routes).not.toContain(": any");
    });
  });

  it("snapshots emitted TypeScript sources", async () => {
    await t.runGenerator([File.join(t.destinationRoot, "my-app"), ...UNPORTED]);
    for (const [path, name] of [
      ["app/controllers/application-controller.ts", "application-controller.ts"],
      ["app/models/application-record.ts", "application-record.ts"],
      ["app/helpers/application-helper.ts", "application-helper.ts"],
      ["app/jobs/application-job.ts", "application-job.ts"],
      ["app/mailers/application-mailer.ts", "application-mailer.ts"],
      ["config/application.ts", "config/application.ts"],
      ["config/routes.ts", "config/routes.ts"],
      ["config/cable.ts", "config/cable.ts"],
      ["config/storage.ts", "config/storage.ts"],
      ["config/environments/development.ts", "environments/development.ts"],
      ["config/environments/test.ts", "environments/test.ts"],
      ["config/environments/production.ts", "environments/production.ts"],
      ["test/test-helper.ts", "test-helper.ts"],
      ["test/global-setup.ts", "global-setup.ts"],
      ["config.ts", "config.ts"],
      ["vite.config.ts", "vite.config.ts"],
    ])
      await t.assertFile(`my-app/${path}`, (content: string) => {
        expect(content).toMatchSnapshot(name);
      });
  });
});
