import { Dir, File, FileUtils, Gem, chomp, rbFBackquote } from "@blazetrails/ruby-compat";
import { assertNoMatch } from "@blazetrails/activesupport/testing/assertions";
import { capture } from "@blazetrails/activesupport/testing/stream";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PluginGenerator } from "../../lib/generators/trails/plugin/plugin-generator.js";
import { TestCase } from "../../lib/generators/test-case.js";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import { setAppPath } from "../../lib/app-path.js";

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

  it("creating engine with hyphenated name in full mode", async () => {
    await t.runGenerator([File.join(t.destinationRoot, "hyphenated-name"), "--full"]);
    t.assertNoFile("hyphenated-name/app/assets/javascripts/hyphenated/name");
    await t.assertFile("hyphenated-name/app/assets/stylesheets/hyphenated/name");
    await t.assertFile("hyphenated-name/app/assets/images/hyphenated/name");
    await t.assertFile("hyphenated-name/app/models");
    await t.assertFile("hyphenated-name/app/controllers");
    await t.assertFile("hyphenated-name/app/views");
    await t.assertFile("hyphenated-name/app/helpers");
    await t.assertFile("hyphenated-name/app/mailers");
    await t.assertFile("hyphenated-name/app/jobs");
    await t.assertFile("hyphenated-name/bin/trails");
    await t.assertFile(
      "hyphenated-name/config/routes.ts",
      /Trails\.application\.routes\(\)\.draw\(/,
    );
    await t.assertFile(
      "hyphenated-name/lib/hyphenated/name/engine.ts",
      /export namespace Hyphenated \{\n {2}export namespace Name \{\n {4}export class Engine extends Trails\.Engine \{\n {4}\}\n {2}\}\n\}/,
    );
    await t.assertFile("hyphenated-name/lib/hyphenated/name.ts", /import "\.\/name\/engine\.js"/);
    await t.assertFile("hyphenated-name/bin/trails", /\.\.\/lib\/hyphenated\/name\/engine/);
  });

  it("creating engine with hyphenated and underscored name in full mode", async () => {
    await t.runGenerator([File.join(t.destinationRoot, "my_hyphenated-name"), "--full"]);
    t.assertNoFile("my_hyphenated-name/app/assets/javascripts/my_hyphenated/name");
    await t.assertFile("my_hyphenated-name/app/assets/stylesheets/my_hyphenated/name");
    await t.assertFile("my_hyphenated-name/app/assets/images/my_hyphenated/name");
    await t.assertFile("my_hyphenated-name/app/models");
    await t.assertFile("my_hyphenated-name/app/controllers");
    await t.assertFile("my_hyphenated-name/app/views");
    await t.assertFile("my_hyphenated-name/app/helpers");
    await t.assertFile("my_hyphenated-name/app/mailers");
    await t.assertFile("my_hyphenated-name/app/jobs");
    await t.assertFile("my_hyphenated-name/bin/trails");
    await t.assertFile(
      "my_hyphenated-name/config/routes.ts",
      /Trails\.application\.routes\(\)\.draw\(/,
    );
    await t.assertFile(
      "my_hyphenated-name/lib/my_hyphenated/name/engine.ts",
      /export namespace MyHyphenated \{\n {2}export namespace Name \{\n {4}export class Engine extends Trails\.Engine \{\n {4}\}\n {2}\}\n\}/,
    );
    await t.assertFile(
      "my_hyphenated-name/lib/my_hyphenated/name.ts",
      /import "\.\/name\/engine\.js"/,
    );
    await t.assertFile("my_hyphenated-name/bin/trails", /\.\.\/lib\/my_hyphenated\/name\/engine/);
  });

  it("being quiet while creating dummy application", async () => {
    assertNoMatch(/create\s+config\/application\.ts/, (await t.runGenerator()) as string);
  });

  it("create mountable application with mountable option", async () => {
    await t.runGenerator([t.destinationRoot, "--mountable"]);
    t.assertNoFile("app/assets/javascripts/bukkits");
    await t.assertFile("app/assets/stylesheets/bukkits");
    await t.assertFile("app/assets/images/bukkits");
    await t.assertFile("config/routes.ts", /Bukkits\.Engine\.instance\(\)\.routes\(\)\.draw\(/);
    await t.assertFile("lib/bukkits/engine.ts", /this\.isolateNamespace\(Bukkits\)/);
    await t.assertFile(
      "test/dummy/config/routes.ts",
      /this\.mount\(Bukkits\.Engine, \{ at: "\/bukkits" \}\)/,
    );
    await t.assertFile(
      "app/controllers/bukkits/application_controller.ts",
      /export namespace Bukkits \{\n {2}export class ApplicationController extends ActionController\.Base \{\}\n\}\n/,
    );
    await t.assertFile(
      "app/models/bukkits/application_record.ts",
      /export namespace Bukkits \{\n {2}export class ApplicationRecord extends ActiveRecord\.Base \{\n {4}static \{\n {6}this\.abstractClass = true;\n {4}\}\n {2}\}\n\}/,
    );
    await t.assertFile(
      "app/jobs/bukkits/application_job.ts",
      /export namespace Bukkits \{\n {2}export class ApplicationJob extends ActiveJob\.Base/,
    );
    await t.assertFile(
      "app/mailers/bukkits/application_mailer.ts",
      /export namespace Bukkits \{\n {2}export class ApplicationMailer extends ActionMailer\.Base \{\n {4}static \{\n {6}this\.default\(\{ from: "from@example\.com" \}\);\n {6}this\.layout\("mailer"\);\n {4}\}\n {2}\}\n\}/,
    );
    await t.assertFile(
      "app/helpers/bukkits/application_helper.ts",
      /export namespace Bukkits \{\n {2}export const ApplicationHelper = \{\};\n\}/,
    );
    await t.assertFile("app/views/layouts/bukkits/application.html.tse", (contents: string) => {
      expect(contents).toMatch("<title>Bukkits</title>");
      expect(contents).toMatch("<%= csrfMetaTags() %>");
      expect(contents).toMatch("<%= cspMetaTag() %>");
      expect(contents).toMatch(/stylesheetLinkTag\(\s*['"]bukkits\/application['"]/);
      assertNoMatch(/javascriptIncludeTag\(\s*['"]bukkits\/application['"]/, contents);
      expect(contents).toMatch("<%= yield %>");
    });
    await t.assertFile("test/test_helper.ts", (content: string) => {
      expect(content).toMatch(/ActiveRecord\.Migrator\.migrationsPaths.+test\/dummy\/db\/migrate/);
      expect(content).toMatch(/ActiveRecord\.Migrator\.migrationsPaths.+\.\.\/db\/migrate/);
      expect(content).toMatch(
        /ActionDispatch\.IntegrationTest\.fixturePaths = ActiveSupport\.TestCase\.fixturePat/,
      );
      assertNoMatch(/TestUnitReporter\.executable = "bin\/test"/, content);
    });
    t.assertNoFile("bin/test");
  });

  it("create mountable application with mountable option and hyphenated name", async () => {
    await t.runGenerator([File.join(t.destinationRoot, "hyphenated-name"), "--mountable"]);
    t.assertNoFile("hyphenated-name/app/assets/javascripts/hyphenated/name");
    await t.assertFile("hyphenated-name/app/assets/stylesheets/hyphenated/name");
    await t.assertFile("hyphenated-name/app/assets/images/hyphenated/name");
    await t.assertFile(
      "hyphenated-name/config/routes.ts",
      /Hyphenated\.Name\.Engine\.instance\(\)\.routes\(\)\.draw\(/,
    );
    await t.assertFile(
      "hyphenated-name/lib/hyphenated/name/version.ts",
      /export namespace Hyphenated \{\n {2}export namespace Name \{\n {4}export const VERSION = "0\.1\.0";\n {2}\}\n\}/,
    );
    await t.assertFile(
      "hyphenated-name/lib/hyphenated/name/engine.ts",
      /export namespace Hyphenated \{\n {2}export namespace Name \{\n {4}export class Engine extends Trails\.Engine \{\n {6}static \{ this\.isolateNamespace\(Hyphenated\.Name\); \}\n {4}\}\n {2}\}\n\}/,
    );
    await t.assertFile("hyphenated-name/lib/hyphenated/name.ts", /import "\.\/name\/engine\.js"/);
    await t.assertFile(
      "hyphenated-name/test/dummy/config/routes.ts",
      /this\.mount\(Hyphenated\.Name\.Engine, \{ at: "\/hyphenated-name" \}\)/,
    );
    await t.assertFile(
      "hyphenated-name/app/controllers/hyphenated/name/application_controller.ts",
      /export namespace Hyphenated \{\n {2}export namespace Name \{\n {4}export class ApplicationController extends ActionController\.Base \{\}\n {2}\}\n\}\n/,
    );
    await t.assertFile(
      "hyphenated-name/app/models/hyphenated/name/application_record.ts",
      /export namespace Hyphenated \{\n {2}export namespace Name \{\n {4}export class ApplicationRecord extends ActiveRecord\.Base \{\n {6}static \{\n {8}this\.abstractClass = true;\n {6}\}\n {4}\}\n {2}\}\n\}/,
    );
    await t.assertFile(
      "hyphenated-name/app/jobs/hyphenated/name/application_job.ts",
      /export namespace Hyphenated \{\n {2}export namespace Name \{\n {4}export class ApplicationJob extends ActiveJob\.Base/,
    );
    await t.assertFile(
      "hyphenated-name/app/mailers/hyphenated/name/application_mailer.ts",
      /export namespace Hyphenated \{\n {2}export namespace Name \{\n {4}export class ApplicationMailer extends ActionMailer\.Base \{\n {6}static \{\n {8}this\.default\(\{ from: "from@example\.com" \}\);\n {8}this\.layout\("mailer"\);\n {6}\}\n {4}\}\n {2}\}\n\}/,
    );
    await t.assertFile(
      "hyphenated-name/app/helpers/hyphenated/name/application_helper.ts",
      /export namespace Hyphenated \{\n {2}export namespace Name \{\n {4}export const ApplicationHelper = \{\};\n {2}\}\n\}/,
    );
    await t.assertFile(
      "hyphenated-name/app/views/layouts/hyphenated/name/application.html.tse",
      (contents: string) => {
        expect(contents).toMatch("<title>Hyphenated name</title>");
        expect(contents).toMatch(/stylesheetLinkTag\(\s*['"]hyphenated\/name\/application['"]/);
        assertNoMatch(/javascriptIncludeTag\(\s*['"]hyphenated\/name\/application['"]/, contents);
      },
    );
  });

  it("create mountable application with mountable option and hyphenated and underscored name", async () => {
    await t.runGenerator([File.join(t.destinationRoot, "my_hyphenated-name"), "--mountable"]);
    t.assertNoFile("my_hyphenated-name/app/assets/javascripts/my_hyphenated/name");
    await t.assertFile("my_hyphenated-name/app/assets/stylesheets/my_hyphenated/name");
    await t.assertFile("my_hyphenated-name/app/assets/images/my_hyphenated/name");
    await t.assertFile(
      "my_hyphenated-name/config/routes.ts",
      /MyHyphenated\.Name\.Engine\.instance\(\)\.routes\(\)\.draw\(/,
    );
    await t.assertFile(
      "my_hyphenated-name/lib/my_hyphenated/name/version.ts",
      /export namespace MyHyphenated \{\n {2}export namespace Name \{\n {4}export const VERSION = "0\.1\.0";\n {2}\}\n\}/,
    );
    await t.assertFile(
      "my_hyphenated-name/lib/my_hyphenated/name/engine.ts",
      /export namespace MyHyphenated \{\n {2}export namespace Name \{\n {4}export class Engine extends Trails\.Engine \{\n {6}static \{ this\.isolateNamespace\(MyHyphenated\.Name\); \}\n {4}\}\n {2}\}\n\}/,
    );
    await t.assertFile(
      "my_hyphenated-name/lib/my_hyphenated/name.ts",
      /import "\.\/name\/engine\.js"/,
    );
    await t.assertFile(
      "my_hyphenated-name/test/dummy/config/routes.ts",
      /this\.mount\(MyHyphenated\.Name\.Engine, \{ at: "\/my_hyphenated-name" \}\)/,
    );
    await t.assertFile(
      "my_hyphenated-name/app/controllers/my_hyphenated/name/application_controller.ts",
      /export namespace MyHyphenated \{\n {2}export namespace Name \{\n {4}export class ApplicationController extends ActionController\.Base \{\}\n {2}\}\n\}\n/,
    );
    await t.assertFile(
      "my_hyphenated-name/app/models/my_hyphenated/name/application_record.ts",
      /export namespace MyHyphenated \{\n {2}export namespace Name \{\n {4}export class ApplicationRecord extends ActiveRecord\.Base \{\n {6}static \{\n {8}this\.abstractClass = true;\n {6}\}\n {4}\}\n {2}\}\n\}/,
    );
    await t.assertFile(
      "my_hyphenated-name/app/jobs/my_hyphenated/name/application_job.ts",
      /export namespace MyHyphenated \{\n {2}export namespace Name \{\n {4}export class ApplicationJob extends ActiveJob\.Base/,
    );
    await t.assertFile(
      "my_hyphenated-name/app/mailers/my_hyphenated/name/application_mailer.ts",
      /export namespace MyHyphenated \{\n {2}export namespace Name \{\n {4}export class ApplicationMailer extends ActionMailer\.Base \{\n {6}static \{\n {8}this\.default\(\{ from: "from@example\.com" \}\);\n {8}this\.layout\("mailer"\);\n {6}\}\n {4}\}\n {2}\}\n\}/,
    );
    await t.assertFile(
      "my_hyphenated-name/app/helpers/my_hyphenated/name/application_helper.ts",
      /export namespace MyHyphenated \{\n {2}export namespace Name \{\n {4}export const ApplicationHelper = \{\};\n {2}\}\n\}/,
    );
    await t.assertFile(
      "my_hyphenated-name/app/views/layouts/my_hyphenated/name/application.html.tse",
      (contents: string) => {
        expect(contents).toMatch("<title>My hyphenated name</title>");
        expect(contents).toMatch(/stylesheetLinkTag\(\s*['"]my_hyphenated\/name\/application['"]/);
        assertNoMatch(
          /javascriptIncludeTag\(\s*['"]my_hyphenated\/name\/application['"]/,
          contents,
        );
      },
    );
  });

  it("create mountable application with mountable option and multiple hyphenates in name", async () => {
    await t.runGenerator([File.join(t.destinationRoot, "deep-hyphenated-name"), "--mountable"]);
    t.assertNoFile("deep-hyphenated-name/app/assets/javascripts/deep/hyphenated/name");
    await t.assertFile("deep-hyphenated-name/app/assets/stylesheets/deep/hyphenated/name");
    await t.assertFile("deep-hyphenated-name/app/assets/images/deep/hyphenated/name");
    await t.assertFile(
      "deep-hyphenated-name/config/routes.ts",
      /Deep\.Hyphenated\.Name\.Engine\.instance\(\)\.routes\(\)\.draw\(/,
    );
    await t.assertFile(
      "deep-hyphenated-name/lib/deep/hyphenated/name/version.ts",
      /export namespace Deep \{\n {2}export namespace Hyphenated \{\n {4}export namespace Name \{\n {6}export const VERSION = "0\.1\.0";\n {4}\}\n {2}\}\n\}/,
    );
    await t.assertFile(
      "deep-hyphenated-name/lib/deep/hyphenated/name/engine.ts",
      /export namespace Deep \{\n {2}export namespace Hyphenated \{\n {4}export namespace Name \{\n {6}export class Engine extends Trails\.Engine \{\n {8}static \{ this\.isolateNamespace\(Deep\.Hyphenated\.Name\); \}\n {6}\}\n {4}\}\n {2}\}\n\}/,
    );
    await t.assertFile(
      "deep-hyphenated-name/lib/deep/hyphenated/name.ts",
      /import "\.\/name\/engine\.js"/,
    );
    await t.assertFile(
      "deep-hyphenated-name/test/dummy/config/routes.ts",
      /this\.mount\(Deep\.Hyphenated\.Name\.Engine, \{ at: "\/deep-hyphenated-name" \}\)/,
    );
    await t.assertFile(
      "deep-hyphenated-name/app/controllers/deep/hyphenated/name/application_controller.ts",
      /export namespace Deep \{\n {2}export namespace Hyphenated \{\n {4}export namespace Name \{\n {6}export class ApplicationController extends ActionController\.Base \{\}\n {4}\}\n {2}\}\n\}\n/,
    );
    await t.assertFile(
      "deep-hyphenated-name/app/models/deep/hyphenated/name/application_record.ts",
      /export namespace Deep \{\n {2}export namespace Hyphenated \{\n {4}export namespace Name \{\n {6}export class ApplicationRecord extends ActiveRecord\.Base \{\n {8}static \{\n {10}this\.abstractClass = true;\n {8}\}\n {6}\}\n {4}\}\n {2}\}\n\}/,
    );
    await t.assertFile(
      "deep-hyphenated-name/app/jobs/deep/hyphenated/name/application_job.ts",
      /export namespace Deep \{\n {2}export namespace Hyphenated \{\n {4}export namespace Name \{\n {6}export class ApplicationJob extends ActiveJob\.Base/,
    );
    await t.assertFile(
      "deep-hyphenated-name/app/mailers/deep/hyphenated/name/application_mailer.ts",
      /export namespace Deep \{\n {2}export namespace Hyphenated \{\n {4}export namespace Name \{\n {6}export class ApplicationMailer extends ActionMailer\.Base \{\n {8}static \{\n {10}this\.default\(\{ from: "from@example\.com" \}\);\n {10}this\.layout\("mailer"\);\n {8}\}\n {6}\}\n {4}\}\n {2}\}\n\}/,
    );
    await t.assertFile(
      "deep-hyphenated-name/app/helpers/deep/hyphenated/name/application_helper.ts",
      /export namespace Deep \{\n {2}export namespace Hyphenated \{\n {4}export namespace Name \{\n {6}export const ApplicationHelper = \{\};\n {4}\}\n {2}\}\n\}/,
    );
    await t.assertFile(
      "deep-hyphenated-name/app/views/layouts/deep/hyphenated/name/application.html.tse",
      (contents: string) => {
        expect(contents).toMatch("<title>Deep hyphenated name</title>");
        expect(contents).toMatch(
          /stylesheetLinkTag\(\s*['"]deep\/hyphenated\/name\/application['"]/,
        );
        assertNoMatch(
          /javascriptIncludeTag\(\s*['"]deep\/hyphenated\/name\/application['"]/,
          contents,
        );
      },
    );
  });

  it("creating dummy without tests but with dummy path", async () => {
    await t.runGenerator([t.destinationRoot, "--dummy_path", "spec/dummy", "--skip-test"]);
    await t.assertDirectory("spec/dummy");
    await t.assertFile(
      "spec/dummy/config/application.ts",
      /\/\/\s*import\s+["']@blazetrails\/trailties\/test-unit\/trailtie["']/,
    );
    t.assertNoDirectory("test");
    await t.assertFile(".gitignore", (contents: string) => {
      expect(contents).toMatch(/spec\/dummy/);
    });
  });

  it("ensure that gitignore can be generated from a template for dummy path", async () => {
    await t.runGenerator([t.destinationRoot, "--dummy_path", "spec/dummy", "--skip-test"]);
    await t.assertFile(".gitignore", (contents: string) => {
      expect(contents).toMatch(/spec\/dummy/);
    });
  });

  it("dummy api application for api plugins", async () => {
    await t.runGenerator([t.destinationRoot, "--api"]);

    await t.assertFile("test/dummy/config/application.ts", (content: string) => {
      expect(content).toMatch("this.config.apiOnly = true");
    });
  });

  it("generating test files in full mode without unit test files", async () => {
    await t.runGenerator([t.destinationRoot, "-T", "--full"]);

    t.assertNoDirectory("test/integration/");
    t.assertNoDirectory("test");
    await t.assertFile("Rakefile.ts", (contents: string) => {
      assertNoMatch(/APP_RAKEFILE/, contents);
    });
    await t.assertFile("bin/trails", (contents: string) => {
      assertNoMatch(/APP_PATH/, contents);
    });
  });

  it("generating adds dummy app rake tasks without unit test files", async () => {
    await t.runGenerator([t.destinationRoot, "-T", "--mountable", "--dummy-path", "my_dummy_app"]);
    await t.assertFile("Rakefile.ts", /APP_RAKEFILE/);
    await t.assertFile("bin/trails", /APP_PATH/);
  });

  it("ensure that skip active record option is passed to app generator", async () => {
    await t.runGenerator([t.destinationRoot, "--skip_active_record"]);
    await t.assertFile("test/test_helper.ts", (contents: string) => {
      assertNoMatch(/ActiveRecord/, contents);
    });
  });

  it("ensure that database option is passed to app generator", async () => {
    await t.runGenerator([t.destinationRoot, "--database", "postgresql"]);
    await t.assertFile("test/dummy/config/database.ts", /postgres/);
  });

  it("no year in license file", async () => {
    const year = new Date().getFullYear();

    await t.runGenerator();
    await t.assertFile("MIT-LICENSE", (contents: string) => {
      assertNoMatch(new RegExp(`${year}`), contents);
    });
  });
  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — the debug gem has no trails npm package.
  it.skip("inclusion of a debugger", async () => {
    await t.runGenerator([t.destinationRoot, "--full"]);
    await t.assertFile("Gemfile", /# gem "debug"/);
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — a package.json has one manifest, so the Gemfile's development gems and the gemspec's runtime gems share it.
  it.skip("no development dependencies in gemspec", async () => {
    await t.runGenerator();
    await t.assertFile("package.json", (contents: string) => {
      assertNoMatch(/devDependencies/, contents);
    });
  });

  it("gemspec uses optimistic rails version constraint", async () => {
    const railsVersion = "1.2.3.4.pre5";

    const stub = vi.spyOn(Trails, "gemVersion").mockReturnValue(new Gem.Version(railsVersion));
    try {
      await t.runGenerator();
    } finally {
      stub.mockRestore();
    }

    await t.assertFile(
      "package.json",
      new RegExp(
        `"@blazetrails/trailties": ">= ${railsVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
      ),
    );
  });

  // PERMANENT-SKIP: CLAUDE.md, "importmap-rails and propshaft are out of scope; JavaScript is served by Vite (`vite_rails`)"
  it.skip("dummy application skips asset pipeline when simple railtie", async () => {
    await t.runGenerator();
    await t.assertFile("package.json", (content: string) =>
      assertNoMatch(/"propshaft": /, content),
    );
    t.assertNoFile("test/dummy/config/initializers/assets.ts");
    await t.assertFile("test/dummy/config/environments/development.ts", (content: string) => {
      assertNoMatch(/config\.assets/, content);
    });
  });

  // PERMANENT-SKIP: CLAUDE.md, "importmap-rails and propshaft are out of scope; JavaScript is served by Vite (`vite_rails`)"
  it.skip("dummy application configures asset pipeline when mountable", async () => {
    await t.runGenerator([t.destinationRoot, "--mountable"]);
    await t.assertFile("package.json", /"propshaft": /);
    await t.assertFile("test/dummy/config/initializers/assets.ts");
  });

  // PERMANENT-SKIP: CLAUDE.md, "importmap-rails and propshaft are out of scope; JavaScript is served by Vite (`vite_rails`)"
  it.skip("dummy application configures asset pipeline when full", async () => {
    await t.runGenerator([t.destinationRoot, "--full"]);
    await t.assertFile("package.json", /"propshaft": /);
    await t.assertFile("test/dummy/config/initializers/assets.ts");
    await t.assertFile("test/dummy/config/environments/development.ts", (content: string) => {
      assertNoMatch(/config\.assets/, content);
    });
  });

  // PERMANENT-SKIP: CLAUDE.md, "importmap-rails and propshaft are out of scope; JavaScript is served by Vite (`vite_rails`)"
  it.skip("dummy application skips asset pipeline when flag skip asset pipeline", async () => {
    await t.runGenerator([t.destinationRoot, "--mountable", "--skip-asset-pipeline"]);
    await t.assertFile("package.json", (content: string) =>
      assertNoMatch(/"propshaft": /, content),
    );
    t.assertNoFile("test/dummy/config/initializers/assets.ts");
    await t.assertFile("test/dummy/config/environments/development.ts", (content: string) => {
      assertNoMatch(/config\.assets/, content);
    });
  });

  // PERMANENT-SKIP: CLAUDE.md, "importmap-rails and propshaft are out of scope; JavaScript is served by Vite (`vite_rails`)"
  it.skip("no asset pipeline gem when no dummy application", async () => {
    await t.runGenerator([t.destinationRoot, "--mountable", "--skip-test"]);
    await t.assertFile("package.json", (content: string) =>
      assertNoMatch(/"propshaft": /, content),
    );
    t.assertNoDirectory("test/dummy");
  });

  it("creating plugin in app directory adds gemfile entry", async () => {
    await withSimulatedApp(async (gemfilePath) => {
      await File.writeAsync(gemfilePath, "{}");

      await t.runGenerator();

      await t.assertFile(gemfilePath, /"bukkits": "file:bukkits"/);
    });
  });

  it("skipping gemfile entry", async () => {
    await withSimulatedApp(async (gemfilePath) => {
      await t.runGenerator([t.destinationRoot, "--skip-gemfile-entry"]);

      await t.assertFile(gemfilePath, (contents: string) => {
        assertNoMatch(/"bukkits": "file:bukkits"/, contents);
      });
    });
  });

  it("git name and email in gemspec file", async () => {
    const name = await rbFBackquote("git config user.name").then(
      chomp,
      () => "TODO: Write your name",
    );
    const email = await rbFBackquote("git config user.email").then(
      chomp,
      () => "TODO: Write your email address",
    );

    await t.runGenerator();
    await t.assertFile("package.json", (contents: string) => {
      expect(contents).toMatch(name);
      expect(contents).toMatch(email);
    });
  });

  it("git name in license file", async () => {
    const name = await rbFBackquote("git config user.name").then(
      chomp,
      () => "TODO: Write your name",
    );

    await t.runGenerator();
    await t.assertFile("MIT-LICENSE", (contents: string) => {
      expect(contents).toMatch(name);
    });
  });
});

async function withSimulatedApp(block: (gemfilePath: string) => Promise<void>): Promise<void> {
  const gemfilePath = `${tmpRoot}/package.json`;
  setAppPath(`${tmpRoot}/config/application`);
  await FileUtils.touchAsync(gemfilePath);
  try {
    await block(gemfilePath);
  } finally {
    setAppPath(undefined);
    await FileUtils.rmAsync(gemfilePath);
  }
}
