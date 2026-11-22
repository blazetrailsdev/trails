import {
  Bundler,
  Dir,
  File,
  FileUtils,
  Gem,
  Process,
  env,
  rbFBackquote,
} from "@blazetrails/ruby-compat";
import { buildTemplates } from "@blazetrails/trails-tsc";
import { assertNoChanges, assertNoMatch } from "@blazetrails/activesupport/testing/assertions";
import { capture, quietly } from "@blazetrails/activesupport/testing/stream";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Actions from "../../lib/generators/actions.js";
import { AppGenerator } from "../../lib/generators/trails/app/app-generator.js";
import { TestCase } from "../../lib/generators/test-case.js";
import {
  assertComposeFile,
  assertDevcontainerJsonFile,
  runAppUpdate,
} from "./generators-test-helper.js";
import { VERSION } from "../../lib/gem-version.js";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import { Generators } from "../../lib/generators.js";

class AppGeneratorApp extends Application {}
const gitVersion = new Gem.Version(/\d+.\d+.\d+/.exec(await rbFBackquote("git --version"))![0]);
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

async function runGeneratorInstance(
  args: string[],
  bundleCommands: string[] = [],
): Promise<string[]> {
  const railsCommands: string[] = [];
  const proto = AppGenerator.prototype as unknown as {
    isInstall(): boolean;
    installCommand(command: string): Promise<void>;
  };
  const stubs = [
    vi.spyOn(proto, "isInstall").mockReturnValue(true),
    vi.spyOn(proto, "installCommand").mockImplementation(async (command: string) => {
      bundleCommands.push(command);
    }),
    vi.spyOn(Actions, "trailsCommand").mockImplementation(async (command: string) => {
      railsCommands.push(command);
    }),
  ];
  try {
    await t.runGenerator(args);
  } finally {
    for (const stub of stubs) stub.mockRestore();
  }
  return railsCommands;
}

function json(content: string) {
  return JSON.parse(content);
}

function assertOption(generator: { options: unknown }, option: string): void {
  expect(
    (generator.options as Record<string, unknown>)[option],
    `Expected generator option :${option} to be truthy.`,
  ).toBeTruthy();
}

function assertNodeFiles(): Promise<void> {
  return t
    .assertFile(".node-version", (content: string) => {
      expect(content).toMatch(/\d+\.\d+\.\d+/);
    })
    .then(() =>
      t.assertFile("Dockerfile", (content: string) => {
        expect(content).toMatch("pnpm");
      }),
    );
}

function resetDesc(): void {
  delete (AppGenerator as unknown as { _desc?: string })._desc;
}

function assertNotOption(generator: { options: unknown }, option: string): void {
  expect(
    (generator.options as Record<string, unknown>)[option],
    `Expected generator option :${option} to be falsy.`,
  ).toBeFalsy();
}

describe("AppGeneratorTest", () => {
  it("version control initializes git repo", async () => {
    await t.runGenerator([t.destinationRoot]);
    await t.assertDirectory(".git");
  });

  it("application name is detected if it exists and app folder renamed", async () => {
    const appRoot = File.join(t.destinationRoot, "myapp");
    const appMovedRoot = File.join(t.destinationRoot, "myapp_moved");

    await t.runGenerator([appRoot]);
    FileUtils.mv(appRoot, appMovedRoot);
    await runAppUpdate.call(t, appMovedRoot);

    await t.assertFile(`${appMovedRoot}/config/environment.ts`, /Trails\.initialize\(\)/);
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

  it("quiet option", async () => {
    const output = await t.runGenerator([File.join(t.destinationRoot, "myapp"), "--quiet"]);
    expect(output).toBeEmpty();
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
      /^\/\/\s+import\s+"@blazetrails\/actioncable\/engine";/m,
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
    await t.assertFile("things-43/config/application.ts", /^export const Things43 = /m);
  });

  it("name option", async () => {
    await t.runGenerator([t.destinationRoot, "--name=my-app"]);
    await t.assertFile("config/application.ts", /^export const MyApp = /m);
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

  it("apply trails template class method runs bundle and after bundle callbacks", async () => {
    await t.runGenerator();

    const template = File.join(t.destinationRoot, "lib/template.mjs");
    await File.writeAsync(
      template,
      'export default (g) => g.afterBundle(() => g.createFile("after_bundle_callback_ran"));\n',
    );

    const runInstall = vi
      .spyOn(AppGenerator.prototype as unknown as { runInstall(): Promise<void> }, "runInstall")
      .mockResolvedValue(undefined);
    try {
      await capture("stdout", () => AppGenerator.applyTrailsTemplate(template, t.destinationRoot));
      expect(runInstall).toHaveBeenCalledOnce();
    } finally {
      runInstall.mockRestore();
    }

    await t.assertFile("after_bundle_callback_ran");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — dartsass-rails is not ported, and with importmap not offered (CLAUDE.md, "importmap-rails and propshaft are out of scope") every app is a JS runtime, so `runCss` (`app_base.rb:724-734`) never reaches `dartsass:install`.
  it.skip("css option with asset pipeline sass", async () => {
    const railsCommands = await runGeneratorInstance([t.destinationRoot, "--css=sass"]);

    expect(railsCommands, "`dartsass:install` expected to be called, but wasn't.").toContain(
      "dartsass:install",
    );
    await assertGem("dartsass-rails");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — cssbundling-rails is not ported.
  it.skip("css option with sass uses cssbundling gem when using node", async () => {
    await t.runGenerator([t.destinationRoot, "--css=sass", "--javascript=esbuild"]);
    await assertGem("cssbundling-rails");
    await assertNoGem("dartsass-rails");
  });

  it("css option with asset pipeline tailwind", async () => {
    const railsCommands = await runGeneratorInstance([t.destinationRoot, "--css=tailwind"]);

    expect(railsCommands, "`css:install:tailwind` expected to be called, but wasn't.").toContain(
      "css:install:tailwind",
    );
  });

  it("css option with cssbundling gem", async () => {
    const railsCommands = await runGeneratorInstance([t.destinationRoot, "--css=postcss"]);

    expect(railsCommands, "`css:install:postcss` expected to be called, but wasn't.").toContain(
      "css:install:postcss",
    );
    await assertNodeFiles();
  });

  it("configuration of solid", async () => {
    await runGeneratorInstance([t.destinationRoot]);

    await assertGem("@blazetrails/solid-cache");
    await assertGem("@blazetrails/solid-queue");
    await assertGem("@blazetrails/solid-cable");

    await t.assertFile("config/database.ts", (content: string) => {
      expect(content).toMatch(/cache:/);
      expect(content).toMatch(/queue:/);
      expect(content).toMatch(/cable:/);
    });
  });

  it("inclusion of kamal files", async () => {
    await runGeneratorInstance([t.destinationRoot]);

    await t.assertFile("config/deploy.yml");
    await t.assertFile(".kamal/secrets");
  });

  it("kamal files are skipped if required", async () => {
    await runGeneratorInstance([t.destinationRoot, "--skip-kamal"]);

    t.assertNoFile("config/deploy.yml");
    t.assertNoFile(".kamal/secrets");
  });

  it("inclusion of kamal storage volume", async () => {
    await runGeneratorInstance([t.destinationRoot]);

    await t.assertFile("config/deploy.yml", (content: string) => {
      expect(content).toMatch(/storage:\/app\/storage/);
    });
  });

  it("inclusion of kamal storage volume if only skip active storage is given", async () => {
    await runGeneratorInstance([t.destinationRoot, "--skip-active-storage"]);

    await t.assertFile("config/deploy.yml", (content: string) => {
      expect(content).toMatch(/storage:\/app\/storage/);
    });
  });

  it("database yml skip kamal", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-kamal"]);

    await t.assertFile("config/database.ts", (content: string) => {
      expect(content).toMatch("db/queue_migrate");
      expect(content).toMatch("db/cache_migrate");
      expect(content).toMatch("db/cable_migrate");
    });
  });

  it("skip bundle", async () => {
    const bundleCommands: string[] = [];
    const stub = vi
      .spyOn(
        AppGenerator.prototype as unknown as { installCommand(c: string): Promise<void> },
        "installCommand",
      )
      .mockImplementation(async (command: string) => {
        bundleCommands.push(command);
      });
    try {
      await t.runGenerator([t.destinationRoot, "--skip-install"]);
    } finally {
      stub.mockRestore();
    }

    expect(bundleCommands).toBeEmpty();
    await t.assertFile("package.json");
  });

  it("invalid javascript option raises an error", async () => {
    const content = await capture("stderr", () =>
      t.runGenerator([t.destinationRoot, "-j", "unknown"]),
    );
    expect(content).toMatch(/Expected '--javascript' to be one of/);
  });

  it("invalid css option raises an error", async () => {
    const content = await capture("stderr", () =>
      t.runGenerator([t.destinationRoot, "-c", "unknown"]),
    );
    expect(content).toMatch(/Expected '--css' to be one of/);
  });

  it("app update does not generate assets initializer when asset pipeline is not used", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-asset-pipeline"]);
    await runAppUpdate.call(t);

    t.assertNoFile("config/initializers/assets.ts");
  });

  it("app update does not generate action cable contents when skip action cable is given", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-action-cable"]);
    await runAppUpdate.call(t);

    t.assertNoFile("config/cable.ts");
    await t.assertFile("config/environments/production.ts", (content: string) => {
      assertNoMatch(/config\.actionCable/, content);
    });
    await t.assertFile("config/database.ts", (content: string) => {
      assertNoMatch(/cable:/, content);
    });
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — bootsnap is not ported.
  it.skip("app update does not generate bootsnap contents when skip bootsnap is given", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-bootsnap"]);
    await runAppUpdate.call(t);

    await t.assertFile("config/boot.ts", (content: string) => {
      assertNoMatch(/import "bootsnap\/setup"/, content);
    });
  });

  it("app update preserves skip rubocop", async () => {
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

  it("app update preserves skip system test", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-system-test"]);

    await Dir.chdir(t.destinationRoot, async () => {
      const config = "config/application.ts";
      await t.assertFile(config, /generators\(\)\.systemTests/);
      await assertNoChanges(
        async () =>
          (await File.readlinesAsync(config)).filter((l) => /generators\(\)\.systemTests/.test(l)),
        null,
        {},
        () => runAppUpdate.call(t),
      );
    });
  });

  it("app update does not generate active storage contents when skip active storage is given", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-active-storage"]);

    await runAppUpdate.call(t);

    await t.assertFile("config/environments/development.ts", (content: string) => {
      assertNoMatch(/config\.activeStorage/, content);
    });
    await t.assertFile("config/environments/production.ts", (content: string) => {
      assertNoMatch(/config\.activeStorage/, content);
    });
    await t.assertFile("config/environments/test.ts", (content: string) => {
      assertNoMatch(/config\.activeStorage/, content);
    });

    t.assertNoFile("config/storage.ts");
  });

  it("app update does not generate active storage contents when skip active record is given", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-active-record"]);
    await runAppUpdate.call(t);

    await t.assertFile("config/environments/development.ts", (content: string) => {
      assertNoMatch(/config\.activeStorage/, content);
    });
    await t.assertFile("config/environments/production.ts", (content: string) => {
      assertNoMatch(/config\.activeStorage/, content);
    });
    await t.assertFile("config/environments/test.ts", (content: string) => {
      assertNoMatch(/config\.activeStorage/, content);
    });

    t.assertNoFile("config/storage.ts");
  });

  it("app update silence deprecate message", async () => {
    await t.runGenerator();

    await Dir.chdir(t.destinationRoot, async () => {
      await File.open("config/initializers/deprecation.ts", "a", (file) =>
        file.puts(
          'import { Trails } from "@blazetrails/trailties";',
          "Trails.deprecator().warn('test deprecation message');",
        ),
      );

      const stderr = await capture("stderr", () => runAppUpdate.call(t));
      assertNoMatch(/test deprecation message/, stderr);
    });
  });

  it("generator skips action mailbox when skip action mailbox is given", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-action-mailbox"]);
    await t.assertFile(
      "config/application.ts",
      /^\/\/\s+import\s+"@blazetrails\/actionmailbox\/engine"/m,
    );
  });

  it("generator skips action text when skip action text is given", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-action-text"]);
    await t.assertFile(
      "config/application.ts",
      /^\/\/\s+import\s+"@blazetrails\/actiontext\/engine"/m,
    );
  });

  it("app update does not change config target version", async () => {
    await t.runGenerator();

    await Dir.chdir(t.destinationRoot, async () => {
      const config = "config/application.ts";
      const content = await File.readAsync(config);
      await File.writeAsync(
        config,
        content.replace(/config\.loadDefaults\("[^"]*"\)/g, 'config.loadDefaults("5.1")'),
      );
    });

    await runAppUpdate.call(t);

    await t.assertFile("config/application.ts", /\s+this\.config\.loadDefaults\("5\.1"\)/);
  });

  it("app update does not change app name when app name is hyphenated name", async () => {
    const appRoot = File.join(t.destinationRoot, "hyphenated-app");
    await t.runGenerator([appRoot, "-d", "postgresql"]);

    await t.assertFile(`${appRoot}/config/database.ts`, (content: string) => {
      expect(content).toMatch(/hyphenated_app_development/);
      assertNoMatch(/hyphenated-app_development/, content);
    });

    await t.assertFile(`${appRoot}/config/cable.ts`, (content: string) => {
      expect(content).toMatch(/hyphenated_app/);
      assertNoMatch(/hyphenated-app/, content);
    });

    await runAppUpdate.call(t, appRoot);

    await t.assertFile(`${appRoot}/config/cable.ts`, (content: string) => {
      expect(content).toMatch(/hyphenated_app/);
      assertNoMatch(/hyphenated-app/, content);
    });
  });

  it("application names are not singularized", async () => {
    await t.runGenerator([File.join(t.destinationRoot, "hats")]);
    await t.assertFile("hats/config/environment.ts", /Trails\.initialize\(\)/);
  });

  it("application name is normalized in config", async () => {
    await t.runGenerator([File.join(t.destinationRoot, "MyWebSite"), "-d", "postgresql"]);
    await t.assertFile(
      "MyWebSite/app/views/layouts/application.html.tse",
      /contentFor\("title"\) \?\? "My Web Site"/,
    );
    await t.assertFile("MyWebSite/config/database.ts", /my_web_site_production/);
  });

  it("gemfile has no whitespace errors", async () => {
    await t.runGenerator();
    const absolute = File.expandPath("package.json", t.destinationRoot);
    for (const line of await File.readlinesAsync(absolute)) {
      assertNoMatch(/^[ \t]+$/, line);
    }
  });

  it("config database is added by default", async () => {
    await t.runGenerator();
    await t.assertFile("config/database.ts", /sqlite3/);
    await t.assertFile("package.json", /"better-sqlite3": "\^13/);
  });

  it("config mysql database", async () => {
    await t.runGenerator([t.destinationRoot, "-d", "mysql"]);
    await t.assertFile("config/database.ts", /mysql/);
    await t.assertFile("package.json", /"mysql2": "\^3/);
  });

  it("config database app name with period", async () => {
    await t.runGenerator([File.join(t.destinationRoot, "common.usage.com"), "-d", "postgresql"]);
    await t.assertFile("common.usage.com/config/database.ts", /common_usage_com/);
  });

  it("config postgresql database", async () => {
    await t.runGenerator([t.destinationRoot, "-d", "postgresql"]);
    await t.assertFile("config/database.ts", /postgresql/);
    await t.assertFile("package.json", /"pg": "\^8/);
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — Puma is not ported.
  it.skip("generator defaults to puma version", async () => {
    await t.runGenerator([t.destinationRoot]);
    await t.assertFile("package.json", /"puma": "\W+ \d/);
  });

  it("action cable redis gems", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-solid"]);
    await assertNoGem("redis");
  });

  it("generator configures decrypted diffs by default", async () => {
    await t.runGenerator();
    await t.assertFile(".gitattributes", /\.enc diff=/);
  });

  it("generator does not configure decrypted diffs when skip decrypted diffs is given", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-decrypted-diffs"]);
    await t.assertFile(".gitattributes", (content: string) => {
      assertNoMatch(/\.enc diff=/, content);
    });
  });

  it("generator if skip test is given", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-test"]);

    await t.assertFile(
      "config/application.ts",
      /^\/\/\s+import\s+"@blazetrails\/trailties\/test-unit\/trailtie"/m,
    );

    await assertNoGem("playwright");
    await assertNoGem("@playwright/test");

    t.assertNoDirectory("test");

    await t.assertFile(".github/workflows/ci.yml", (file: string) => {
      assertNoMatch(/test:.\s*runs-on/s, file);
    });
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — jbuilder is not ported.
  it.skip("generator if skip jbuilder is given", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-jbuilder"]);
    await assertNoGem("jbuilder");
  });

  it("generator if skip active job is given", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-active-job"]);
    t.assertNoFile("app/jobs/application-job.ts");
    await t.assertFile("config/environments/production.ts", (content: string) => {
      assertNoMatch(/config\.activeJob/, content);
    });
    await t.assertFile("config/application.ts", (content: string) => {
      expect(content).toMatch(/^\/\/\s+import\s+"@blazetrails\/trailties\/trailties\/active-job"/m);
      expect(content).toMatch(/^\/\/\s+import\s+"@blazetrails\/activestorage\/engine"/m);
      expect(content).toMatch(
        /^\/\/\s+import\s+"@blazetrails\/trailties\/trailties\/action-mailer"/m,
      );
    });
  });

  it("generator if skip system test is given", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-system-test"]);
    await assertNoGem("playwright");
    await assertNoGem("@playwright/test");

    await t.assertDirectory("test");

    t.assertNoDirectory("test/system");

    await t.assertFile(".github/workflows/ci.yml", (content: string) => {
      expect(content).toMatch(/db:test:prepare && pnpm test/);
      assertNoMatch(/test:system/, content);
      assertNoMatch(/screenshots/, content);
    });
  });

  it("viewport meta tag is present", async () => {
    await t.runGenerator([t.destinationRoot]);

    await t.assertFile("app/views/layouts/application.html.tse", (contents: string) => {
      expect(contents).toMatch(/<meta name="viewport"/);
    });
  });

  it("javascript is skipped if required", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-javascript"]);

    t.assertNoFile("app/javascript");

    await t.assertFile("app/views/layouts/application.html.tse", (contents: string) => {
      expect(contents).toMatch(/stylesheetLinkTag\("application"\) %>/);
    });

    await t.assertFile(".github/workflows/ci.yml", (file: string) => {
      assertNoMatch(/scan_js/, file);
    });
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — jbuilder is not ported.
  it.skip("inclusion of jbuilder", async () => {
    await t.runGenerator();
    await assertGem("jbuilder");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — the debug gem has no trails npm package.
  it.skip("inclusion of a debugger", async () => {
    await t.runGenerator();
    await assertGem("debug");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — thruster is not ported.
  it.skip("inclusion of thruster", async () => {
    await t.runGenerator();
    await assertGem("thruster");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — thruster is not ported.
  it.skip("thruster is skipped if required", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-thruster"]);

    await assertNoGem("thruster");
    t.assertNoFile("bin/thrust");
  });

  it("inclusion of rubocop", async () => {
    await t.runGenerator();
    await assertGem("eslint");
    await t.assertFile(
      "config/environments/development.ts",
      /\/\/ Apply autocorrection by ESLint to files generated by `bin\/trails generate`\./,
    );
  });

  it("rubocop is skipped if required", async () => {
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

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — brakeman is not ported.
  it.skip("inclusion of brakeman", async () => {
    await t.runGenerator();
    await assertGem("brakeman");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — brakeman is not ported.
  it.skip("brakeman is skipped if required", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-brakeman"]);

    await assertNoGem("brakeman");
    t.assertNoFile("bin/brakeman");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — brakeman is not ported.
  it.skip("both brakeman and rubocop binstubs are skipped if required", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-brakeman", "--skip-eslint"]);

    t.assertNoFile("bin/eslint");
    t.assertNoFile("bin/brakeman");
  });

  it("kamal storage volume is skipped if required", async () => {
    await runGeneratorInstance([
      t.destinationRoot,
      "--skip-active-storage",
      "--database=postgresql",
    ]);

    await t.assertFile("config/deploy.yml", (content: string) => {
      assertNoMatch(/storage:\/app\/storage/, content);
    });
  });

  it("usage read from file", async () => {
    resetDesc();
    const usage = File.join(templateRoot, "USAGE");
    await File.writeAsync(usage, "USAGE FROM FILE");
    await buildTemplates([usage]);
    const stub = vi
      .spyOn(AppGenerator as unknown as { usagePath(): Promise<string | null> }, "usagePath")
      .mockResolvedValue(usage);
    try {
      expect(await AppGenerator.desc()).toBe("USAGE FROM FILE");
      expect(stub).toHaveBeenCalledOnce();
    } finally {
      stub.mockRestore();
      resetDesc();
    }
  });

  it("default usage", async () => {
    resetDesc();
    const stub = vi
      .spyOn(AppGenerator as unknown as { usagePath(): Promise<string | null> }, "usagePath")
      .mockResolvedValue(null);
    try {
      expect(await AppGenerator.desc()).toMatch(/Create trails files for app generator/);
      expect(stub).toHaveBeenCalledOnce();
    } finally {
      stub.mockRestore();
      resetDesc();
    }
  });

  it("default namespace", () => {
    expect(AppGenerator.namespace()).toMatch("trails:app");
  });

  it("file is added for backwards compatibility", async () => {
    const generator = t.generator() as unknown as {
      file(path: string, data: string): Promise<unknown>;
    };
    await capture("stdout", () => generator.file("lib/test-file.ts", "here's test data"));
    await t.assertFile("lib/test-file.ts", "here's test data");
  });

  it("pretend option", async () => {
    const output = (await t.runGenerator([
      File.join(t.destinationRoot, "myapp"),
      "--pretend",
    ])) as string;
    assertNoMatch(/run {2}pnpm install/, output);
    assertNoMatch(/run {2}git init/, output);
  });

  it("force option overwrites every file except master key", async () => {
    await t.runGenerator([File.join(t.destinationRoot, "myapp")]);
    const output = (await t.runGenerator([
      File.join(t.destinationRoot, "myapp"),
      "--force",
    ])) as string;
    expect(output).toMatch(/force/);
    assertNoMatch(/force {2}config\/master\.key/, output);
  });

  it("application name with spaces", async () => {
    const path = File.join(t.destinationRoot, "foo bar");

    await t.runGenerator([path, "-d", "postgresql"]);

    await t.assertFile("foo bar/config/database.ts", /database: "foo_bar_development"/);
  });

  it("generation runs bundle install", async () => {
    const bundleCommands: string[] = [];
    await runGeneratorInstance([t.destinationRoot], bundleCommands);

    expect(bundleCommands.filter((c) => /^install/.test(c))).not.toBeEmpty();
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — `bundle lock --add-platform` is not ported.
  it.skip("generation runs bundle lock for linux", async () => {
    const bundleCommands: string[] = [];
    await runGeneratorInstance([t.destinationRoot], bundleCommands);

    expect(bundleCommands.filter((c) => /^lock --add-platform=\S+-linux/.test(c))).not.toEqual([]);
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — `Bundler.with_original_env` is not ported.
  it.skip("generation use original bundle environment", async () => {
    const generator = t.generator([t.destinationRoot]) as unknown as {
      execBundleCommand(): void;
      invokeAll(): Promise<unknown>;
    };

    vi.spyOn(
      Bundler as unknown as { originalEnv(): Record<string, string> },
      "originalEnv",
    ).mockReturnValue({ BUNDLE_RUBYONRAILS__ORG: "user:pass" });
    vi.spyOn(generator, "execBundleCommand").mockImplementation(() => {
      expect(env["BUNDLE_RUBYONRAILS__ORG"]).toBe("user:pass");
    });
    await quietly(() => generator.invokeAll());
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — the bundler binstub is not ported.
  it.skip("bundler binstub", async () => {
    const bundleCommands: string[] = [];
    await runGeneratorInstance([t.destinationRoot], bundleCommands);

    expect(bundleCommands.filter((c) => c === "binstubs bundler")).toHaveLength(1);
  });

  it("skip javascript option", async () => {
    const railsCommands = await runGeneratorInstance([t.destinationRoot, "--skip-javascript"]);

    expect(railsCommands).not.toContain("importmap:install");
    expect(railsCommands).not.toContain("turbo:install stimulus:install");

    await assertNoGem("vite-plugin-ruby");
    await assertNoGem("jsbundling-rails");

    await t.assertFile("config/initializers/content-security-policy.ts", (content: string) => {
      assertNoMatch(/policy\.connectSrc/, content);
    });

    await t.assertFile(".gitattributes", (content: string) => {
      assertNoMatch(/pnpm-lock\.yaml/, content);
    });
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — jsbundling-rails is not ported.
  it.skip("webpack option", async () => {
    const railsCommands = await runGeneratorInstance([t.destinationRoot, "--javascript=webpack"]);
    expect(railsCommands).toContain("javascript:install:webpack");
    await assertGem("jsbundling-rails");
    await assertNodeFiles();
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — jsbundling-rails is not ported.
  it.skip("esbuild option", async () => {
    const railsCommands = await runGeneratorInstance([t.destinationRoot, "--javascript=esbuild"]);
    expect(railsCommands).toContain("javascript:install:esbuild");
    await assertGem("jsbundling-rails");
    await assertNodeFiles();
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — jsbundling-rails is not ported.
  it.skip("esbuild option with javascript argument", async () => {
    await t.runGenerator([t.destinationRoot, "--javascript", "esbuild"]);
    await assertGem("jsbundling-rails");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — jsbundling-rails is not ported.
  it.skip("esbuild option with j argument", async () => {
    await t.runGenerator([t.destinationRoot, "-j", "esbuild"]);
    await assertGem("jsbundling-rails");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — jsbundling-rails is not ported.
  it.skip("esbuild option with js argument", async () => {
    await t.runGenerator([t.destinationRoot, "--js", "esbuild"]);
    await assertGem("jsbundling-rails");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — jsbundling-rails is not ported.
  it.skip("bun option", async () => {
    const railsCommands = await runGeneratorInstance([t.destinationRoot, "--javascript=bun"]);
    expect(railsCommands).toContain("javascript:install:bun");
    await assertGem("jsbundling-rails");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — jsbundling-rails is not ported.
  it.skip("bun option with javascript argument", async () => {
    await t.runGenerator([t.destinationRoot, "--javascript", "bun"]);
    await assertGem("jsbundling-rails");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — jsbundling-rails is not ported.
  it.skip("bun option with j argument", async () => {
    await t.runGenerator([t.destinationRoot, "-j", "bun"]);
    await assertGem("jsbundling-rails");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — jsbundling-rails is not ported.
  it.skip("bun option with js argument", async () => {
    await t.runGenerator([t.destinationRoot, "--js", "bun"]);
    await assertGem("jsbundling-rails");
  });

  it("skip javascript option with skip javascript argument", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-javascript"]);
    await assertNoGem("@hotwired/stimulus");
    await assertNoGem("@hotwired/turbo-rails");
    await assertNoGem("vite-plugin-ruby");
  });

  it("skip javascript option with J argument", async () => {
    await t.runGenerator([t.destinationRoot, "-J"]);
    await assertNoGem("@hotwired/stimulus");
    await assertNoGem("@hotwired/turbo-rails");
    await assertNoGem("vite-plugin-ruby");
  });

  it("skip javascript option with skip js argument", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-js"]);
    await assertNoGem("@hotwired/stimulus");
    await assertNoGem("@hotwired/turbo-rails");
    await assertNoGem("vite-plugin-ruby");
  });

  it("hotwire", async () => {
    const railsCommands = await runGeneratorInstance([t.destinationRoot]);

    expect(railsCommands).toContain("turbo:install stimulus:install");
    await t.assertFile("app/views/layouts/application.html.tse", (content: string) => {
      expect(content).toMatch(/data-turbo-track/);
    });
  });

  it("skip hotwire", async () => {
    await runGeneratorInstance([t.destinationRoot, "--skip-hotwire"]);

    await assertNoGem("@hotwired/turbo-rails");
    await t.assertFile("app/views/layouts/application.html.tse", (content: string) => {
      assertNoMatch(/data-turbo-track/, content);
    });
    t.assertNoFile("app/javascript/entrypoints/application.js");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" — cssbundling-rails is not ported.
  it.skip("css option with tailwind uses cssbundling gem when using node", async () => {
    await t.runGenerator([t.destinationRoot, "--css=tailwind", "--javascript=esbuild"]);
    await assertGem("cssbundling-rails");
    await assertNoGem("tailwindcss-rails");
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
      "Procfile.dev",
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
      "public/400.html",
      "public/404.html",
      "public/406-unsupported-browser.html",
      "public/422.html",
      "public/500.html",
      "public/icon.png",
      "public/icon.svg",
      "public/robots.txt",
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

    for (const path of ["config/puma.ts", "app/channels"]) t.assertNoFile(path);
  });

  it("keeps storage/ for a sqlite3 app with Active Storage skipped", async () => {
    await t.runGenerator([t.destinationRoot, "--database=sqlite3", "--skip-active-storage"]);

    await t.assertFile("storage/.keep");
  });

  it("skips storage/ for a non-sqlite3 app with Active Storage skipped", async () => {
    await t.runGenerator([t.destinationRoot, "--database=postgresql", "--skip-active-storage"]);

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
      expect(dev).toContain('readFileSync("Procfile.dev", "utf8")');
      expect(dev).toContain("spawn(command");
    });
    await t.assertFile("my-app/Procfile.dev", (procfile: string) => {
      expect(procfile).toBe(
        "web: bin/trails server\nviews: pnpm exec trails-tsc-views dev --views app/views\n",
      );
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
      expect(dbConfig).not.toContain("@blazetrails/sqlite3");
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
      expect(dbConfig).not.toContain("@blazetrails/sqlite3/node-sqlite");
    });
  });

  it("minimal trails app", () => {
    const generator = t.generator([t.destinationRoot], ["--minimal"]);

    assertOption(generator, "minimal");
    assertOption(generator, "skipActionCable");
    assertOption(generator, "skipActionMailbox");
    assertOption(generator, "skipActionMailer");
    assertOption(generator, "skipActionText");
    assertOption(generator, "skipActiveJob");
    assertOption(generator, "skipActiveStorage");
    assertOption(generator, "skipBootsnap");
    assertOption(generator, "skipBrakeman");
    assertOption(generator, "skipCi");
    assertOption(generator, "skipDevGems");
    assertOption(generator, "skipDocker");
    assertOption(generator, "skipHotwire");
    assertOption(generator, "skipJavascript");
    assertOption(generator, "skipJbuilder");
    assertOption(generator, "skipKamal");
    assertOption(generator, "skipEslint");
    assertOption(generator, "skipSolid");
    assertOption(generator, "skipSystemTest");
    assertOption(generator, "skipThruster");
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
      expect(appConfig).toContain(`import { Trails } from "@blazetrails/trailties";`);
      expect(appConfig).toContain("export class Application extends Trails.Application {");
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
  it("skip solid option", async () => {
    const railsCommands = await runGeneratorInstance([t.destinationRoot, "--skip-solid"]);

    expect(
      railsCommands,
      "`solid_cache:install solid_queue:install solid_cable:install` expected to not be called.",
    ).not.toContain("solid_cache:install solid_queue:install solid_cable:install");
    await assertNoGem("@blazetrails/solid-cache");
    await assertNoGem("@blazetrails/solid-queue");
    await assertNoGem("@blazetrails/solid-cable");
  });

  it("after bundle callback", async () => {
    const bundleCommands: string[] = [];
    let bundleCommandsBeforeCallback: string[] = [];
    const proto = AppGenerator.prototype as unknown as { runAfterBundleCallbacks(): Promise<void> };
    const original = proto.runAfterBundleCallbacks;
    const stub = vi
      .spyOn(proto, "runAfterBundleCallbacks")
      .mockImplementation(async function (this: { afterBundle(block: () => void): void }) {
        this.afterBundle(() => {
          bundleCommandsBeforeCallback = [...bundleCommands];
        });
        return original.call(this);
      });
    try {
      await runGeneratorInstance([t.destinationRoot], bundleCommands);
    } finally {
      stub.mockRestore();
    }

    expect(bundleCommandsBeforeCallback).not.toBeEmpty();
    expect(bundleCommandsBeforeCallback).toEqual(bundleCommands);
  });

  it("default generator executes all trails commands", async () => {
    const railsCommands = await runGeneratorInstance([t.destinationRoot]);

    const expectedCommands = [
      "credentials:diff --enroll",
      "vite:install",
      "turbo:install stimulus:install",
      "solid_cache:install solid_queue:install solid_cable:install",
    ];
    expect(railsCommands).toEqual(expectedCommands);
  });

  it("devcontainer include redis skipping solid", async () => {
    await t.runGenerator([t.destinationRoot, "--devcontainer", "--name=my-app", "--skip-solid"]);

    await assertDevcontainerJsonFile.call(t, (content) => {
      expect(content.containerEnv.REDIS_URL).toBe("redis://redis:6379/1");
      expect(content.forwardPorts).toContain(6379);
    });

    await assertComposeFile.call(t, (composeConfig) => {
      expect(composeConfig.get("services").get("trails-app").get("depends_on")).toContain("redis");

      const expectedRedisConfig = {
        image: "redis:7.2",
        restart: "unless-stopped",
        volumes: ["redis-data:/data"],
      };

      expect(JSON.parse(JSON.stringify(composeConfig.get("services").get("redis")))).toEqual(
        expectedRedisConfig,
      );
      expect(composeConfig.get("volumes").keys()).toContain("redis-data");
    });
  });

  it("devcontainer no redis skipping solid action cable and active job", async () => {
    await t.runGenerator([
      t.destinationRoot,
      "--devcontainer",
      "--skip-action-cable",
      "--skip-active-job",
      "--skip-solid",
    ]);

    await assertComposeFile.call(t, (composeConfig) => {
      expect(composeConfig.get("services").get("trails-app").get("depends_on") ?? []).not.toContain(
        "redis",
      );
      expect(composeConfig.get("services").get("redis")).toBeUndefined();
      expect(composeConfig.get("volumes")).toBeUndefined();
    });

    await assertDevcontainerJsonFile.call(t, (content) => {
      expect(content.forwardPorts).not.toContain(6379);
    });
  });

  it("no devcontainer by default", async () => {
    await t.runGenerator([t.destinationRoot]);

    t.assertNoFile(".devcontainer/devcontainer.json");
    t.assertNoFile(".devcontainer/Dockerfile");
    t.assertNoFile(".devcontainer/compose.yaml");
  });
});

describe("AppGeneratorTest", () => {
  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" (cssbundling-rails, jsbundling-rails).
  it.skip("css option with cssbundling gem does not force jsbundling gem", async () => {
    await t.runGenerator([t.destinationRoot, "--css=postcss"]);
    await assertNoGem("jsbundling-rails");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" (bootsnap).
  it.skip("bootsnap", async () => {
    await t.runGenerator([t.destinationRoot, "--no-skip-bootsnap"]);
    await assertGem("bootsnap");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" (bootsnap).
  it.skip("skip bootsnap", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-bootsnap"]);
    await assertNoGem("bootsnap");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" (bootsnap).
  it.skip("bootsnap with dev option", async () => {
    await t.runGenerator([t.destinationRoot, "--dev"]);
    await assertNoGem("bootsnap");
  });

  it("minimal trails app with no skip implied option", () => {
    const generator = t.generator([t.destinationRoot], ["--minimal", "--no-skip-action-text"]);

    assertNotOption(generator, "skipActionText");
    assertNotOption(generator, "skipActiveStorage");
    assertNotOption(generator, "skipActiveJob");
    assertOption(generator, "skipActionMailbox");
    assertOption(generator, "skipActionMailer");
    assertOption(generator, "minimal");
  });

  it("dockerfile", async () => {
    await t.runGenerator();

    await t.assertFile("Dockerfile", (content: string) => {
      expect(content).toMatch(/assets:precompile/);
      expect(content).toMatch(/libvips/);
      expect(content).not.toMatch(/yarn/);
    });
  });

  it("inclusion of ruby version", async () => {
    await t.runGenerator();

    const nodeVersion = /\d+\.\d+\.\d+/.exec(await rbFBackquote("node --version"))![0];
    await t.assertFile("Dockerfile", (content: string) => {
      expect(content).toMatch(new RegExp(`ARG NODE_VERSION=${nodeVersion}`));
    });
    await t.assertFile(".node-version", (content: string) => {
      expect(content).toMatch(nodeVersion);
      expect(content.endsWith("\n"), "expected .node-version to end with newline").toBeTruthy();
    });
  });

  it("default branch main without user default", async () => {
    const currentDefaultBranch = await rbFBackquote("git config --global init.defaultBranch");
    await rbFBackquote("git config --global --unset init.defaultBranch");
    try {
      await t.runGenerator([t.destinationRoot]);
      await t.assertFile(".git/HEAD", /main/);
    } finally {
      if (currentDefaultBranch.trim() !== "") {
        await rbFBackquote(`git config --global init.defaultBranch ${currentDefaultBranch}`);
      }
    }
  });

  it.skipIf(gitVersion.compare(new Gem.Version("2.28.0"))! < 0)(
    "version control initializes git repo with user default branch",
    async () => {
      const currentDefaultBranch = await rbFBackquote("git config --global init.defaultBranch");
      await rbFBackquote("git config --global init.defaultBranch master");
      try {
        await t.runGenerator([t.destinationRoot]);
        await t.assertFile(".git/HEAD", /master/);
      } finally {
        if (currentDefaultBranch.trim() === "") {
          await rbFBackquote("git config --global --unset init.defaultBranch");
        } else {
          await rbFBackquote(`git config --global init.defaultBranch ${currentDefaultBranch}`);
        }
      }
    },
  );

  it("create keeps", async () => {
    await t.runGenerator([t.destinationRoot]);
    const foldersWithKeep = [
      "app/assets/images",
      "app/controllers/concerns",
      "app/models/concerns",
      "lib/tasks",
      "log",
      "script",
      "test/fixtures/files",
      "test/controllers",
      "test/mailers",
      "test/models",
      "test/helpers",
      "test/integration",
      "tmp",
      "tmp/pids",
    ];
    for (const folder of foldersWithKeep) await t.assertFile(`${folder}/.keep`);
  });

  it("principle tasks go before finish template", () => {
    const tasks = Object.keys((AppGenerator as unknown as { tasks(): object }).tasks());

    expect(tasks.indexOf("finish-template")).toBe(tasks.indexOf("apply-trails-template") - 1);
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "A Gemfile is a package.json (`GemfileEntry`, `bundle install`, gemspec)" (`bundle lock --add-platform`).
  it.skip("apply trails template class method does not add bundler platforms", async () => {
    await t.runGenerator();
  });

  it("gitignore", async () => {
    await t.runGenerator();

    await t.assertFile(".gitignore", (content: string) => {
      expect(content).toMatch(/config\/master\.key/);
    });
  });

  it("dockerignore", async () => {
    await t.runGenerator();

    await t.assertFile(".dockerignore", (content: string) => {
      expect(content).toMatch(/config\/master\.key/);
      expect(content).toMatch(/config\/deploy\*\.yml/);
      expect(content).toMatch(/\.kamal/);
    });
  });

  it("dockerignore skip kamal", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-kamal"]);

    await t.assertFile(".dockerignore", (content: string) => {
      expect(content).not.toMatch(/config\/deploy\*\.yml/);
      expect(content).not.toMatch(/\.kamal/);
    });
  });

  it("skip docker", async () => {
    await t.runGenerator([t.destinationRoot, "--skip-docker"]);

    t.assertNoFile(".dockerignore");
    t.assertNoFile("Dockerfile");
    t.assertNoFile("bin/docker-entrypoint");
  });

  it("system tests directory generated", async () => {
    await t.runGenerator();

    await t.assertDirectory("test/system");
    await t.assertFile("test/system/.keep");
  });

  it("master key is only readable by the owner", async () => {
    await t.runGenerator();

    const stat = await File.stat(File.join(t.destinationRoot, "config/master.key"));
    expect((stat.mode & 0o777777).toString(8)).toBe("100600");
  });

  it("minimal trails app with no skip intermediary implied option", () => {
    const generator = t.generator([t.destinationRoot], ["--minimal", "--no-skip-active-storage"]);

    assertNotOption(generator, "skipActiveStorage");
    assertNotOption(generator, "skipActiveJob");
    assertOption(generator, "skipActionText");
    assertOption(generator, "skipActionMailbox");
    assertOption(generator, "skipActionMailer");
    assertOption(generator, "minimal");
  });

  it("devcontainer", async () => {
    await t.runGenerator([t.destinationRoot, "--devcontainer", "--name=my-app"]);

    await assertDevcontainerJsonFile.call(t, (content) => {
      expect(content.name).toBe("my_app");
      expect(content.containerEnv.CAPYBARA_SERVER_PORT).toBe("45678");
      expect(content.containerEnv.KAMAL_REGISTRY_PASSWORD).toBe("$KAMAL_REGISTRY_PASSWORD");
      expect(content.containerEnv.SELENIUM_HOST).toBe("selenium");
      expect(Object.keys(content.features)).toContain(
        "ghcr.io/rails/devcontainer/features/activestorage",
      );
      expect(Object.keys(content.features)).toContain(
        "ghcr.io/devcontainers/features/github-cli:1",
      );
      expect(Object.keys(content.features)).toContain(
        "ghcr.io/rails/devcontainer/features/sqlite3",
      );
      expect(Object.keys(content.features)).toContain(
        "ghcr.io/devcontainers/features/docker-outside-of-docker:1",
      );
      expect(content.forwardPorts).toContain(3000);
    });
    await t.assertFile(".devcontainer/Dockerfile", (content: string) => {
      expect(content).toMatch(/ARG NODE_VERSION=/);
    });
    await assertComposeFile.call(t, (composeConfig) => {
      expect(composeConfig.get("name")).toBe("my_app");

      const expectedTrailsAppConfig = {
        build: {
          context: "..",
          dockerfile: ".devcontainer/Dockerfile",
        },
        volumes: ["../..:/workspaces:cached"],
        command: "sleep infinity",
        depends_on: ["selenium"],
      };

      expect(JSON.parse(JSON.stringify(composeConfig.get("services").get("trails-app")))).toEqual(
        expectedTrailsAppConfig,
      );

      const expectedSeleniumConfig = {
        image: "selenium/standalone-chromium",
        restart: "unless-stopped",
      };

      expect(JSON.parse(JSON.stringify(composeConfig.get("services").get("selenium")))).toEqual(
        expectedSeleniumConfig,
      );
    });
  });

  it("devcontainer skip kamal", async () => {
    await t.runGenerator([t.destinationRoot, "--devcontainer", "--name=my-app", "--skip-kamal"]);

    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(Object.keys(devcontainerJson.features)).not.toContain(
        "ghcr.io/devcontainers/features/docker-outside-of-docker:1",
      );
      expect(Object.keys(devcontainerJson.containerEnv)).not.toContain("KAMAL_REGISTRY_PASSWORD");
    });
  });

  it("devcontainer postgresql", async () => {
    await t.runGenerator([t.destinationRoot, "--devcontainer", "-d", "postgresql"]);

    await assertComposeFile.call(t, (composeConfig) => {
      expect(composeConfig.get("services").get("trails-app").get("depends_on")).toContain(
        "postgres",
      );

      const expectedPostgresConfig = {
        image: "postgres:16.1",
        restart: "unless-stopped",
        networks: ["default"],
        volumes: ["postgres-data:/var/lib/postgresql/data"],
        environment: {
          POSTGRES_USER: "postgres",
          POSTGRES_PASSWORD: "postgres",
        },
      };

      expect(JSON.parse(JSON.stringify(composeConfig.get("services").get("postgres")))).toEqual(
        expectedPostgresConfig,
      );
      expect(composeConfig.get("volumes").keys()).toContain("postgres-data");
    });
    await assertDevcontainerJsonFile.call(t, (content) => {
      expect(content.containerEnv.DB_HOST).toBe("postgres");
      expect(Object.keys(content.features)).toContain(
        "ghcr.io/rails/devcontainer/features/postgres-client",
      );
      expect(content.forwardPorts).toContain(5432);
    });
    await t.assertFile("config/database.ts", (content: string) => {
      expect(content).toMatch(/host: process\.env\.DB_HOST/);
    });
  });

  it("devcontainer postgresql skip solid", async () => {
    await t.runGenerator([t.destinationRoot, "--devcontainer", "-d", "postgresql", "--skip-solid"]);

    await t.assertFile("config/database.ts", (content: string) => {
      assertNoMatch("db/queue_migrate", content);
      assertNoMatch("db/cache_migrate", content);
      assertNoMatch("db/cable_migrate", content);
    });
  });

  it("devcontainer mysql", async () => {
    await t.runGenerator([t.destinationRoot, "--devcontainer", "-d", "mysql"]);

    await assertComposeFile.call(t, (composeConfig) => {
      expect(composeConfig.get("services").get("trails-app").get("depends_on")).toContain("mysql");

      const expectedMysqlConfig = {
        image: "mysql/mysql-server:8.0",
        restart: "unless-stopped",
        environment: {
          MYSQL_ALLOW_EMPTY_PASSWORD: "true",
          MYSQL_ROOT_HOST: "%",
        },
        volumes: ["mysql-data:/var/lib/mysql"],
        networks: ["default"],
      };

      expect(JSON.parse(JSON.stringify(composeConfig.get("services").get("mysql")))).toEqual(
        expectedMysqlConfig,
      );
      expect(composeConfig.get("volumes").keys()).toContain("mysql-data");
    });
    await assertDevcontainerJsonFile.call(t, (content) => {
      expect(content.containerEnv.DB_HOST).toBe("mysql");
      expect(Object.keys(content.features)).toContain(
        "ghcr.io/rails/devcontainer/features/mysql-client",
      );
      expect(content.forwardPorts).toContain(3306);
    });
    await t.assertFile("config/database.ts", (content: string) => {
      expect(content).toMatch(/host: process\.env\.DB_HOST \?\? "127\.0\.0\.1"/);
    });
  });

  // PERMANENT-SKIP: CLAUDE.md, "Trilogy is out of scope (`trilogy_adapter.rb`, `adapters/trilogy/`)".
  it.skip("devcontainer trilogy", async () => {
    await t.runGenerator([t.destinationRoot, "--devcontainer", "-d", "trilogy"]);
  });

  it("devcontainer mariadb mysql", async () => {
    await t.runGenerator([t.destinationRoot, "--devcontainer", "-d", "mariadb-mysql"]);

    await assertComposeFile.call(t, (composeConfig) => {
      expect(composeConfig.get("services").get("trails-app").get("depends_on")).toContain(
        "mariadb",
      );
      const expectedMariadbConfig = {
        image: "mariadb:10.5",
        restart: "unless-stopped",
        networks: ["default"],
        volumes: ["mariadb-data:/var/lib/mysql"],
        environment: {
          MARIADB_ALLOW_EMPTY_ROOT_PASSWORD: "true",
        },
      };

      expect(JSON.parse(JSON.stringify(composeConfig.get("services").get("mariadb")))).toEqual(
        expectedMariadbConfig,
      );
      expect(composeConfig.get("volumes").keys()).toContain("mariadb-data");
    });
    await assertDevcontainerJsonFile.call(t, (content) => {
      expect(content.containerEnv.DB_HOST).toBe("mariadb");
      expect(Object.keys(content.features)).toContain(
        "ghcr.io/rails/devcontainer/features/mysql-client",
      );
      expect(content.forwardPorts).toContain(3306);
    });
    await t.assertFile("config/database.ts", (content: string) => {
      expect(content).toMatch(/host: process\.env\.DB_HOST \?\? "127\.0\.0\.1"/);
    });
  });

  // PERMANENT-SKIP: CLAUDE.md, "Trilogy is out of scope (`trilogy_adapter.rb`, `adapters/trilogy/`)".
  it.skip("devcontainer mariadb trilogy", async () => {
    await t.runGenerator([t.destinationRoot, "--devcontainer", "-d", "mariadb-trilogy"]);
  });

  it("devcontainer no selenium when skipping system test", async () => {
    await t.runGenerator([t.destinationRoot, "--devcontainer", "--skip-system-test"]);

    await assertComposeFile.call(t, (composeConfig) => {
      expect(composeConfig.get("services").get("trails-app").get("depends_on")).toBeUndefined();
      expect(composeConfig.get("services").keys()).not.toContain("selenium");
    });
    await assertDevcontainerJsonFile.call(t, (content) => {
      expect(Object.keys(content.containerEnv)).not.toContain("SELENIUM_HOST");
    });
  });

  it("devcontainer no feature when skipping active storage", async () => {
    await t.runGenerator([t.destinationRoot, "--devcontainer", "--skip-active-storage"]);

    await assertDevcontainerJsonFile.call(t, (content) => {
      expect(content.features["ghcr.io/rails/devcontainer/features/activestorage"]).toBeUndefined();
    });
  });

  it("devcontainer no depends on when no dependencies", async () => {
    await t.runGenerator([t.destinationRoot, "--devcontainer", "--minimal"]);

    await assertComposeFile.call(t, (composeConfig) => {
      expect(composeConfig.get("services").get("trails-app").keys()).not.toContain("depends_on");
    });
  });

  it("devcontainer adds node tooling when required", async () => {
    await t.runGenerator([t.destinationRoot, "--devcontainer", "--javascript=esbuild"]);

    await assertDevcontainerJsonFile.call(t, (devcontainerConfig) => {
      expect(Object.keys(devcontainerConfig.features)).toContain(
        "ghcr.io/devcontainers/features/node:1",
      );
    });
  });

  // PERMANENT-SKIP: CLAUDE.md, "importmap-rails and propshaft are out of scope; JavaScript is served by Vite (`vite_rails`)".
  it.skip("devcontainer does not add node tooling when not required", async () => {
    await t.runGenerator([t.destinationRoot, "--devcontainer"]);

    await assertDevcontainerJsonFile.call(t, (devcontainerConfig) => {
      expect(Object.keys(devcontainerConfig.features)).not.toContain(
        "ghcr.io/devcontainers/features/node:1",
      );
    });
  });

  it("devcontainer dev flag mounts local trails repo", async () => {
    await runGeneratorInstance([t.destinationRoot, "--devcontainer", "--dev"]);

    await assertDevcontainerJsonFile.call(t, (devcontainerConfig) => {
      const [trailsMount] = devcontainerConfig.mounts;

      expect(trailsMount.type).toBe("bind");
      expect(trailsMount.source).toBe(Generators.TRAILS_DEV_PATH);
      expect(trailsMount.target).toBe(Generators.TRAILS_DEV_PATH);
    });
  });
});
