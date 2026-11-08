import "../../../constants.trails-app-app-generator.generated.js";
import type { ThorClass } from "@blazetrails/thor";
import {
  File,
  STDOUT,
  env,
  exit,
  included,
  rbArgv,
  rbRegSUnion,
  stringSplit,
} from "@blazetrails/ruby-compat";
import { presence } from "@blazetrails/activesupport";
import { TopLevel } from "@blazetrails/activesupport";
import { AppBase, CSS_OPTIONS, JAVASCRIPT_OPTIONS, type AppBaseOptions } from "../../app-base.js";
import type { GeneratorConfig } from "../../base.js";
import { Trails } from "../../../trails.js";
import { Error as GeneratorError } from "../../base.js";
import { type DatabaseName } from "../../database.js";
import { LOAD_DEFAULTS_VERSION } from "../../../application/configuration.js";
import { VERSION } from "../../../gem-version.js";
import { CredentialsGenerator } from "../credentials/credentials-generator.js";
import { MasterKeyGenerator } from "../master-key/master-key-generator.js";

const UNPORTED_SUBSYSTEM_SKIP_DEFAULTS: Readonly<Record<string, boolean>> = {
  skipActionMailer: true,
  skipActiveStorage: true,
};

const META_OPTIONS = ["minimal"];

const DB_ALIAS: Record<string, DatabaseName> = {
  sqlite: "sqlite3",
  postgres: "postgresql",
};

export type AppDatabase = "sqlite" | "postgres" | "mysql" | DatabaseName;
export type PackageManager = "pnpm" | "npm";
export type SqliteDriver = "better-sqlite3" | "node-sqlite" | "expo-sqlite";

export const VALID_PACKAGE_MANAGERS: readonly PackageManager[] = ["pnpm", "npm"];
export const VALID_SQLITE_DRIVERS: readonly SqliteDriver[] = [
  "better-sqlite3",
  "node-sqlite",
  "expo-sqlite",
];

export interface AppGeneratorOptions extends Omit<AppBaseOptions, "database" | "appPath"> {
  dummyApp?: boolean;
  appPath?: string;
  database?: AppDatabase;
  packageManager?: PackageManager;
  sqliteDriver?: SqliteDriver;
}

const TRAILS = "trails";

export class ActionMethods {
  declare readonly options: AppBaseOptions;
  /** @internal */
  declare protected generator: AppGenerator;

  constructor(generator: AppGenerator) {
    this.generator = generator;
    this.options = generator.options;
  }

  /** @internal */
  protected async template(source: string, ...args: unknown[]): Promise<void> {
    await this.generator.template(source, ...args);
  }

  /** @internal */
  protected copyFile(...args: unknown[]): unknown {
    return (this.generator as unknown as Record<string, (...args: unknown[]) => unknown>)[
      "copyFile"
    ](...args);
  }

  /** @internal */
  protected directory(...args: unknown[]): unknown {
    return (this.generator as unknown as Record<string, (...args: unknown[]) => unknown>)[
      "directory"
    ](...args);
  }

  /** @internal */
  protected emptyDirectory(destination: string, config: { verbose?: boolean } = {}): unknown {
    return this.generator["emptyDirectory"](destination, config);
  }

  /** @internal */
  protected inside(...args: unknown[]): unknown {
    return (this.generator as unknown as Record<string, (...args: unknown[]) => unknown>)["inside"](
      ...args,
    );
  }

  /** @internal */
  protected emptyDirectoryWithKeepFile(
    destination: string,
    config: { verbose?: boolean } = {},
  ): Promise<unknown> {
    return this.generator["emptyDirectoryWithKeepFile"](destination, config);
  }

  /** @internal */
  protected keepFile(destination: string): Promise<unknown> {
    return this.generator["keepFile"](destination);
  }

  /** @internal */
  protected createFile(...args: Parameters<AppGenerator["createFile"]>): unknown {
    return this.generator.createFile(...args);
  }

  /** @internal */
  protected chmod(...args: unknown[]): unknown {
    return (this.generator as unknown as Record<string, (...args: unknown[]) => unknown>)["chmod"](
      ...args,
    );
  }

  /** @internal */
  protected shebang(...args: unknown[]): unknown {
    return (this.generator as unknown as Record<string, (...args: unknown[]) => unknown>)[
      "shebang"
    ](...args);
  }

  methodMissing(key: string | symbol): unknown {
    const value = (this.generator as unknown as Record<string | symbol, unknown>)[key];
    return typeof value === "function" ? value.bind(this.generator) : value;
  }
}

const spliced = new WeakSet<object>();

const METHOD_MISSING_HANDLER: ProxyHandler<object> = {
  get: (target, key, receiver: ActionMethods) =>
    key in target || !Object.hasOwn(receiver, "generator")
      ? Reflect.get(target, key, receiver)
      : receiver.methodMissing(key),
};

Object.setPrototypeOf(
  ActionMethods.prototype,
  new Proxy(
    Object.create(Object.getPrototypeOf(ActionMethods.prototype) as object) as object,
    METHOD_MISSING_HANDLER,
  ),
);

(ActionMethods as unknown as Record<symbol, unknown>)[included] = (base: object): void => {
  if (typeof base !== "function") return;
  if (base.prototype instanceof ActionMethods || spliced.has(base.prototype)) return;
  spliced.add(base.prototype);
  Object.setPrototypeOf(
    base.prototype,
    new Proxy(
      Object.create(Object.getPrototypeOf(base.prototype) as object) as object,
      METHOD_MISSING_HANDLER,
    ),
  );
};

Trails.ActionMethods = ActionMethods;

export class AppBuilder extends ActionMethods {
  declare readonly options: AppBaseOptions & AppGeneratorOptions;
  /** @internal */
  declare private readonly database: AppGenerator["database"];
  /** @internal */
  declare private readonly packageManager: PackageManager;
  /** @internal */
  declare private readonly skipActiveStorage: () => boolean | undefined;
  /** @internal */
  declare private readonly skipEslint: () => boolean | undefined;
  /** @internal */
  declare private readonly skipThruster: () => boolean | undefined;
  /** @internal */
  declare private readonly skipBrakeman: () => boolean | undefined;
  /** @internal */
  declare private readonly trailsCommand: OmitThisParameter<AppGenerator["trailsCommand"]>;
  /** @internal */
  declare private readonly gitInitCommand: () => Promise<string>;
  /** @internal */
  declare private readonly run: (command: unknown, config?: object) => Promise<unknown>;
  /** @internal */
  declare private readonly destinationRoot: string;
  /** @internal */
  declare private readonly removeFile: (path: string) => Promise<unknown>;
  /** @internal */
  declare private readonly skipAssetPipeline: () => boolean | undefined;
  /** @internal */
  private _configTargetVersion: string | null = null;

  async readme(): Promise<void> {
    await this.copyFile("README.md", "README.md");
  }

  async nodeVersion(): Promise<void> {
    await this.template("node-version", ".node-version");
  }

  /**
   * @inventedArm if — PERMANENT
   * @missingRailsArgs template — PERMANENT
   */
  async gemfile(): Promise<void> {
    await this.template("package.json");
    if (this.options.dev && this.packageManager === "pnpm")
      await this.template("pnpm-workspace.yaml");
    await this.template("tsconfig.json");
  }

  /** @missingRailsArgs template — PERMANENT */
  async rakefile(): Promise<void> {
    await this.template("Rakefile.ts");
  }

  /** @missingRailsArgs template — PERMANENT */
  async configru(): Promise<void> {
    await this.template("config.ts");
    await this.template("vite.config.ts");
  }

  async gitignore(): Promise<void> {
    await this.template("gitignore", ".gitignore");
  }

  async gitattributes(): Promise<void> {
    await this.template("gitattributes", ".gitattributes");
  }

  async dockerfiles(): Promise<void> {
    await this.template("Dockerfile");
    await this.template("dockerignore", ".dockerignore");

    await this.template("docker-entrypoint", "bin/docker-entrypoint");
    await this.chmod("bin/docker-entrypoint", 0o755 & ~File.umask(), { verbose: false });
  }

  async cifiles(): Promise<void> {
    await this.emptyDirectory(".github/workflows");
    await this.template("github/ci.yml", ".github/workflows/ci.yml");
    await this.template("github/dependabot.yml", ".github/dependabot.yml");
  }

  /** @missingRailsArgs template — PERMANENT */
  async eslint(): Promise<void> {
    await this.template("eslint.config.mjs");
  }

  async versionControl(): Promise<void> {
    if (!this.options.skipGit && !this.options.pretend) {
      await this.run(await this.gitInitCommand(), {
        capture: this.options.quiet,
        abortOnFailure: false,
      });
    }
  }

  async app(): Promise<void> {
    await this.directory("app");

    await this.emptyDirectoryWithKeepFile("app/assets/images");

    await this.keepFile("app/controllers/concerns");
    await this.keepFile("app/models/concerns");
  }

  async bin(): Promise<void> {
    const excludePattern = rbRegSUnion(
      [
        this.skipThruster() ? /thrust/ : null,
        this.skipEslint() ? /eslint/ : null,
        this.skipBrakeman() ? /brakeman/ : null,
      ].filter((p) => p != null),
    );
    await this.directory(
      "bin",
      { excludePattern: excludePattern },
      (content: string) => `${this.shebang()}\n` + content,
    );
    await this.chmod("bin", 0o755 & ~File.umask(), { verbose: false });
  }
  async binWhenUpdating(): Promise<void> {
    await this.bin();
  }

  /** @missingRailsArgs template — PERMANENT */
  async config(): Promise<void> {
    await this.emptyDirectory("config");

    await this.inside("config", {}, async () => {
      if (!this.options.update) await this.template("routes.ts");
      await this.template("application.ts");
      await this.template("environment.ts");
      if (!(this.options.update || this.options.skipActionCable)) await this.template("cable.ts");
      if (!(this.options.update || this.skipActiveStorage())) await this.template("storage.ts");

      await this.directory("environments");
      await this.directory("initializers");
      if (!this.options.update) await this.directory("locales");
    });
  }

  /**
   * @missingRailsArgs template — PERMANENT
   * @missingRailsArgs remove_file — PERMANENT
   */
  async configWhenUpdating(): Promise<void> {
    const root = this.destinationRoot;
    const actionCableConfigExist = await File.isExistAsync(File.join(root, "config/cable.ts"));
    const activeStorageConfigExist = await File.isExistAsync(File.join(root, "config/storage.ts"));
    const rackCorsConfigExist = await File.isExistAsync(
      File.join(root, "config/initializers/cors.ts"),
    );
    const assetsConfigExist = await File.isExistAsync(
      File.join(root, "config/initializers/assets.ts"),
    );
    const assetAppStylesheetExist = await File.isExistAsync(
      File.join(root, "app/assets/stylesheets/application.css"),
    );
    const cspConfigExist = await File.isExistAsync(
      File.join(root, "config/initializers/content-security-policy.ts"),
    );

    this._configTargetVersion = String(Trails.application!.config.loadedConfigVersion ?? "5.0");

    await this.config();

    if (!this.options.skipActionCable && !actionCableConfigExist) {
      await this.template("config/cable.ts");
    }

    if (!this.skipActiveStorage() && !activeStorageConfigExist) {
      await this.template("config/storage.ts");
    }

    if (this.skipAssetPipeline() && !assetsConfigExist) {
      await this.removeFile("config/initializers/assets.ts");
    }

    if (this.skipAssetPipeline() && !assetAppStylesheetExist) {
      await this.removeFile("app/assets/stylesheets/application.css");
    }

    if (!rackCorsConfigExist) {
      await this.removeFile("config/initializers/cors.ts");
    }

    if (this.options.api) {
      if (!cspConfigExist) {
        await this.removeFile("config/initializers/content-security-policy.ts");
      }
    }
  }

  async masterKey(): Promise<void> {
    if (this.options.pretend || this.options.dummyApp) return;

    const masterKeyGenerator = new MasterKeyGenerator([], {
      quiet: this.options.quiet,
      force: this.options.force,
    });
    await masterKeyGenerator.addMasterKeyFileSilently();
    await masterKeyGenerator.ignoreMasterKeyFileSilently();
  }

  async credentials(): Promise<void> {
    if (this.options.pretend || this.options.dummyApp) return;

    await new CredentialsGenerator([], { quiet: true }).addCredentialsFile();
  }

  async credentialsDiffEnroll(): Promise<void> {
    if (this.options.skipDecryptedDiffs || this.options.dummyApp || this.options.pretend) return;

    await this.generator.shell.mute(() =>
      this.trailsCommand("credentials:diff --enroll", {
        inline: true,
        shell: this.generator.shell,
      }),
    );
  }

  /** @missingRailsArgs template — PERMANENT */
  async databaseYml(): Promise<void> {
    await this.template(this.database.template, "config/database.ts");
  }

  async db(): Promise<void> {
    await this.directory("db");
  }

  async lib(): Promise<void> {
    await this.emptyDirectory("lib");
    await this.emptyDirectoryWithKeepFile("lib/tasks");
  }

  async log(): Promise<void> {
    await this.emptyDirectoryWithKeepFile("log");
  }

  async publicDirectory(): Promise<void> {
    if (this.options.update && this.options.api) return;

    await this.directory("public", "public", { recursive: false });
  }

  async storage(): Promise<void> {
    await this.emptyDirectoryWithKeepFile("storage");
    await this.emptyDirectoryWithKeepFile("tmp/storage");
  }

  /** @missingRailsArgs template — PERMANENT */
  async test(): Promise<void> {
    await this.emptyDirectoryWithKeepFile("test/fixtures/files");
    await this.emptyDirectoryWithKeepFile("test/controllers");
    await this.emptyDirectoryWithKeepFile("test/mailers");
    await this.emptyDirectoryWithKeepFile("test/models");
    await this.emptyDirectoryWithKeepFile("test/helpers");
    await this.emptyDirectoryWithKeepFile("test/integration");

    await this.template("test/test-helper.ts");
    await this.template("test/global-setup.ts");
  }

  /** @missingRailsArgs template — PERMANENT */
  async systemTest(): Promise<void> {
    await this.emptyDirectoryWithKeepFile("test/system");

    await this.template("test/application-system-test-case.ts");
  }

  async tmp(): Promise<void> {
    await this.emptyDirectoryWithKeepFile("tmp");
    await this.emptyDirectoryWithKeepFile("tmp/pids");
  }

  async vendor(): Promise<void> {
    await this.emptyDirectoryWithKeepFile("vendor");
  }

  configTargetVersion(): string {
    return this._configTargetVersion ?? LOAD_DEFAULTS_VERSION;
  }
}

export class AppGenerator extends AppBase {
  readonly packageManager: PackageManager;
  readonly sqliteDriver: SqliteDriver;

  static override OPTION_IMPLICATIONS: Record<string, readonly string[]> = {
    ...AppBase.OPTION_IMPLICATIONS,
    skipGit: ["skipDecryptedDiffs"],
    minimal: [
      "skipActionCable",
      "skipActionMailbox",
      "skipActionMailer",
      "skipActionText",
      "skipActiveJob",
      "skipActiveStorage",
      "skipBootsnap",
      "skipBrakeman",
      "skipCi",
      "skipDevGems",
      "skipDocker",
      "skipHotwire",
      "skipJavascript",
      "skipJbuilder",
      "skipKamal",
      "skipEslint",
      "skipSolid",
      "skipSystemTest",
      "skipThruster",
    ],
    api: ["skipAssetPipeline", "skipJavascript"],
  };

  static {
    this.addSharedOptionsFor("application");
    this.classOption("version", {
      type: "boolean",
      aliases: "-v",
      group: "trails",
      desc: "Show Trails version number and quit",
    });
    this.classOption("api", {
      type: "boolean",
      desc: "Preconfigure smaller stack for API only apps",
    });
    this.classOption("minimal", { type: "boolean", desc: "Preconfigure a minimal trails app" });
    this.classOption("javascript", {
      type: "string",
      aliases: ["-j", "--js"],
      default: "importmap",
      enum: JAVASCRIPT_OPTIONS,
      desc: "Choose JavaScript approach",
    });
    this.classOption("css", {
      type: "string",
      aliases: "-c",
      enum: CSS_OPTIONS,
      desc: "Choose CSS processor. Check https://github.com/rails/cssbundling-rails for more options",
    });
    this.classOption("skipInstall", {
      type: "boolean",
      aliases: "-B",
      default: null,
      desc: "Don't install dependencies",
    });
    this.classOption("packageManager", {
      type: "string",
      enum: [...VALID_PACKAGE_MANAGERS],
      default: "pnpm",
      desc: "Package manager to use",
    });
    this.classOption("sqliteDriver", {
      type: "string",
      enum: [...VALID_SQLITE_DRIVERS],
      desc: "SQLite driver",
    });
    this.classOption("skipDecryptedDiffs", {
      type: "boolean",
      default: null,
      desc: "Don't configure git to show decrypted diffs of encrypted credentials",
    });
    this.publicCommand("reportImpliedOptions");
    this.methodAdded("setDefaultAccessorsBang");
    this.publicCommand("createRoot");
    this.methodAdded("createRootFiles");
    this.methodAdded("createAppFiles");
    this.methodAdded("createBinFiles");
    this.methodAdded("updateBinFiles");
    this.removeCommand("updateBinFiles");
    this.methodAdded("updateActiveStorage");
    this.removeCommand("updateActiveStorage");
    this.methodAdded("createDockerfiles");
    this.methodAdded("createEslintFile");
    this.methodAdded("createCifiles");
    this.methodAdded("createConfigFiles");
    this.methodAdded("updateConfigFiles");
    this.removeCommand("updateConfigFiles");
    this.methodAdded("createMasterKey");
    this.methodAdded("createCredentials");
    this.methodAdded("createBootFile");
    this.methodAdded("createActiveRecordFiles");
    this.methodAdded("createDbFiles");
    this.methodAdded("createLibFiles");
    this.methodAdded("createLogFiles");
    this.methodAdded("createPublicFiles");
    this.methodAdded("createTmpFiles");
    this.methodAdded("createVendorFiles");
    this.methodAdded("createTestFiles");
    this.methodAdded("createSystemTestFiles");
    this.methodAdded("createStorageFiles");
    this.methodAdded("deleteAppAssetsIfApiOption");
    this.methodAdded("deleteAppHelpersIfApiOption");
    this.methodAdded("deleteAppViewsIfApiOption");
    this.methodAdded("deletePublicFilesIfApiOption");
    this.methodAdded("deleteActiveJobFolderIfSkippingActiveJob");
    this.methodAdded("deleteActionMailerFilesSkippingActionMailer");
    this.methodAdded("deleteNonApiInitializersIfApiOption");
    this.methodAdded("deleteApiInitializers");
    this.methodAdded("deleteNewFrameworkDefaults");
    this.methodAdded("applyTrailsTemplate");
    this.publicCommand("runInstall");
    this.publicCommand("generateBundlerBinstub");
  }

  declare options: AppGeneratorOptions & AppBaseOptions;

  static async applyTrailsTemplate(template: string, destination: string): Promise<AppGenerator> {
    const generator = new this(
      [destination],
      { template: template },
      { destinationRoot: destination },
    );
    generator.setDefaultAccessorsBang();
    await generator.applyTrailsTemplate();
    return generator;
  }

  static banner(): string {
    return `trails new ${(this as unknown as ThorClass)
      .arguments()
      .map((a) => a.usage())
      .join(" ")} [options]`;
  }

  constructor(args: unknown[] = [], localOptions: unknown = {}, config: GeneratorConfig = {}) {
    super(args, localOptions, config);
    if (this.options.database)
      this.options.database = DB_ALIAS[this.options.database] ?? this.options.database;
    this.implyOptions(AppGenerator.OPTION_IMPLICATIONS, { metaOptions: META_OPTIONS });
    const options: AppBaseOptions = { ...UNPORTED_SUBSYSTEM_SKIP_DEFAULTS, ...this.options };
    const skipDependents = options.skipActiveStorage ? true : undefined;
    this.options = Object.freeze({
      skipActionMailbox: skipDependents,
      skipActionText: skipDependents,
      ...options,
    });
    this.packageManager = this.options.packageManager ?? "pnpm";
    this.sqliteDriver = this.options.sqliteDriver ?? "better-sqlite3";
    if (!VALID_PACKAGE_MANAGERS.includes(this.packageManager)) {
      throw new GeneratorError(
        `Unknown package manager '${this.packageManager}'. Valid options: ${VALID_PACKAGE_MANAGERS.join(", ")}`,
      );
    }
    if (!VALID_SQLITE_DRIVERS.includes(this.sqliteDriver)) {
      throw new GeneratorError(
        `Unknown SQLite driver '${this.sqliteDriver}'. Valid options: ${VALID_SQLITE_DRIVERS.join(", ")}`,
      );
    }
  }

  async createRootFiles(): Promise<void> {
    await this.build("readme");
    await this.build("rakefile");
    await this.build("nodeVersion");
    await this.build("configru");

    if (!this.options.skipGit) {
      await this.build("gitignore");
      await this.build("gitattributes");
    }

    await this.build("gemfile");
    await this.build("versionControl");
  }

  async createAppFiles(): Promise<void> {
    await this.build("app");
  }

  async createBinFiles(): Promise<void> {
    await this.build("bin");
  }

  async createDockerfiles(): Promise<void> {
    if (this.options.skipDocker || this.options.dummyApp) return;
    await this.build("dockerfiles");
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

  async updateConfigFiles(): Promise<void> {
    await this.build("configWhenUpdating");
  }

  async createMasterKey(): Promise<void> {
    await this.build("masterKey");
  }

  async createCredentials(): Promise<void> {
    await this.build("credentials");
    await this.build("credentialsDiffEnroll");
  }

  /** @missingRailsArgs template — PERMANENT */
  async createBootFile(): Promise<void> {
    await this.template("config/boot.ts", "config/boot.ts");
  }

  async updateBinFiles(): Promise<void> {
    await this.build("binWhenUpdating");
  }

  async updateActiveStorage(): Promise<void> {
    if (!this.skipActiveStorage()) {
      await this.trailsCommand("active_storage:update", { inline: true });
    }
  }

  async createActiveRecordFiles(): Promise<void> {
    if (this.options.skipActiveRecord) return;
    await this.build("databaseYml");
  }

  async createDbFiles(): Promise<void> {
    if (this.options.skipActiveRecord) return;
    await this.build("db");
  }

  async createLibFiles(): Promise<void> {
    await this.build("lib");
  }

  async createLogFiles(): Promise<void> {
    await this.build("log");
  }

  async createPublicFiles(): Promise<void> {
    await this.build("publicDirectory");
  }

  async createTmpFiles(): Promise<void> {
    await this.build("tmp");
  }

  async createVendorFiles(): Promise<void> {
    await this.build("vendor");
  }

  async createTestFiles(): Promise<void> {
    if (!this.options.skipTest) await this.build("test");
  }

  async createSystemTestFiles(): Promise<void> {
    if (this.dependsOnSystemTest()) await this.build("systemTest");
  }

  async createStorageFiles(): Promise<void> {
    if (!this.skipStorage()) await this.build("storage");
  }

  async deleteAppAssetsIfApiOption(): Promise<void> {
    if (this.options.api) {
      await this.removeDir("app/assets");
    }
  }

  async deleteAppHelpersIfApiOption(): Promise<void> {
    if (this.options.api) {
      await this.removeDir("app/helpers");
      await this.removeDir("test/helpers");
    }
  }

  async deleteAppViewsIfApiOption(): Promise<void> {
    if (this.options.api) {
      if (this.options.skipActionMailer) {
        await this.removeDir("app/views");
      } else {
        await this.removeFile("app/views/layouts/application.html.tse");
        await this.removeDir("app/views/pwa");
      }
    }
  }

  async deletePublicFilesIfApiOption(): Promise<void> {
    if (this.options.api) {
      await this.removeFile("public/400.html");
      await this.removeFile("public/404.html");
      await this.removeFile("public/406-unsupported-browser.html");
      await this.removeFile("public/422.html");
      await this.removeFile("public/500.html");
      await this.removeFile("public/icon.png");
      await this.removeFile("public/icon.svg");
    }
  }

  async deleteActiveJobFolderIfSkippingActiveJob(): Promise<void> {
    if (this.options.skipActiveJob) {
      await this.removeDir("app/jobs");
    }
  }

  async deleteActionMailerFilesSkippingActionMailer(): Promise<void> {
    if (this.options.skipActionMailer) {
      await this.removeFile("app/views/layouts/mailer.html.tse");
      await this.removeFile("app/views/layouts/mailer.text.tse");
      await this.removeDir("app/mailers");
      await this.removeDir("test/mailers");
    }
  }

  /** @missingRailsArgs remove_file — PERMANENT */
  async deleteNonApiInitializersIfApiOption(): Promise<void> {
    if (this.options.api) {
      await this.removeFile("config/initializers/content-security-policy.ts");
    }
  }

  async deleteApiInitializers(): Promise<void> {
    if (!this.options.api) {
      await this.removeFile("config/initializers/cors.ts");
    }
  }

  async deleteNewFrameworkDefaults(): Promise<void> {
    if (!this.options.update) {
      await this.removeFile(
        `config/initializers/new-framework-defaults-${VERSION.MAJOR}-${VERSION.MINOR}.ts`,
      );
    }
  }

  /** @internal */
  protected getBuilderClass(): new (generator: never) => object {
    return TopLevel.AppBuilder !== undefined ? TopLevel.AppBuilder : AppBuilder;
  }
}

export class ARGVScrubber {
  /** @internal */
  private argv: string[];

  constructor(argv: string[] = rbArgv()) {
    this.argv = argv;
  }

  async prepareBang(): Promise<string[]> {
    this.handleVersionRequestBang(this.argv[0]);
    return this.handleInvalidCommandBang(this.argv[0], this.argv, () =>
      this.handleRailsRcBang(this.argv.slice(1)),
    );
  }

  static async defaultRcFile(): Promise<string> {
    const xdgConfigHome = presence(env.XDG_CONFIG_HOME) ?? "~/.config";
    const xdgRailsrc = File.expandPath("trails/railsrc", xdgConfigHome);
    if (await File.isExistAsync(xdgRailsrc)) {
      return xdgRailsrc;
    } else {
      return File.expandPath("~/.trailsrc");
    }
  }

  /** @internal */
  private handleVersionRequestBang(argument: string | undefined): void {
    if (["--version", "-v"].includes(argument!)) {
      STDOUT.puts(`Trails ${VERSION.STRING}`);
      exit(0);
    }
  }

  /** @internal */
  private async handleInvalidCommandBang(
    argument: string | undefined,
    argv: string[],
    block: () => Promise<string[]>,
  ): Promise<string[]> {
    if (argument === "new") {
      return block();
    } else {
      return ["--help", ...argv.slice(1)];
    }
  }

  /** @internal */
  private async handleRailsRcBang(argv: string[]): Promise<string[]> {
    if (argv.find((arg) => arg === "--no-rc") !== undefined) {
      return argv.filter((arg) => arg !== "--no-rc");
    } else {
      return this.railsrc(argv, (rcArgv, rc) => this.insertRailsrcIntoArgvBang(rcArgv, rc));
    }
  }

  /** @internal */
  private async railsrc(
    argv: string[],
    block: (argv: string[], rc: string) => Promise<string[]>,
  ): Promise<string[]> {
    const customrc = argv.findIndex((x) => x.includes("--rc="));
    if (customrc !== -1) {
      const fname = File.expandPath(argv[customrc].replace(/--rc=/g, ""));
      return block([...argv.slice(0, customrc), ...argv.slice(customrc + 1)], fname);
    } else {
      return block(argv, await (this.constructor as typeof ARGVScrubber).defaultRcFile());
    }
  }

  /** @internal */
  private async readRcFile(railsrc: string): Promise<string[]> {
    const extraArgs = (await File.readlinesAsync(railsrc)).flatMap((line) =>
      stringSplit(stringSplit(line, "#", 2)[0]),
    );
    STDOUT.puts(`Using ${extraArgs.join(" ")} from ${railsrc}`);
    return extraArgs;
  }

  /** @internal */
  private async insertRailsrcIntoArgvBang(argv: string[], railsrc: string): Promise<string[]> {
    if (!(await File.isExistAsync(railsrc))) return argv;
    const extraArgs = await this.readRcFile(railsrc);
    return [...argv.slice(0, 1), ...extraArgs, ...argv.slice(1)];
  }
}
