import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "@blazetrails/actionmailbox/engine";
import { InstallGenerator } from "@blazetrails/actionmailbox/generators/action-mailbox/install/install-generator";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import { TestCase } from "../../lib/generators/test-case.js";
import { withDatabaseConfiguration } from "./generators-test-helper.js";

const databasesTasks = File.expandPath(
  "../../../activerecord/lib/trailties/databases.ts",
  import.meta.dirname,
);

const rakeDsl = File.expandPath("../../../rake/lib/rake.ts", import.meta.dirname);

const rubyCompat = File.expandPath("../../../ruby-compat/lib/index.ts", import.meta.dirname);

class TestApp extends Application {}
class InstallGeneratorTest extends TestCase {}
InstallGeneratorTest.destination(Dir.mktmpdir());
InstallGeneratorTest.tests(InstallGenerator);
registerSpecType(/^ActionMailbox::Generators::InstallGeneratorTest$/, InstallGeneratorTest);
let t: TestCase;

beforeAll(async () => {
  await TestApp.instance().loadGenerators();
});

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  Trails.application = TestApp.instance();
  Trails.application.config.setRoot(t.destinationRoot);

  const productionEnvConfig = File.expandPath(
    "config/environments/production.ts",
    t.destinationRoot,
  );
  FileUtils.mkdirP(File.dirname(productionEnvConfig));
  File.write(productionEnvConfig, "Trails.application.configure(function () {\n});\n");
  File.write(
    File.join(t.destinationRoot, "Rakefile.ts"),
    `import { DSL } from ${JSON.stringify(rakeDsl)};\n` +
      `import { rbFLoad } from ${JSON.stringify(rubyCompat)};\n\n` +
      `await rbFLoad(${JSON.stringify(databasesTasks)});\n` +
      'DSL.task("environment");\n',
  );
});

afterEach(() => {
  Trails.application = null;
});

describe("ActionMailbox::Generators::InstallGeneratorTest", () => {
  it("create action mailbox files", async () => {
    await withDatabaseConfiguration(undefined, async () => {
      await t.runGenerator();
    });

    await t.assertFile("app/mailboxes/application-mailbox.ts");
  });

  it("add action mailbox production environment config", async () => {
    await withDatabaseConfiguration(undefined, async () => {
      await t.runGenerator();
    });

    await t.assertFile("config/environments/production.ts", (content) => {
      expect(content).toMatch("Prepare the ingress controller used to receive mail");
      expect(content).toMatch('this.config.actionMailbox.ingress = "relay"');
    });
  });

  it("create migrations", async () => {
    await withDatabaseConfiguration(undefined, async () => {
      await t.runGenerator();
    });

    await t.assertMigration("db/migrate/create_active_storage_tables.active_storage.ts");
    await t.assertMigration("db/migrate/create_action_mailbox_tables.action_mailbox.ts");
  });
});
