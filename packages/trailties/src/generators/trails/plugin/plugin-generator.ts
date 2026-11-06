import type { ThorClass } from "@blazetrails/thor";
import { File, chomp, constDefined, rbFBackquote } from "@blazetrails/ruby-compat";
import {
  TopLevel,
  camelize,
  humanize,
  indent,
  isBlank,
  isPresent,
  underscore,
} from "@blazetrails/activesupport";
import { AppGenerator } from "../app/app-generator.js";
import { AppBase, type AppBaseOptions } from "../../app-base.js";
import { AppName } from "../../app-name.js";
import { GeneratorError } from "../../generated-attribute.js";
import { Trails } from "../../../trails.js";
import { APP_PATH } from "../../../app-path.js";

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
  insertIntoFile(path: string, content: string, config: object): Promise<unknown>;
  chmod(path: string, mode: number, config: object): Promise<unknown>;
  run(command: string, config: object): Promise<unknown>;
  inside(dir: string, config: { verbose?: unknown }, block: () => Promise<void>): Promise<unknown>;
  invoke(klass: unknown, args: unknown[], opts: object): Promise<unknown>;
  gitInitCommand(): Promise<string>;
  shebang(): string;
  author(): Promise<string>;
  email(): Promise<string>;
  namespacedName(): string;
  dummyPath(): string;
  name(): string;
  trailsAppPath(): string | null;
  relativePath(): string | null;
  isApi(): boolean | undefined;
  isEngine(): boolean | undefined;
  isFull(): boolean | undefined;
  isMountable(): boolean | undefined;
  isInsideApplication(): boolean | null;
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
    /** @inventedArm author — PERMANENT */
    await this.author();
    await this.email();
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
      await this.run(await this.gitInitCommand(), {
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
    opts.skipInstall = true;
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

  /** @missingRailsArgs indent — PERMANENT */
  async testDummyConfig(this: PluginBuilderHost): Promise<void> {
    await this.template("trails/boot.ts", File.join(this.dummyPath(), "config/boot.ts"), {
      force: true,
    });

    if (this.isMountable()) {
      await this.template("trails/routes.ts", File.join(this.dummyPath(), "config/routes.ts"), {
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
      "trails/stylesheets.css",
      `${this.dummyPath()}/app/assets/stylesheets/application.css`,
      { force: true },
    );
  }

  /** @missingRailsArgs remove_file — PERMANENT */
  async testDummyClean(this: PluginBuilderHost): Promise<void> {
    await this.inside(this.dummyPath(), {}, async () => {
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
        "trails/stylesheets.css",
        `app/assets/stylesheets/${this.namespacedName()}/application.css`,
      );
    } else if (this.isFull()) {
      await this.emptyDirectoryWithKeepFile(`app/assets/stylesheets/${this.namespacedName()}`);
    }
  }

  async bin(this: PluginBuilderHost): Promise<void> {
    const excludePattern = new RegExp(
      [this.isEngine() ? "test\\.tt" : "trails\\.tt", this.skipEslint() ? "eslint" : null]
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

    const gemfileInAppPath = File.join(this.trailsAppPath()!, "package.json");
    if (await File.isExistAsync(gemfileInAppPath)) {
      const json = JSON.parse(await File.readAsync(gemfileInAppPath));
      json.dependencies = { ...json.dependencies, [this.name()]: `file:${this.relativePath()}` };
      const entry = JSON.stringify(json, null, 2) + "\n";
      await this.createFile(gemfileInAppPath, entry, { force: true });
    }
  }
}

export class PluginGenerator extends AppBase {
  static {
    void this.sourceRoot(File.expandPath("templates", import.meta.dirname));
    this.addSharedOptionsFor("plugin");
    this.classOption("dummyPath", {
      type: "string",
      default: "test/dummy",
      desc: "Create dummy application at given path",
    });
    this.classOption("full", {
      type: "boolean",
      default: false,
      desc: "Generate a trails engine with bundled Trails application for testing",
    });
    this.classOption("mountable", {
      type: "boolean",
      default: false,
      desc: "Generate mountable isolated engine",
    });
    this.classOption("skipGemspec", { type: "boolean", default: false, desc: "Skip gemspec file" });
    this.classOption("skipGemfileEntry", {
      type: "boolean",
      default: false,
      desc: "If creating plugin in application's directory skip adding entry to Gemfile",
    });
    this.classOption("api", {
      type: "boolean",
      default: false,
      desc: "Generate a smaller stack for API application plugins",
    });
    this.publicCommand("reportImpliedOptions");
    this.publicCommand("setDefaultAccessorsBang");
    this.publicCommand("createRoot");
    this.methodAdded("createRootFiles");
    this.methodAdded("createAppFiles");
    this.methodAdded("createEslintFile");
    this.methodAdded("createCifiles");
    this.methodAdded("createConfigFiles");
    this.methodAdded("createLibFiles");
    this.methodAdded("createAssetsManifestFile");
    this.methodAdded("createPublicStylesheetsFiles");
    this.methodAdded("createBinFiles");
    this.methodAdded("createTestFiles");
    this.methodAdded("createTestDummyFiles");
    this.methodAdded("updateGemfile");
    this.methodAdded("finishTemplate");
    this.publicCommand("applyTrailsTemplate");
    this.noCommands(() => this.methodAdded("name"));
    this.noCommands(() => this.methodAdded("underscoredName"));
    this.noCommands(() => this.methodAdded("namespacedName"));
    this.noCommands(() => this.methodAdded("pluginPath"));
  }

  private _dummyPath: string | null;
  private _name?: string;
  private _underscoredName?: string;
  private _namespacedName?: string;
  private _originalName?: string;
  private _modules?: string[];
  private _camelizedModules?: string;
  private _humanized?: string;
  private _camelized?: string;
  /** @internal */
  protected _author?: string;
  /** @internal */
  protected _email?: string;

  declare options: AppBaseOptions & {
    dummyPath: string;
    full?: boolean;
    mountable?: boolean;
    engine?: boolean;
    skipGemspec?: boolean;
    skipGemfileEntry?: boolean;
  };

  pluginPath(): string {
    return this.appPath;
  }

  constructor(...args: ConstructorParameters<typeof AppBase>) {
    super(...args);
    this._dummyPath = null;
    this.implyOptions();

    if (!this.isEngine() || !this.isWithDummyApp()) {
      this.options = Object.freeze({ ...this.options, skipAssetPipeline: true });
    }
  }

  async createRootFiles(): Promise<void> {
    await this.build("readme");
    await this.build("rakefile");
    if (!this.options.skipGemspec) await this.build("gemspec");
    await this.build("license");
    if (!this.options.skipGit) await this.build("gitignore");
    await this.build("gemfile");
    await this.build("versionControl");
  }

  async createAppFiles(): Promise<void> {
    await this.build("app");
  }

  async createEslintFile(): Promise<void> {
    if (this.skipEslint()) return;
    await this.build("eslint");
  }

  async createCifiles(): Promise<void> {
    if (this.skipCi()) return;
    await this.build("cifiles");
  }

  async createConfigFiles(): Promise<void> {
    await this.build("config");
  }

  async createLibFiles(): Promise<void> {
    await this.build("lib");
  }

  async createAssetsManifestFile(): Promise<void> {
    if (!this.isApi() && this.isEngine()) await this.build("assetsManifest");
  }

  async createPublicStylesheetsFiles(): Promise<void> {
    if (!this.isApi()) await this.build("stylesheets");
  }

  async createBinFiles(): Promise<void> {
    await this.build("bin");
  }

  async createTestFiles(): Promise<void> {
    if (!this.options.skipTest) await this.build("test");
  }

  async createTestDummyFiles(): Promise<void> {
    if (!this.isWithDummyApp()) return;
    await this.createDummyApp();
  }

  async updateGemfile(): Promise<void> {
    if (!this.options.skipGemfileEntry) await this.build("gemfileEntry");
  }

  async finishTemplate(): Promise<void> {
    await this.build("leftovers");
  }

  name(): string {
    if (this._name === undefined) {
      let underscored = this.originalName();
      underscored = underscored.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2");
      underscored = underscored.replace(/([a-z\d])([A-Z])/g, "$1_$2");
      underscored = underscored.toLowerCase();

      this._name = underscored;
    }
    return this._name;
  }

  underscoredName(): string {
    return (this._underscoredName ??= underscore(this.originalName()));
  }

  namespacedName(): string {
    return (this._namespacedName ??= this.name().replaceAll("-", "/"));
  }

  /** @internal */
  protected async createDummyApp(path: string | null = null): Promise<void> {
    if (path != null) this.dummyPath(path);

    this.sayStatus("vendor_app", this.dummyPath());
    await this.mute(async () => {
      await this.build("generateTestDummy");
      await this.build("testDummyConfig");
      if (!this.skipAssetPipeline()) await this.build("testDummyAssets");
      await this.build("testDummyClean");
      await this.build("bin");
    });
  }

  /** @internal */
  protected isEngine(): boolean | undefined {
    return this.isFull() || this.isMountable() || this.options.engine;
  }

  /** @internal */
  protected isFull(): boolean | undefined {
    return this.options.full;
  }

  /** @internal */
  protected isMountable(): boolean | undefined {
    return this.options.mountable;
  }

  /** @internal */
  protected isSkipGit(): boolean | undefined {
    return this.options.skipGit;
  }

  /** @internal */
  protected isWithDummyApp(): boolean {
    return isBlank(this.options.skipTest) || this.options.dummyPath !== "test/dummy";
  }

  /** @internal */
  protected isApi(): boolean | undefined {
    return this.options.api;
  }

  /** @internal */
  static banner(): string {
    return `trails plugin new ${(this as unknown as ThorClass)
      .arguments()
      .map((a) => a.usage())
      .join(" ")} [options]`;
  }

  /** @internal */
  protected originalName(): string {
    return (this._originalName ??= File.basename(this.destinationRoot));
  }

  /** @internal */
  protected modules(): string[] {
    return (this._modules ??= camelize(this.namespacedName()).split("::"));
  }

  /**
   * @internal
   * @missingRailsArgs join — PERMANENT
   */
  protected wrapInModules(unwrappedCode: string): string {
    unwrappedCode = `${unwrappedCode}`.trim().replace(/\s$\n/gm, "");
    return [...this.modules()].reverse().reduce((content, mod) => {
      let str = `export namespace ${mod} {\n`;
      str += content
        .split(/(?<=\n)/)
        .filter((line) => line !== "")
        .map((line) => `  ${line}`)
        .join("");
      str += isPresent(content) ? "\n}" : "}";
      return str;
    }, unwrappedCode);
  }

  /** @internal */
  protected camelizedModules(): string {
    return (this._camelizedModules ??= camelize(this.namespacedName()));
  }

  /** @internal */
  protected humanized(): string {
    return (this._humanized ??= humanize(underscore(this.originalName())));
  }

  /** @internal */
  override camelized = function (this: PluginGenerator): string {
    return (this._camelized ??= camelize(this.name().replace(/\W/g, "_").replace(/_+/g, "_")));
  };

  /** @internal */
  protected async author(): Promise<string> {
    const fallback = "TODO: Write your name";
    if (this.isSkipGit()) {
      this._author = fallback;
    } else {
      try {
        this._author = chomp(await rbFBackquote("git config user.name"));
      } catch {
        this._author = fallback;
      }
    }
    return this._author;
  }

  /** @internal */
  protected async email(): Promise<string> {
    const fallback = "TODO: Write your email address";
    if (this.isSkipGit()) {
      this._email = fallback;
    } else {
      try {
        this._email = chomp(await rbFBackquote("git config user.email"));
      } catch {
        this._email = fallback;
      }
    }
    return this._email;
  }

  /** @internal */
  protected trailsVersionSpecifier(gemVersion = Trails.gemVersion()): string[] {
    return [`>= ${gemVersion}`];
  }

  /** @internal */
  override isValidConst = function (this: PluginGenerator): void {
    if (/-\d/.test(this.originalName())) {
      throw new GeneratorError(
        `Invalid plugin name ${this.originalName()}. Please give a name which does not contain a namespace starting with numeric characters.`,
      );
    } else if (/[^\w-]+/.test(this.originalName())) {
      throw new GeneratorError(
        `Invalid plugin name ${this.originalName()}. Please give a name which uses only alphabetic, numeric, "_" or "-" characters.`,
      );
    } else if (/^\d/.test(this.camelized())) {
      throw new GeneratorError(
        `Invalid plugin name ${this.originalName()}. Please give a name which does not start with numbers.`,
      );
    } else if (AppName.RESERVED_NAMES.includes(this.name())) {
      throw new GeneratorError(
        `Invalid plugin name ${this.originalName()}. Please give a ` +
          `name which does not match one of the reserved trails ` +
          `words: ${AppName.RESERVED_NAMES.join(", ")}`,
      );
    } else if (constDefined(TopLevel, this.camelized())) {
      throw new GeneratorError(
        `Invalid plugin name ${this.originalName()}, constant ${this.camelized()} is already in use. Please choose another plugin name.`,
      );
    }
  };

  /** @internal */
  protected getBuilderClass(): new (generator: never) => object {
    return TopLevel.PluginBuilder !== undefined
      ? TopLevel.PluginBuilder
      : (PluginBuilder as unknown as new (generator: never) => object);
  }

  /** @internal */
  protected dummyPath(path: string | null = null): string {
    if (path != null) this._dummyPath = path;
    return this._dummyPath ?? this.options.dummyPath;
  }

  /** @internal */
  protected mute<T>(block: () => T): T {
    return this.shell.mute(block);
  }

  /** @internal */
  protected trailsAppPath(): string | null {
    return APP_PATH != null ? APP_PATH.replace("/config/application", "") : null;
  }

  /** @internal */
  protected isInsideApplication(): boolean | null {
    const trailsAppPath = this.trailsAppPath();
    return trailsAppPath == null ? trailsAppPath : this.destinationRoot.startsWith(trailsAppPath);
  }

  /** @internal */
  protected relativePath(): string | null {
    if (!this.isInsideApplication()) return null;
    const prefix = `${this.trailsAppPath()}/`;
    return this.appPath.startsWith(prefix) ? this.appPath.slice(prefix.length) : this.appPath;
  }

  /** @internal */
  protected testCommand(): string {
    if (this.isEngine() && !this.options.skipActiveRecord && this.isWithDummyApp()) {
      return "bin/trails db:test:prepare test";
    } else if (this.isEngine()) {
      return "bin/trails test";
    } else {
      return "bin/test";
    }
  }
}
