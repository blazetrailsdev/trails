import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { assertNoMatch, capture } from "@blazetrails/activesupport";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PluginGenerator } from "../../lib/generators/trails/plugin/plugin-generator.js";
import { TestCase } from "../../lib/generators/test-case.js";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";

class PluginGeneratorApp extends Application {}
const tmpRoot = Dir.mktmpdir();
const destinationRoot = File.join(tmpRoot, "bukkits");

class PluginGeneratorTest extends TestCase {}
PluginGeneratorTest.destination(destinationRoot);
PluginGeneratorTest.tests(PluginGenerator);
PluginGeneratorTest.arguments([destinationRoot]);
registerSpecType(/^PluginGenerator(Test)?$/, PluginGeneratorTest);
let t: TestCase;

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  Trails.application = PluginGeneratorApp.instance();
});

afterEach(() => {
  Trails.application = null;
});

afterAll(async () => {
  await FileUtils.rmRfAsync(tmpRoot);
});

describe("PluginGeneratorTest", () => {
  it("invalid plugin name raises an error", async () => {
    let content = await capture("stderr", () =>
      t.runGenerator([File.join(t.destinationRoot, "my_plugin-31fr-extension")]),
    );
    expect(content).toBe(
      "Invalid plugin name my_plugin-31fr-extension. Please give a name which does not contain a namespace starting with numeric characters.\n",
    );

    content = await capture("stderr", () =>
      t.runGenerator([File.join(t.destinationRoot, "things4.3")]),
    );
    expect(content).toBe(
      'Invalid plugin name things4.3. Please give a name which uses only alphabetic, numeric, "_" or "-" characters.\n',
    );

    content = await capture("stderr", () =>
      t.runGenerator([File.join(t.destinationRoot, "43things")]),
    );
    expect(content).toBe(
      "Invalid plugin name 43things. Please give a name which does not start with numbers.\n",
    );

    content = await capture("stderr", () =>
      t.runGenerator([File.join(t.destinationRoot, "plugin")]),
    );
    expect(content).toBe(
      "Invalid plugin name plugin. Please give a name which does not match one of the reserved trails words: application, destroy, plugin, runner, test\n",
    );

    content = await capture("stderr", () =>
      t.runGenerator([File.join(t.destinationRoot, "Trails")]),
    );
    expect(content).toBe(
      "Invalid plugin name Trails, constant Trails is already in use. Please choose another plugin name.\n",
    );
  });

  it("correct file in lib folder of hyphenated plugin name", async () => {
    await t.runGenerator([File.join(t.destinationRoot, "hyphenated-name")]);
    t.assertNoFile("hyphenated-name/lib/hyphenated-name.ts");
    t.assertNoFile("hyphenated-name/lib/hyphenated_name.ts");
    await t.assertFile(
      "hyphenated-name/lib/hyphenated/name.ts",
      /export namespace Hyphenated \{\n {2}export namespace Name \{\n {4}\/\/ Your code goes here\.\.\.\n {2}\}\n\}/,
    );
  });

  it("correct file in lib folder of camelcase plugin name", async () => {
    await t.runGenerator([File.join(t.destinationRoot, "CamelCasedName")]);
    t.assertNoFile("CamelCasedName/lib/CamelCasedName.ts");
    await t.assertFile("CamelCasedName/lib/camel_cased_name.ts", /export namespace CamelCasedName/);
  });

  it("generating without options", async () => {
    await t.runGenerator();
    await t.assertFile("README.md", /Bukkits/);
    await t.assertFile("test/test_helper.ts", (content: string) => {
      expect(content).toMatch(/await import\(.+test\/dummy\/config\/environment/);
      expect(content).toMatch(/ActiveRecord\.Migrator\.migrationsPaths.+test\/dummy\/db\/migrate/);
    });
    await t.assertFile(
      "lib/bukkits/railtie.ts",
      /export namespace Bukkits \{\n {2}export class Railtie extends Trails\.Trailtie \{\}\n\}/,
    );
    await t.assertFile("lib/bukkits.ts", (content: string) => {
      expect(content).toMatch(/import "\.\/bukkits\/version\.js"/);
      expect(content).toMatch(/import "\.\/bukkits\/railtie\.js"/);
    });
    await t.assertFile("test/bukkits.test.ts", (content: string) => {
      expect(content).toMatch(/describe\("Bukkits"/);
      expect(content).toMatch(/expect\(Bukkits\.VERSION\)/);
    });
  });

  it("generating test files in full mode", async () => {
    await t.runGenerator([t.destinationRoot, "--full"]);
    await t.assertDirectory("test/integration/");

    await t.assertFile("test/integration/navigation.test.ts", /describe\("Navigation"/);
  });

  it("skip action mailer and skip active job with mountable", async () => {
    await t.runGenerator([
      t.destinationRoot,
      "--mountable",
      "--skip-action-mailer",
      "--skip-active-job",
    ]);
    t.assertNoDirectory("app/mailers");
    t.assertNoDirectory("app/jobs");
  });

  it("skip action mailer and skip active job with api and mountable", async () => {
    await t.runGenerator([
      t.destinationRoot,
      "--api",
      "--mountable",
      "--skip-action-mailer",
      "--skip-active-job",
    ]);
    t.assertNoDirectory("app/mailers");
    t.assertNoDirectory("app/jobs");
  });

  it("skip action mailer and skip active job with full", async () => {
    await t.runGenerator([
      t.destinationRoot,
      "--full",
      "--skip-action-mailer",
      "--skip-active-job",
    ]);
    t.assertNoDirectory("app/mailers");
    t.assertNoDirectory("app/jobs");
  });

  it("creating engine in full mode", async () => {
    await t.runGenerator([t.destinationRoot, "--full"]);
    await t.assertFile("app/assets/stylesheets/bukkits");
    await t.assertFile("app/assets/images/bukkits");
    await t.assertFile("app/models");
    await t.assertFile("app/controllers");
    await t.assertFile("app/views");
    await t.assertFile("app/helpers");
    await t.assertFile("app/mailers");
    await t.assertFile("app/jobs");
    await t.assertFile("bin/trails", /import "@blazetrails\/activesupport\/node"/);
    await t.assertFile("config/routes.ts", /Trails\.application\.routes\(\)\.draw/);
    await t.assertFile(
      "lib/bukkits/engine.ts",
      /export namespace Bukkits \{\n {2}export class Engine extends Trails\.Engine \{/,
    );
    await t.assertFile("lib/bukkits.ts", /import "\.\/bukkits\/engine\.js"/);
  });

  it("creating full engine mode adds keeps", async () => {
    await t.runGenerator([t.destinationRoot, "--full"]);
    const foldersWithKeep = [
      "app/models/concerns",
      "app/controllers/concerns",
      "test/fixtures/files",
      "test/controllers",
      "test/mailers",
      "test/models",
      "test/helpers",
      "test/integration",
    ];
    for (const folder of foldersWithKeep) {
      await t.assertFile(`${folder}/.keep`);
    }
  });

  it("creating full api engine adds keeps", async () => {
    await t.runGenerator([t.destinationRoot, "--full", "--api"]);
    const foldersWithKeep = [
      "app/models/concerns",
      "app/controllers/concerns",
      "test/fixtures/files",
      "test/controllers",
      "test/mailers",
      "test/models",
      "test/integration",
    ];
    for (const folder of foldersWithKeep) {
      await t.assertFile(`${folder}/.keep`);
    }
    t.assertNoFile("test/helpers/.keep");
  });

  it("creating mountable engine mode adds keeps", async () => {
    await t.runGenerator([t.destinationRoot, "--mountable"]);
    const foldersWithKeep = [
      "app/models/concerns",
      "app/controllers/concerns",
      "test/fixtures/files",
      "test/controllers",
      "test/mailers",
      "test/models",
      "test/helpers",
      "test/integration",
    ];
    for (const folder of foldersWithKeep) {
      await t.assertFile(`${folder}/.keep`);
    }
  });

  it("creating gemspec", async () => {
    await t.runGenerator();
    await t.assertFile("package.json", /"name": "bukkits"/);
    await t.assertFile(
      "package.json",
      /"files": \["app", "config", "db", "lib", "MIT-LICENSE", "Rakefile\.ts", "README\.md"\]/,
    );
    await t.assertFile("package.json", /"version": "0\.1\.0"/);
  });

  it("usage of engine commands", async () => {
    await t.runGenerator([t.destinationRoot, "--full"]);
    await t.assertFile(
      "bin/trails",
      /ENGINE_PATH = File\.expandPath\("\.\.\/lib\/bukkits\/engine\.ts", __dir__\)/,
    );
    await t.assertFile("bin/trails", /ENGINE_ROOT = File\.expandPath\("\.\.", __dir__\)/);
    await t.assertFile(
      "bin/trails",
      /APP_PATH = File\.expandPath\("\.\.\/test\/dummy\/config\/application\.ts", __dir__\)/,
    );
    await t.assertFile("bin/trails", /import "@blazetrails\/activesupport\/node"/);
    await t.assertFile("bin/trails", /await import\("@blazetrails\/trailties\/engine\/commands"\)/);
  });

  it("shebang", async () => {
    await t.runGenerator([t.destinationRoot, "--full"]);
    await t.assertFile("bin/trails", /#!\/usr\/bin\/env node/);
  });

  it("passing dummy path as a parameter", async () => {
    await t.runGenerator([t.destinationRoot, "--dummy-path", "spec/dummy"]);
    await t.assertFile("spec/dummy");
    await t.assertFile("spec/dummy/config/application.ts");
    t.assertNoFile("test/dummy");
    await t.assertFile("test/test_helper.ts", (content: string) => {
      expect(content).toMatch(/await import\(.+spec\/dummy\/config\/environment/);
      expect(content).toMatch(/ActiveRecord\.Migrator\.migrationsPaths.+spec\/dummy\/db\/migrate/);
    });
  });

  it("creating dummy application with different name", async () => {
    await t.runGenerator([t.destinationRoot, "--dummy-path", "spec/fake"]);
    await t.assertFile("spec/fake");
    await t.assertFile("spec/fake/config/application.ts");
    t.assertNoFile("test/dummy");
    await t.assertFile("test/test_helper.ts", (content: string) => {
      expect(content).toMatch(/await import\(.+spec\/fake\/config\/environment/);
      expect(content).toMatch(/ActiveRecord\.Migrator\.migrationsPaths.+spec\/fake\/db\/migrate/);
    });
  });

  it("dummy application sets include all helpers to false for mountable", async () => {
    await t.runGenerator([t.destinationRoot, "--mountable"]);

    await t.assertFile(
      "test/dummy/config/application.ts",
      /^ {4}this\.config\.actionController\.includeAllHelpers = false;$/m,
    );
  });

  it("dummy application sets include all helpers to false for full", async () => {
    await t.runGenerator([t.destinationRoot, "--full"]);

    await t.assertFile("test/dummy/config/application.ts", /includeAllHelpers/);
  });

  it("dummy application does not set include all helpers for regular", async () => {
    await t.runGenerator();

    await t.assertFile("test/dummy/config/application.ts", (content: string) => {
      assertNoMatch(/includeAllHelpers/, content);
    });
  });

  it("dummy application does not set include all helpers for api", async () => {
    await t.runGenerator([t.destinationRoot, "--mountable", "--api"]);

    await t.assertFile("test/dummy/config/application.ts", (content: string) => {
      assertNoMatch(/includeAllHelpers/, content);
    });
  });

  it("skipping test files", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-test"]);
    t.assertNoDirectory("test");
    await t.assertFile(".gitignore", (contents: string) => {
      assertNoMatch(/test\/dummy/, contents);
    });
  });

  it("skipping gemspec", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-gemspec"]);
    t.assertNoFile("package.json");
    await t.assertFile("pnpm-workspace.yaml", (contents: string) => {
      assertNoMatch(/package\.json/, contents.replace(/^\s*#.*$/gm, ""));
      expect(contents).toMatch(/- \./);
    });
  });

  it("skipping gemspec in full mode", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-gemspec", "--full"]);
    t.assertNoFile("package.json");
    await t.assertFile("pnpm-workspace.yaml", (contents: string) => {
      assertNoMatch(/package\.json/, contents.replace(/^\s*#.*$/gm, ""));
      expect(contents).toMatch(/- \./);
    });
  });

  it("no details from git when skip git", async () => {
    const name = "TODO: Write your name";
    const email = "TODO: Write your email address";

    await t.runGenerator([t.destinationRoot, "--skip-git"]);
    await t.assertFile("MIT-LICENSE", (contents: string) => {
      expect(contents).toMatch(name);
    });
    await t.assertFile("package.json", (contents: string) => {
      expect(contents).toMatch(name);
      expect(contents).toMatch(email);
    });
    t.assertNoDirectory(".git");
  });

  it("skipping useless folders generation for api engines", async () => {
    for (const option of ["--full", "--mountable"]) {
      await t.runGenerator([t.destinationRoot, option, "--api"]);

      t.assertNoDirectory("app/assets");
      t.assertNoDirectory("app/helpers");
      t.assertNoDirectory("app/views");

      await FileUtils.rmRfAsync(t.destinationRoot);
    }
  });

  it("application controller parent for mountable api plugins", async () => {
    await t.runGenerator([t.destinationRoot, "--mountable", "--api"]);

    await t.assertFile("app/controllers/bukkits/application_controller.ts", (content: string) => {
      expect(content).toMatch("ApplicationController extends ActionController.API");
    });
  });

  it("api generators configuration for api engines", async () => {
    await t.runGenerator([t.destinationRoot, "--full", "--api"]);

    await t.assertFile("lib/bukkits/engine.ts", (content: string) => {
      expect(content).toMatch("this.config.generators.apiOnly = true");
    });
  });

  it("railtie test command", async () => {
    await t.runGenerator([t.destinationRoot]);
    await t.assertFile(".github/workflows/ci.yml", /run: bin\/test/);
  });

  it("engine test command", async () => {
    await t.runGenerator([t.destinationRoot, "--full"]);
    await t.assertFile(".github/workflows/ci.yml", /run: bin\/trails db:test:prepare test/);
  });

  it("engine without active record test command", async () => {
    await t.runGenerator([t.destinationRoot, "--full", "--skip-active-record"]);
    await t.assertFile(".github/workflows/ci.yml", /run: bin\/trails test/);
  });
});
