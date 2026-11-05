import { Dir } from "@blazetrails/ruby-compat";
import { assertNoMatch } from "@blazetrails/activesupport";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Base as ThorBase } from "@blazetrails/thor/shell";
import { afterEach, beforeEach, describe, it } from "vitest";
import { Application } from "../application.js";
import { Trails } from "../trails.js";
import { AppGenerator } from "./trails/app/app-generator.js";
import { TestCase } from "./test-case.js";
import { runAppUpdate } from "./generators-test-helper.js";

class ApiAppGeneratorApp extends Application {}
const destinationRoot = Dir.mktmpdir();

class ApiAppGeneratorTest extends TestCase {}
ApiAppGeneratorTest.destination(destinationRoot);
ApiAppGeneratorTest.tests(AppGenerator);
ApiAppGeneratorTest.arguments([destinationRoot, "--api", "--skip-install"]);
registerSpecType(/^ApiAppGeneratorTest$/, ApiAppGeneratorTest);
let t: TestCase;
let shell: InstanceType<typeof ThorBase.shell> & { _alwaysForce: boolean };

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  Trails.application = ApiAppGeneratorApp.instance();

  shell = new ThorBase.shell() as typeof shell;
  shell._alwaysForce = true;
});

afterEach(() => {
  Trails.application = null;
});

const defaultFiles = [
  ".gitignore",
  ".dockerignore",
  "README.md",
  "package.json",
  "Rakefile.ts",
  "Dockerfile",
  "app/controllers",
  "app/models",
  "bin/dev",
  "bin/setup",
  "config/application.ts",
  "config/boot.ts",
  "config/environment.ts",
  "config/environments",
  "config/initializers/cors.ts",
  "config/routes.ts",
  "db",
  "lib",
  "lib/tasks",
  "log",
  "test/fixtures",
  "test/controllers",
  "test/integration",
  "test/models",
  "tmp",
];

const skippedFiles = [
  "app/assets",
  "app/helpers",
  "app/views/layouts/application.html.tse",
  "test/helpers",
  "public/400.html",
  "public/404.html",
  "public/422.html",
  "public/500.html",
];

describe("ApiAppGeneratorTest", () => {
  it("skeleton is created", async () => {
    await t.runGenerator();

    for (const path of defaultFiles) await t.assertFile(path);
    for (const path of skippedFiles) t.assertNoFile(path);
  });

  it("api modified files", async () => {
    await t.runGenerator();

    await t.assertFile(".gitignore", (content: string) => {
      assertNoMatch(/\/public\/assets/, content);
    });
    await t.assertFile("package.json", (content: string) => {
      assertNoMatch(/"sass"/, content);
      assertNoMatch(/"web-console"/, content);
      assertNoMatch(/"playwright"/, content);
      assertNoMatch(/"selenium-webdriver"/, content);
    });

    await t.assertFile("config/application.ts", /config\.apiOnly = true/);
    await t.assertFile("app/controllers/application-controller.ts", /ActionController\.API/);
    await t.assertFile("config/environments/development.ts", (content: string) => {
      assertNoMatch(/actionController\.performCaching = true/, content);
    });
    await t.assertFile("config/environments/production.ts", (content: string) => {
      assertNoMatch(/actionController\.performCaching = true/, content);
    });

    await t.assertFile(".github/workflows/ci.yml", (content: string) => {
      assertNoMatch(/test:system/, content);
      assertNoMatch(/screenshots/, content);
      assertNoMatch(/scan_js/, content);
      assertNoMatch(/google-chrome-stable/, content);
    });
  });

  it("dockerfile", async () => {
    await t.runGenerator();

    await t.assertFile("Dockerfile", (content: string) => {
      assertNoMatch(/assets:precompile/, content);
    });
  });

  it("generator if skip action cable is given", async () => {
    await t.runGenerator([t.destinationRoot, "--api", "--skip-install", "--skip-action-cable"]);
    await t.assertFile("config/application.ts", /\/\/\s*import\s+"[^"]*action-cable/);
    t.assertNoFile("config/cable.ts");
    await t.assertFile("package.json", (content: string) => {
      assertNoMatch(/"redis"/, content);
    });
  });

  it("generator if skip action mailer is given", async () => {
    await t.runGenerator([t.destinationRoot, "--api", "--skip-install", "--skip-action-mailer"]);
    await t.assertFile("config/application.ts", /\/\/\s*import\s+"[^"]*action-mailer/);
    await t.assertFile("config/environments/development.ts", (content: string) => {
      assertNoMatch(/config\.actionMailer/, content);
    });
    await t.assertFile("config/environments/test.ts", (content: string) => {
      assertNoMatch(/config\.actionMailer/, content);
    });
    await t.assertFile("config/environments/production.ts", (content: string) => {
      assertNoMatch(/config\.actionMailer/, content);
    });
    t.assertNoDirectory("app/mailers");
    t.assertNoDirectory("test/mailers");
    t.assertNoDirectory("app/views");
  });

  it("generator skip css", async () => {
    await t.runGenerator([t.destinationRoot, "--api", "--skip-install", "--css=tailwind"]);

    await t.assertFile("package.json", (content: string) => {
      assertNoMatch(/tailwindcss/, content);
    });
    t.assertNoFile("app/views/layouts/application.html.tse");
  });

  it("app update does not generate unnecessary config files", async () => {
    await t.runGenerator();

    const generator = new AppGenerator(
      ["trails"],
      { api: true, update: true },
      { destinationRoot: t.destinationRoot, shell: shell },
    );
    await generator.updateConfigFiles();

    t.assertNoFile("config/initializers/assets.ts");
    t.assertNoFile("config/initializers/content-security-policy.ts");
  });

  it("app update does not generate public files", async () => {
    await t.runGenerator();
    Trails.application!.config.apiOnly = true;
    try {
      await runAppUpdate.call(t);
    } finally {
      Trails.application!.config.apiOnly = false;
    }

    t.assertNoFile("public/406-unsupported-browser.html");
  });
});
