import {
  Dir,
  Errno,
  File,
  LoadError,
  RuntimeError,
  env,
  include,
  rbFSend,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { dasherize, underscore } from "@blazetrails/activesupport";
import { Error as ThorError } from "@blazetrails/thor/error";
import { Trails } from "../rails.js";
import { Generators } from "../generators.js";
import { GeneratorBase, type GeneratorOptions, type GeneratorConfig } from "./base.js";
import { DATABASES, Database, type DatabaseName } from "./database.js";
import { GeneratorError } from "./generated-attribute.js";

export type AppBaseOptions = GeneratorOptions & {
  appPath: string;
  name?: string;
  database?: DatabaseName;
  template?: string;
  api?: boolean;
  devcontainer?: boolean;
  dev?: boolean;
  edge?: boolean;
  main?: boolean;
  javascript?: string;
  css?: string;
  [k: `skip${string}`]: boolean | undefined;
};

const UNPORTED_SUBSYSTEM_SKIP_DEFAULTS: Readonly<Record<string, boolean>> = {
  skipActionMailer: true,
  skipActiveStorage: true,
};

export const NODE_LTS_VERSION = "20.11.1";
export const BUN_VERSION = "1.0.1";

export const JAVASCRIPT_OPTIONS = ["importmap", "bun", "webpack", "esbuild", "rollup"];
export const CSS_OPTIONS = ["tailwind", "bootstrap", "bulma", "postcss", "sass"];

export const OPTION_IMPLICATIONS: Record<string, ReadonlyArray<keyof AppBaseOptions>> = {
  skipActiveJob: ["skipActionMailer", "skipActiveStorage"],
  skipActiveRecord: ["skipActiveStorage", "skipSolid"],
  skipActiveStorage: ["skipActionMailbox", "skipActionText"],
  skipJavascript: ["skipHotwire"],
};

export abstract class AppBase extends GeneratorBase {
  declare appPath: string;
  declare options: AppBaseOptions;
  declare railsTemplate?: string;
  private _database?: Database;
  /** @internal */
  private _impliedOptions?: Record<string, string[]>;
  /** @internal */
  private _impliedOptionsConflicts: string[] = [];
  /** @internal */
  private _builder?: object;

  static {
    this.argument("appPath", { type: "string" });
    this.noCommands(() => this.methodAdded("requiredRailties"));
    this.noCommands(() => this.methodAdded("includeAllRailties"));
    this.noCommands(() => this.methodAdded("railsRequireStatement"));
    this.noCommands(() => this.methodAdded("sqlite3"));
    this.noCommands(() => this.methodAdded("skipStorage"));
    this.noCommands(() => this.methodAdded("keeps"));
    this.noCommands(() => this.methodAdded("devcontainer"));
    this.noCommands(() => this.methodAdded("skipDevcontainer"));
    this.noCommands(() => this.methodAdded("dependsOnSystemTest"));
    this.noCommands(() => this.methodAdded("railsGemfileEntry"));
    this.noCommands(() => this.methodAdded("railsDevPackages"));
    this.noCommands(() => this.methodAdded("applyRailsTemplate"));
    this.noCommands(() => this.methodAdded("setDefaultAccessorsBang"));
    this.noCommands(() => this.methodAdded("reportImpliedOptions"));
  }

  static strictArgsPosition(): boolean {
    return false;
  }

  static addSharedOptionsFor(name: string): void {
    const skip = (option: string, desc: string, aliases?: string | string[]): void => {
      this.classOption(option, {
        type: "boolean",
        ...(aliases === undefined ? {} : { aliases }),
        default: null,
        desc,
      });
    };

    this.classOption("name", { type: "string", aliases: "-n", desc: "Name of the app" });
    this.classOption("template", {
      type: "string",
      aliases: "-m",
      desc: `Path to some ${name} template (can be a filesystem path or URL)`,
    });
    this.classOption("database", {
      type: "string",
      aliases: "-d",
      default: "sqlite3",
      enum: [...DATABASES],
      desc: "Preconfigure for selected database",
    });
    skip("skipGit", "Skip git init, .gitignore and .gitattributes", "-G");
    skip("skipDocker", "Skip Dockerfile, .dockerignore and bin/docker-entrypoint");
    skip("skipKeeps", "Skip source control .keep files");
    skip("skipActionMailer", "Skip Action Mailer files", "-M");
    skip("skipActionMailbox", "Skip Action Mailbox gem");
    skip("skipActionText", "Skip Action Text gem");
    skip("skipActiveRecord", "Skip Active Record files", "-O");
    skip("skipActiveJob", "Skip Active Job");
    skip("skipActiveStorage", "Skip Active Storage files");
    skip("skipActionCable", "Skip Action Cable files", "-C");
    this.classOption("skipAssetPipeline", { type: "boolean", aliases: "-A", default: null });
    this.classOption("skipJavascript", {
      type: "boolean",
      aliases: ["-J", "--skip-js"],
      default: name === "plugin" ? true : null,
      desc: "Skip JavaScript files",
    });
    skip("skipHotwire", "Skip Hotwire integration");
    skip("skipJbuilder", "Skip jbuilder gem");
    skip("skipTest", "Skip test files", "-T");
    skip("skipSystemTest", "Skip system test files");
    skip("skipBootsnap", "Skip bootsnap gem");
    skip("skipDevGems", "Skip development gems (e.g., web-console)");
    skip("skipThruster", "Skip Thruster setup");
    skip("skipEslint", "Skip ESLint setup");
    skip("skipBrakeman", "Skip brakeman setup");
    skip("skipCi", "Skip GitHub CI files");
    skip("skipKamal", "Skip Kamal setup");
    skip("skipSolid", "Skip Solid Cache, Queue, and Cable setup");
    skip("dev", `Set up the ${name} with package.json pointing to your Trails checkout`);
    skip("devcontainer", "Generate devcontainer files");
    skip(
      "edge",
      `Set up the ${name} with a package.json pointing to the ${this.edgeBranch()} branch on the Trails repository`,
    );
    skip(
      "main",
      `Set up the ${name} with package.json pointing to Trails repository main branch`,
      "--master",
    );
    this.classOption("rc", {
      type: "string",
      default: null,
      desc: "Path to file containing extra configuration options for rails command",
    });
    skip("noRc", "Skip loading of extra configuration options from .railsrc file");
    this.classOption("help", {
      type: "boolean",
      aliases: "-h",
      group: "rails",
      desc: "Show this help message and quit",
    });
  }

  static edgeBranch(): string {
    return Trails.gemVersion().isPrerelease()
      ? "main"
      : [...Trails.gemVersion().segments().slice(0, 2), "stable"].join("-");
  }

  constructor(
    positionalArgv: unknown[] = [],
    optionArgv: unknown = {},
    config: GeneratorConfig = {},
  ) {
    super(positionalArgv, optionArgv, config);
    this.options = {
      ...UNPORTED_SUBSYSTEM_SKIP_DEFAULTS,
      ...Object.fromEntries(this.options as unknown as Iterable<[string, unknown]>),
    } as unknown as AppBaseOptions;
  }

  /** @internal */
  protected builder(): object {
    if (this._builder === undefined) {
      const builderClass = (
        this as unknown as { getBuilderClass(): new (generator: never) => object }
      ).getBuilderClass();
      include(builderClass, Trails.ActionMethods);
      this._builder =
        builderClass.prototype instanceof Trails.ActionMethods
          ? new builderClass(this as never)
          : (Reflect.construct(Trails.ActionMethods, [this], builderClass) as object);
    }
    return this._builder;
  }

  /** @internal */
  protected build(meth: string, ...args: unknown[]): unknown {
    if (rbObjRespondTo(this.builder(), meth)) return rbFSend(this.builder(), meth, ...args);
    return undefined;
  }

  /** @internal */
  protected deduceImpliedOptions(
    options: Record<string, unknown>,
    optionReasons: Record<string, string[]>,
    metaOptions: string[],
  ): Record<string, string[]> {
    const active: Record<string, string[]> = {};
    for (const [name, value] of Object.entries(options)) {
      if (value != null && value !== false) active[name] = [];
    }
    const irrevocable = new Set(Object.keys(active).filter((key) => !metaOptions.includes(key)));

    const deductionOrder: string[] = [];
    const visit = (key: string): void => {
      if (deductionOrder.includes(key)) return;
      for (const child of optionReasons[key] ?? []) visit(child);
      deductionOrder.push(key);
    };
    Object.keys(optionReasons).forEach(visit);

    for (const name of deductionOrder) {
      const activeReasons = (optionReasons[name] ?? []).filter((reason) => reason in active);
      if (activeReasons.length > 0) active[name] ??= activeReasons;
      if (activeReasons.some((reason) => irrevocable.has(reason))) irrevocable.add(name);
    }

    const revoked = new Set(
      Object.keys(options).filter((name) => options[name] === false && !irrevocable.has(name)),
    );
    for (const name of [...deductionOrder].reverse()) {
      if (revoked.has(name)) (optionReasons[name] ?? []).forEach((reason) => revoked.add(reason));
    }
    metaOptions.forEach((option) => revoked.delete(option));

    const implied: Record<string, string[]> = {};
    for (const [name, reasons] of Object.entries(active)) {
      if (!(revoked.has(name) || reasons.every((reason) => revoked.has(reason)))) {
        implied[name] = reasons.filter((reason) => !revoked.has(reason));
      }
    }
    return implied;
  }

  /** @internal */
  protected implyOptions(
    optionImplications: Record<string, ReadonlyArray<unknown>> = OPTION_IMPLICATIONS,
    { metaOptions = [] }: { metaOptions?: string[] } = {},
  ): void {
    const optionReasons: Record<string, string[]> = {};
    for (const [reason, implications] of Object.entries(optionImplications)) {
      for (const implication of implications) {
        (optionReasons[String(implication)] ??= []).push(reason);
      }
    }

    const options = this.options as unknown as Record<string, unknown>;
    this._impliedOptions = this.deduceImpliedOptions(options, optionReasons, metaOptions);
    this._impliedOptionsConflicts = Object.keys(this._impliedOptions).filter(
      (name) => options[name] === false,
    );
    this.options = Object.freeze({
      ...options,
      ...Object.fromEntries(Object.keys(this._impliedOptions).map((name) => [name, true])),
    }) as unknown as AppBaseOptions;
  }

  /** @internal */
  async reportImpliedOptions(): Promise<void> {
    const dasherized = (name: string): string => dasherize(underscore(name));
    if (this._impliedOptions === undefined || Object.keys(this._impliedOptions).length === 0)
      return;

    this.say("Based on the specified options, the following options will also be activated:");
    this.say("");
    for (const [name, reasons] of Object.entries(this._impliedOptions)) {
      const dueTo = reasons.map((reason) => `--${dasherized(reason)}`).join(", ");
      this.say(`  --${dasherized(name)} [due to ${dueTo}]`);
      if (this._impliedOptionsConflicts.includes(name)) {
        this.say(`    ERROR: Conflicts with --no-${dasherized(name)}`, "red");
      }
    }
    this.say("");

    if (this._impliedOptionsConflicts.length > 0) {
      throw new RuntimeError("Cannot proceed due to conflicting options");
    }
  }

  /** @internal */
  get database(): Database {
    if (!this._database) this._database = Database.build(this.options.database ?? "sqlite3");
    return this._database;
  }

  private _requiredRailties?: Record<string, boolean>;

  /** @internal */
  requiredRailties(): Record<string, boolean> {
    return (this._requiredRailties ??= {
      "@blazetrails/trailties/trailties/active-model": true,
      "@blazetrails/trailties/trailties/active-job": !this.options.skipActiveJob,
      "@blazetrails/trailties/trailties/active-record": !this.options.skipActiveRecord,
      "@blazetrails/trailties/trailties/active-storage": !this.options.skipActiveStorage,
      "@blazetrails/trailties/trailties/action-controller": true,
      "@blazetrails/trailties/trailties/action-mailer": !this.options.skipActionMailer,
      "@blazetrails/trailties/trailties/action-mailbox": !this.options.skipActionMailbox,
      "@blazetrails/trailties/trailties/action-text": !this.options.skipActionText,
      "@blazetrails/trailties/trailties/action-view": true,
      "@blazetrails/trailties/trailties/action-cable": !this.options.skipActionCable,
      "@blazetrails/trailties/test-unit/trailtie": !this.options.skipTest,
    });
  }

  includeAllRailties(): boolean {
    return Object.values(this.requiredRailties()).every((required) => required);
  }

  /** @internal */
  railsRequireStatement(): string {
    if (this.includeAllRailties()) {
      return `import "@blazetrails/trailties/all";`;
    } else {
      const requireStatements = Object.entries(this.requiredRailties()).map(
        ([railtie, required]) => `${!required ? "// " : ""}import "${railtie}";`,
      );

      return `import "@blazetrails/trailties/rails";
// Pick the frameworks you want:
${requireStatements.join("\n")}`;
    }
  }

  /** @internal */
  protected commentIf(value: string): string {
    const comment = rbObjRespondTo(this, value)
      ? rbFSend(this, value)
      : (this.options as unknown as Record<string, unknown>)[value];

    return comment != null && comment !== false ? "// " : "";
  }

  keeps(): boolean {
    return !this.options.skipKeeps;
  }
  sqlite3(): boolean {
    return !this.skipActiveRecord() && (this.options.database ?? "sqlite3") === "sqlite3";
  }
  /** @internal */
  protected skipActiveRecord(): boolean | undefined {
    return this.options.skipActiveRecord;
  }
  /** @internal */
  protected skipActiveStorage(): boolean | undefined {
    return this.options.skipActiveStorage;
  }
  skipStorage(): boolean {
    return !!this.skipActiveStorage() && !this.sqlite3();
  }
  /** @internal */
  protected skipActionCable(): boolean | undefined {
    return this.options.skipActionCable;
  }
  /** @internal */
  protected skipActionMailer(): boolean | undefined {
    return this.options.skipActionMailer;
  }
  /** @internal */
  protected skipActionMailbox(): boolean | undefined {
    return this.options.skipActionMailbox;
  }
  /** @internal */
  protected skipActionText(): boolean | undefined {
    return this.options.skipActionText;
  }
  /** @internal */
  protected skipAssetPipeline(): boolean | undefined {
    return this.options.skipAssetPipeline;
  }
  /** @internal */
  protected skipThruster(): boolean | undefined {
    return this.options.skipThruster;
  }
  /** @internal */
  protected skipEslint(): boolean | undefined {
    return this.options.skipEslint;
  }
  /** @internal */
  protected skipCi(): boolean | undefined {
    return this.options.skipCi;
  }
  /** @internal */
  skipDevcontainer(): boolean {
    return !this.options.devcontainer;
  }
  /** @internal */
  devcontainer(): boolean {
    return !!this.options.devcontainer;
  }
  /** @internal */
  protected skipKamal(): boolean | undefined {
    return this.options.skipKamal;
  }
  /** @internal */
  protected skipSolid(): boolean | undefined {
    return this.options.skipSolid;
  }
  /** @internal */
  protected railsPrerelease(): boolean {
    return !!(this.options.dev || this.options.edge || this.options.main);
  }

  /** @internal */
  protected usingJsRuntime(): boolean {
    const { javascript, css } = this.options;
    return (
      (!!javascript && javascript !== "importmap") || (!!css && !["tailwind", "sass"].includes(css))
    );
  }

  /** @internal */
  protected usingNode(): boolean {
    return this.usingJsRuntime() && this.options.javascript !== "bun";
  }

  /** @internal */
  protected usingBun(): boolean {
    return this.usingJsRuntime() && this.options.javascript === "bun";
  }

  /** @internal */
  protected dockerfileBasePackages(): string[] {
    const packages: Array<string | undefined> = ["curl"];

    if (!this.skipActiveRecord()) packages.push(this.database.basePackage);
    if (!this.skipActiveStorage()) packages.push("libvips");
    packages.push("libjemalloc2");

    return packages.filter((x) => x != null).sort();
  }

  /** @internal */
  protected dockerfileBuildPackages(): string[] {
    const packages: Array<string | undefined> = [
      "build-essential",
      "git",
      "pkg-config",
      "libyaml-dev",
    ];

    if (!this.skipActiveRecord()) packages.push(this.database.buildPackage);
    if (this.usingBun()) packages.push("unzip");

    if (this.usingNode()) {
      packages.push("node-gyp");

      packages.push("python-is-python3");
    }

    return packages.filter((x) => x != null).sort();
  }

  /** @internal */
  protected ciPackages(): string[] {
    if (this.dependsOnSystemTest()) {
      return [...this.dockerfileBuildPackages(), "google-chrome-stable"];
    } else {
      return this.dockerfileBuildPackages();
    }
  }

  /** @internal */
  protected dependOnBootsnap(): boolean {
    return !this.options.skipBootsnap && !this.options.dev;
  }

  /** @internal */
  protected edgeBranch(): string {
    return (this.constructor as typeof AppBase).edgeBranch();
  }

  /** @internal */
  protected dockerfileChownDirectories(): string[] {
    const directories = ["log", "tmp"];

    if (!this.skipStorage()) directories.push("storage");
    if (!this.skipActiveRecord()) directories.push("db");

    return directories.sort();
  }

  /** @internal */
  dependsOnSystemTest(): boolean {
    return !(this.options.skipSystemTest || this.options.skipTest || this.options.api);
  }

  /** @internal */
  railsGemfileEntry(name: string, packageManager: string): string {
    if (this.options.dev) {
      const path = this.railsDevPackages()[name];
      return `${packageManager === "pnpm" ? "link" : "file"}:${path}`;
    } else {
      return "*";
    }
  }

  /** @noRailsEquivalent PERMANENT */
  railsDevPackages(): Record<string, string> {
    const packages = File.join(Generators.RAILS_DEV_PATH, "packages");
    const out: Record<string, string> = {};
    for (const dir of Dir.children(packages).sort()) {
      const manifest = File.join(packages, dir, "package.json");
      if (!File.isExist(manifest)) continue;
      const { name } = JSON.parse(File.read(manifest)) as { name?: string };
      if (name?.startsWith("@blazetrails/")) out[name] = File.join(packages, dir);
    }
    return out;
  }

  async applyRailsTemplate(): Promise<void> {
    try {
      if (this.railsTemplate != null) await this.apply(this.railsTemplate);
    } catch (e) {
      if (e instanceof ThorError || e instanceof LoadError || e instanceof Errno.ENOENT) {
        throw new GeneratorError(
          `The template [${this.railsTemplate}] could not be loaded. Error: ${(e as Error).message}`,
        );
      }
      throw e;
    }
  }

  setDefaultAccessorsBang(): void {
    this.destinationRoot = File.expandPath(this.appPath, this.destinationRoot);

    if (typeof this.options.template === "string" && !/^https?:\/\//.test(this.options.template)) {
      const interpolated = this.options.template.replace(
        /\$(\w+)|\$\{(\w+)\}|%(\w+)%/g,
        (m, a, b, c) => env[a ?? b ?? c] ?? m,
      );
      this.railsTemplate = File.expandPath(interpolated);
    } else {
      this.railsTemplate = this.options.template;
    }
  }

  /** @internal */
  protected async emptyDirectoryWithKeepFile(
    destination: string,
    config: { verbose?: boolean } = {},
  ): Promise<unknown> {
    await this.emptyDirectory(destination, config);
    return await this.keepFile(destination);
  }

  /** @internal */
  protected async keepFile(destination: string): Promise<unknown> {
    return this.keeps() ? await this.createFile(`${destination}/.keep`, "") : null;
  }
}
