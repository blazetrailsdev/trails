import { Dir } from "@blazetrails/ruby-compat/dir";
import { File } from "@blazetrails/ruby-compat/file";
import { TopLevel } from "@blazetrails/activesupport";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { capture } from "@blazetrails/activesupport/testing/stream";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "@blazetrails/actioncable/engine";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import "../../lib/trailties/active-record.js";
import "../../lib/test-unit/trailtie.js";
import { AppGenerator } from "../../lib/generators/trails/app/app-generator.js";
import { linkFrameworkPackages } from "./generators-test-helper.js";
import { TestCase } from "../../lib/generators/test-case.js";

class TestApp extends Application {}
class AuthenticationGeneratorTest extends TestCase {}
AuthenticationGeneratorTest.destination(Dir.mktmpdir());
registerSpecType(/^AuthenticationGeneratorTest$/, AuthenticationGeneratorTest);
let AuthenticationGenerator: typeof import("../../lib/generators/trails/authentication/authentication-generator.js").AuthenticationGenerator;
let t: TestCase;
let bundleCommands: unknown[][];
let trailsCommands: string[];

beforeAll(async () => {
  await TestApp.instance().loadGenerators();
  ({ AuthenticationGenerator } =
    await import("../../lib/generators/trails/authentication/authentication-generator.js"));
});

beforeEach(async (context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  Trails.application = TestApp.instance();
  Trails.application.config.setRoot(t.destinationRoot);

  AuthenticationGeneratorTest.tests(AppGenerator);
  await t.runGenerator([t.destinationRoot, "--no-skip-bundle"]);

  AuthenticationGeneratorTest.tests(AuthenticationGenerator);

  const path = File.join(t.destinationRoot, "package.json");
  const manifest = JSON.parse(File.read(path));
  manifest.dependencies["@blazetrails/bcrypt"] = "workspace:*";
  File.write(path, JSON.stringify(manifest, null, 2));
  await linkFrameworkPackages(t.destinationRoot);
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
  Trails.application = null;
});

async function runGeneratorInstance(): Promise<string> {
  bundleCommands = [];
  const generator = t.generator();
  (generator as InstanceType<typeof AuthenticationGenerator>).installCommand = async (
    command,
    ...args
  ) => {
    bundleCommands.push([command, ...args]);
  };
  trailsCommands = [];
  generator.trailsCommand = async (command) => {
    trailsCommands.push(command);
    return undefined;
  };
  return capture("stdout", () => generator.invokeAll());
}

describe("AuthenticationGeneratorTest", { timeout: 120_000 }, () => {
  it("authentication generator", async () => {
    await t.runGenerator([]);

    await t.assertFile("app/models/user.ts");
    await t.assertFile("app/models/current.ts");
    await t.assertFile("app/models/session.ts");
    await t.assertFile("app/controllers/sessions-controller.ts");
    await t.assertFile("app/controllers/concerns/authentication.ts");
    await t.assertFile("app/views/sessions/new.html.tse");
    await t.assertFile("app/channels/application-cable/connection.ts");

    await t.assertFile("app/controllers/application-controller.ts", (content) => {
      const lines = content.split("\n");
      const classIndex = lines.findIndex((line) => line.startsWith("export class "));
      const [classLine, includesLine] = lines.slice(classIndex, classIndex + 2);

      expect(classLine, "does not affect class definition").toBe(
        "export class ApplicationController extends ActionController.Base {",
      );
      expect(includesLine, "includes module on first line of class definition").toBe(
        '  declare static allowUnauthenticatedAccess: Extended<typeof ClassMethods>["allowUnauthenticatedAccess"];',
      );
    });

    await t.assertFile("package.json", (content) => {
      expect(content).toMatch(/\n\s*"@blazetrails\/bcrypt"/);
    });

    await t.assertFile("config/routes.ts", (content) => {
      expect(content).toMatch(/this\.resource\("session"\)/);
    });

    await t.assertMigration("db/migrate/create_sessions.ts", (content) => {
      expect(content).toMatch(/t\.references\("user", \{ null: false, foreignKey: true \}\)/);
    });

    await t.assertMigration("db/migrate/create_users.ts", (content) => {
      expect(content).toMatch(/t\.string\("password_digest", \{ null: false \}\)/);
    });

    await t.assertFile("test/models/user.test.ts");
    await t.assertFile("test/fixtures/users.yml");
  });

  it("authentication generator without bcrypt in gemfile", async () => {
    const path = File.join(t.destinationRoot, "package.json");
    const manifest = JSON.parse(File.read(path));
    delete manifest.dependencies["@blazetrails/bcrypt"];
    File.write(path, JSON.stringify(manifest, null, 2));

    await runGeneratorInstance();

    expect(bundleCommands).toContainEqual(["add @blazetrails/bcrypt", {}, { quiet: true }]);
  });

  it("authentication generator with api flag", async () => {
    await t.runGenerator(["--api"]);

    await t.assertFile("app/models/user.ts");
    await t.assertFile("app/models/current.ts");
    await t.assertFile("app/models/session.ts");
    await t.assertFile("app/controllers/sessions-controller.ts");
    await t.assertFile("app/controllers/concerns/authentication.ts");
    t.assertNoFile("app/views/sessions/new.html.tse");

    await t.assertFile("app/controllers/application-controller.ts", (content) => {
      const lines = content.split("\n");
      const classIndex = lines.findIndex((line) => line.startsWith("export class "));
      const [classLine, includesLine] = lines.slice(classIndex, classIndex + 2);

      expect(classLine, "does not affect class definition").toBe(
        "export class ApplicationController extends ActionController.Base {",
      );
      expect(includesLine, "includes module on first line of class definition").toBe(
        '  declare static allowUnauthenticatedAccess: Extended<typeof ClassMethods>["allowUnauthenticatedAccess"];',
      );
    });

    await t.assertFile("package.json", (content) => {
      expect(content).toMatch(/\n\s*"@blazetrails\/bcrypt"/);
    });

    await t.assertFile("config/routes.ts", (content) => {
      expect(content).toMatch(/this\.resource\("session"\)/);
    });

    await t.assertMigration("db/migrate/create_sessions.ts", (content) => {
      expect(content).toMatch(/t\.references\("user", \{ null: false, foreignKey: true \}\)/);
    });

    await t.assertMigration("db/migrate/create_users.ts", (content) => {
      expect(content).toMatch(/t\.string\("password_digest", \{ null: false \}\)/);
    });

    await t.assertFile("test/models/user.test.ts");
    await t.assertFile("test/fixtures/users.yml");
  });

  it("model test is skipped if test framework is given", async () => {
    const content = await t.runGenerator(["authentication", "-t", "rspec"]);
    expect(content).toMatch(/rspec \[not found\]/);
    t.assertNoFile("test/models/user.test.ts");
  });

  it("connection class skipped without action cable", async () => {
    const oldValue = TopLevel.ActionCable!.Engine;
    delete TopLevel.ActionCable!.Engine;
    try {
      t.generator([t.destinationRoot]);
      await runGeneratorInstance();

      t.assertNoFile("app/channels/application-cable/connection.ts");
    } finally {
      TopLevel.ActionCable!.Engine = oldValue;
    }
  });
});
