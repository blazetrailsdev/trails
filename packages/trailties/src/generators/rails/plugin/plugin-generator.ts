import { File } from "@blazetrails/ruby-compat";
import { indent } from "@blazetrails/activesupport";
import { AppGenerator } from "../app/app-generator.js";

interface PluginBuilderHost {
  options: Record<string, unknown>;
  destinationRoot: string;
  template(source: string, ...args: unknown[]): Promise<unknown>;
  directory(source: string, ...args: unknown[]): Promise<unknown>;
  copyFile(source: string, ...args: unknown[]): Promise<unknown>;
  emptyDirectory(destination: string): Promise<unknown>;
  emptyDirectoryWithKeepFile(destination: string): Promise<unknown>;
  removeDir(path: string): Promise<unknown>;
  removeFile(path: string): Promise<unknown>;
  createFile(path: string, content: string, config: object): Promise<unknown>;
  prependToFile(path: string, content: string): Promise<unknown>;
  insertIntoFile(path: string, content: string, config: object): Promise<unknown>;
  chmod(path: string, mode: number, config: object): Promise<unknown>;
  run(command: string, config: object): Promise<unknown>;
  inside(path: string, block: () => Promise<void>): Promise<unknown>;
  invoke(klass: unknown, args: unknown[], opts: object): Promise<unknown>;
  gitInitCommand(): string;
  shebang(): string;
  namespacedName(): string;
  dummyPath(): string;
  name(): string;
  railsAppPath(): string | null;
  relativePath(): string | null;
  isApi(): boolean;
  isEngine(): boolean;
  isFull(): boolean;
  isMountable(): boolean;
  isInsideApplication(): boolean;
  skipEslint(): boolean | undefined;
}

export class PluginBuilder {
  /** @missingRailsArgs template — PERMANENT */
  async rakefile(this: PluginBuilderHost): Promise<void> {
    await this.template("Rakefile.ts");
  }

  async app(this: PluginBuilderHost): Promise<void> {
    if (this.isMountable()) {
      if (this.isApi()) {
        await this.directory("app", { excludePattern: /app\/(views|helpers)/ });
      } else {
        await this.directory("app");
        await this.emptyDirectoryWithKeepFile(`app/assets/images/${this.namespacedName()}`);
      }

      await this.emptyDirectoryWithKeepFile("app/models/concerns");
      await this.emptyDirectoryWithKeepFile("app/controllers/concerns");
      if (this.options.skipActionMailer) await this.removeDir("app/mailers");
      if (this.options.skipActiveJob) await this.removeDir("app/jobs");
    } else if (this.isFull()) {
      await this.emptyDirectoryWithKeepFile("app/models");
      await this.emptyDirectoryWithKeepFile("app/controllers");
      await this.emptyDirectoryWithKeepFile("app/models/concerns");
      await this.emptyDirectoryWithKeepFile("app/controllers/concerns");
      if (!this.options.skipActionMailer) await this.emptyDirectoryWithKeepFile("app/mailers");
      if (!this.options.skipActiveJob) await this.emptyDirectoryWithKeepFile("app/jobs");

      if (!this.isApi()) {
        await this.emptyDirectoryWithKeepFile(`app/assets/images/${this.namespacedName()}`);
        await this.emptyDirectoryWithKeepFile("app/helpers");
        await this.emptyDirectoryWithKeepFile("app/views");
      }
    }
  }

  async readme(this: PluginBuilderHost): Promise<void> {
    await this.template("README.md");
  }

  /** @missingRailsArgs template — CONVERGEABLE converge-generators-actions-gemfile-family-onto-package-json */
  async gemfile(this: PluginBuilderHost): Promise<void> {
    await this.template("pnpm-workspace.yaml");
  }

  async license(this: PluginBuilderHost): Promise<void> {
    if (!this.isInsideApplication()) await this.template("MIT-LICENSE");
  }

  /** @missingRailsArgs template — CONVERGEABLE converge-generators-actions-gemfile-family-onto-package-json */
  async gemspec(this: PluginBuilderHost): Promise<void> {
    await this.template("package.json");
  }

  async gitignore(this: PluginBuilderHost): Promise<void> {
    await this.template("gitignore", ".gitignore");
  }

  async cifiles(this: PluginBuilderHost): Promise<void> {
    await this.emptyDirectory(".github/workflows");
    await this.template("github/ci.yml", ".github/workflows/ci.yml");
    await this.template("github/dependabot.yml", ".github/dependabot.yml");
  }

  /** @missingRailsArgs template — PERMANENT */
  async eslint(this: PluginBuilderHost): Promise<void> {
    await this.template("eslint.config.js");
  }

  async versionControl(this: PluginBuilderHost): Promise<void> {
    if (!this.options.skipGit && !this.options.pretend) {
      await this.run(this.gitInitCommand(), {
        capture: this.options.quiet,
        abortOnFailure: false,
      });
    }
  }

  /** @missingRailsArgs template — PERMANENT */
  async lib(this: PluginBuilderHost): Promise<void> {
    await this.template("lib/%namespaced_name%.ts");
    await this.template("lib/tasks/%namespaced_name%_tasks.ts");
    await this.template("lib/%namespaced_name%/version.ts");

    if (this.isEngine()) {
      await this.template("lib/%namespaced_name%/engine.ts");
    } else {
      await this.template("lib/%namespaced_name%/railtie.ts");
    }
  }

  /** @missingRailsArgs template — PERMANENT */
  async config(this: PluginBuilderHost): Promise<void> {
    if (this.isEngine()) await this.template("config/routes.ts");
  }

  /** @missingRailsArgs template — PERMANENT */
  async test(this: PluginBuilderHost): Promise<void> {
    await this.template("test/test_helper.ts");
    await this.template("test/%namespaced_name%.test.ts");

    if (this.isEngine()) {
      await this.emptyDirectoryWithKeepFile("test/fixtures/files");
      await this.emptyDirectoryWithKeepFile("test/controllers");
      await this.emptyDirectoryWithKeepFile("test/mailers");
      await this.emptyDirectoryWithKeepFile("test/models");
      await this.emptyDirectoryWithKeepFile("test/integration");

      if (!this.isApi()) {
        await this.emptyDirectoryWithKeepFile("test/helpers");
      }

      await this.template("test/integration/navigation.test.ts");
    }
  }

  static DUMMY_IGNORE_OPTIONS = ["dev", "edge", "master", "template"];

  async generateTestDummy(this: PluginBuilderHost, force = false): Promise<void> {
    const opts: Record<string, unknown> = { ...this.options };
    for (const key of PluginBuilder.DUMMY_IGNORE_OPTIONS) delete opts[key];
    opts.force = force;
    opts.skipThruster = true;
    opts.skipBrakeman = true;
    opts.skipBundle = true;
    opts.skipCi = true;
    opts.skipKamal = true;
    opts.skipSolid = true;
    opts.skipGit = true;
    opts.skipHotwire = true;
    opts.skipEslint = true;
    opts.dummyApp = true;

    await this.invoke(
      AppGenerator,
      [File.expandPath(this.dummyPath(), this.destinationRoot)],
      opts,
    );
  }

  /**
   * @missingRailsArgs indent — PERMANENT
   * @inventedArm prependToFile — CONVERGEABLE app-generator-writes-config-boot
   */
  async testDummyConfig(this: PluginBuilderHost): Promise<void> {
    await this.template("rails/boot.ts", File.join(this.dummyPath(), "config/boot.ts"), {
      force: true,
    });

    await this.prependToFile(
      File.join(this.dummyPath(), "config/application.ts"),
      'import "./boot.js";\n',
    );

    if (this.isMountable()) {
      await this.template("rails/routes.ts", File.join(this.dummyPath(), "config/routes.ts"), {
        force: true,
      });
    }
    if (this.isEngine() && !this.isApi()) {
      await this.insertIntoFile(
        File.join(this.dummyPath(), "config/application.ts"),
        indent(
          `
// For compatibility with applications that use this config
this.config.actionController.includeAllHelpers = false;
`,
          4,
        ),
        { after: /^\s*this\.config\.loadDefaults.*\n/m },
      );
    }
  }

  async testDummyAssets(this: PluginBuilderHost): Promise<void> {
    await this.template(
      "rails/stylesheets.css",
      `${this.dummyPath()}/app/assets/stylesheets/application.css`,
      { force: true },
    );
  }

  /** @missingRailsArgs remove_file — PERMANENT */
  async testDummyClean(this: PluginBuilderHost): Promise<void> {
    await this.inside(this.dummyPath(), async () => {
      await this.removeFile(".node-version");
      await this.removeDir("db");
      await this.removeFile("package.json");
      await this.removeDir("lib");
      await this.removeFile("public/robots.txt");
      await this.removeFile("README.md");
      await this.removeFile("test");
      await this.removeFile("vendor");
    });
  }

  async stylesheets(this: PluginBuilderHost): Promise<void> {
    if (this.isMountable()) {
      await this.copyFile(
        "rails/stylesheets.css",
        `app/assets/stylesheets/${this.namespacedName()}/application.css`,
      );
    } else if (this.isFull()) {
      await this.emptyDirectoryWithKeepFile(`app/assets/stylesheets/${this.namespacedName()}`);
    }
  }

  async bin(this: PluginBuilderHost): Promise<void> {
    const excludePattern = new RegExp(
      [this.isEngine() ? "test\\.tt" : "rails\\.tt", this.skipEslint() ? "eslint" : null]
        .filter((x) => x != null)
        .join("|"),
    );
    await this.directory("bin", { excludePattern }, (content: string) => {
      return `${this.shebang()}\n` + content;
    });
    await this.chmod("bin", 0o755, { verbose: false });
  }

  /** @missingRailsArgs join — CONVERGEABLE converge-generators-actions-gemfile-family-onto-package-json */
  async gemfileEntry(this: PluginBuilderHost): Promise<void> {
    if (!this.isInsideApplication()) return;

    const gemfileInAppPath = File.join(this.railsAppPath()!, "package.json");
    if (await File.isExistAsync(gemfileInAppPath)) {
      const json = JSON.parse(await File.readAsync(gemfileInAppPath));
      json.dependencies = { ...json.dependencies, [this.name()]: `file:${this.relativePath()}` };
      const entry = JSON.stringify(json, null, 2) + "\n";
      await this.createFile(gemfileInAppPath, entry, { force: true });
    }
  }
}
