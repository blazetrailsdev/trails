import { Dir } from "@blazetrails/ruby-compat/dir";
import { File } from "@blazetrails/ruby-compat/file";
import { FileUtils } from "@blazetrails/ruby-compat/file-utils";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { capture } from "@blazetrails/activesupport/testing/stream";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "@blazetrails/actiontext/engine";
import { InstallGenerator } from "@blazetrails/actiontext/generators/action-text/install/install-generator";
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
registerSpecType(/^ActionText::Generators::InstallGeneratorTest$/, InstallGeneratorTest);
let t: TestCase;
let runCommands: string[];

beforeAll(async () => {
  await TestApp.instance().loadGenerators();
});

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  Trails.application = TestApp.instance();
  Trails.application.config.setRoot(t.destinationRoot);

  FileUtils.mkdirP(`${t.destinationRoot}/app/javascript`);
  FileUtils.touch(`${t.destinationRoot}/app/javascript/application.js`);

  FileUtils.mkdirP(`${t.destinationRoot}/app/assets/stylesheets`);

  FileUtils.mkdirP(`${t.destinationRoot}/config`);
  FileUtils.touch(`${t.destinationRoot}/config/importmap.rb`);

  File.write(
    File.join(t.destinationRoot, "Rakefile.ts"),
    `import { DSL } from ${JSON.stringify(rakeDsl)};\n` +
      `import { rbFLoad } from ${JSON.stringify(rubyCompat)};\n\n` +
      `await rbFLoad(${JSON.stringify(databasesTasks)});\n` +
      'DSL.task("environment");\n',
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  Trails.application = null;
});

async function runGeneratorInstance(): Promise<string> {
  runCommands = [];
  const generator = t.generator() as InstallGenerator;
  vi.spyOn(generator, "run").mockImplementation(async (command) => {
    runCommands.push(String(command));
    return true;
  });

  let content = "";
  await withDatabaseConfiguration(undefined, async () => {
    content = await capture("stdout", () => generator.invokeAll());
  });
  return content;
}

describe("ActionText::Generators::InstallGeneratorTest", () => {
  it("installs JavaScript dependencies", async () => {
    File.write(`${t.destinationRoot}/package.json`, "{}");

    await runGeneratorInstance();
    expect(runCommands.join("\n")).toMatch(/pnpm add @rails\/actiontext trix/);
  });

  it("throws warning for missing entry point", async () => {
    FileUtils.rm(`${t.destinationRoot}/app/javascript/application.js`);
    expect(await runGeneratorInstance()).toMatch(
      "You must import the @rails/actiontext and trix JavaScript modules",
    );
  });

  it("imports JavaScript dependencies in application.js", async () => {
    await runGeneratorInstance();

    await t.assertFile("app/javascript/application.js", (content) => {
      expect(content).toMatch(/^import "@rails\/actiontext"/m);
      expect(content).toMatch(/^import "trix"/m);
    });
  });

  it("pins JavaScript dependencies in importmap.rb", async () => {
    await runGeneratorInstance();

    await t.assertFile("config/importmap.rb", (content) => {
      expect(content).toMatch(/pin "@rails\/actiontext"/);
      expect(content).toMatch(/pin "trix"/);
    });
  });

  it("creates Action Text stylesheet", async () => {
    await runGeneratorInstance();
    await t.assertFile("app/assets/stylesheets/actiontext.css");
  });

  it("creates Active Storage view partial", async () => {
    await runGeneratorInstance();
    await t.assertFile("app/views/active-storage/blobs/_blob.html.tse");
  });

  it("creates Action Text content view layout", async () => {
    await runGeneratorInstance();
    await t.assertFile("app/views/layouts/action-text/contents/_content.html.tse");
  });

  it("creates migrations", async () => {
    await runGeneratorInstance();
    await t.assertMigration("db/migrate/create_active_storage_tables.active_storage.ts");
    await t.assertMigration("db/migrate/create_action_text_tables.action_text.ts");
  });

  it("uncomments image_processing gem", async () => {
    const gemfile = File.expandPath("package.json", t.destinationRoot);
    FileUtils.mkdirP(File.dirname(gemfile));
    File.write(gemfile, `# "@blazetrails/image-processing"`);

    await runGeneratorInstance();

    await t.assertFile(gemfile, (content) => {
      expect(content).toBe(`"@blazetrails/image-processing"`);
    });
  });
});
