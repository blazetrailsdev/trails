import {
  Dir,
  Errno,
  File,
  LoadError,
  env,
  include,
  rbFSend,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { Error as ThorError } from "@blazetrails/thor/error";
import { Trails } from "../rails.js";
import { Generators } from "../generators.js";
import { GeneratorBase, type GeneratorOptions, type GeneratorConfig } from "./base.js";
import { Database, type DatabaseName } from "./database.js";
import { GeneratorError } from "./generated-attribute.js";

type Skip =
  | "ActiveRecord"
  | "ActiveStorage"
  | "ActionCable"
  | "ActionMailer"
  | "ActionMailbox"
  | "ActionText"
  | "ActiveJob"
  | "Javascript"
  | "Hotwire"
  | "Solid"
  | "Test"
  | "SystemTest"
  | "Keeps"
  | "Eslint";

export type AppBaseOptions = GeneratorOptions & {
  appPath: string;
  name?: string;
  database?: DatabaseName;
  template?: string;
  api?: boolean;
  devcontainer?: boolean;
  dev?: boolean;
  [k: `skip${string}`]: boolean | undefined;
};

const UNPORTED_SUBSYSTEM_SKIP_DEFAULTS: Readonly<Record<string, boolean>> = {
  skipActionMailer: true,
  skipActiveStorage: true,
};

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
  private _builder?: object;

  static {
    this.argument("appPath", { type: "string" });
    this.classOption("template", {
      type: "string",
      aliases: "-m",
      desc: "Path to some application template (can be a filesystem path or URL)",
    });
    this.classOption("skipDocker", {
      type: "boolean",
      default: null,
      desc: "Skip Dockerfile, .dockerignore and bin/docker-entrypoint",
    });
    this.classOption("skipKeeps", {
      type: "boolean",
      default: null,
      desc: "Skip source control .keep files",
    });
    this.classOption("skipActionMailer", {
      type: "boolean",
      aliases: "-M",
      default: null,
      desc: "Skip Action Mailer files",
    });
    this.classOption("skipActionMailbox", {
      type: "boolean",
      default: null,
      desc: "Skip Action Mailbox gem",
    });
    this.classOption("skipActionText", {
      type: "boolean",
      default: null,
      desc: "Skip Action Text gem",
    });
    this.classOption("skipActiveRecord", {
      type: "boolean",
      aliases: "-O",
      default: null,
      desc: "Skip Active Record files",
    });
    this.classOption("skipActiveJob", { type: "boolean", default: null, desc: "Skip Active Job" });
    this.classOption("skipActiveStorage", {
      type: "boolean",
      default: null,
      desc: "Skip Active Storage files",
    });
    this.classOption("skipActionCable", {
      type: "boolean",
      aliases: "-C",
      default: null,
      desc: "Skip Action Cable files",
    });
    this.classOption("skipTest", {
      type: "boolean",
      aliases: "-T",
      default: null,
      desc: "Skip test files",
    });
    this.classOption("skipSystemTest", {
      type: "boolean",
      default: null,
      desc: "Skip system test files",
    });
    this.classOption("skipEslint", { type: "boolean", default: null, desc: "Skip ESLint setup" });
    this.classOption("skipCi", { type: "boolean", default: null, desc: "Skip GitHub CI files" });
    this.classOption("dev", {
      type: "boolean",
      default: null,
      desc: "Set up the application with package.json pointing to your Trails checkout",
    });
  }

  constructor(
    positionalArgv: unknown[] = [],
    optionArgv: unknown = {},
    config: GeneratorConfig = {},
  ) {
    super(positionalArgv, optionArgv, config);
    this.options = this.deduceImpliedOptions({
      ...UNPORTED_SUBSYSTEM_SKIP_DEFAULTS,
      ...Object.fromEntries(this.options as unknown as Iterable<[string, unknown]>),
    } as unknown as AppBaseOptions);
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

  skip(what: Skip): boolean {
    return !!this.options[`skip${what}`];
  }
  sqlite3(): boolean {
    return !this.skip("ActiveRecord") && (this.options.database ?? "sqlite3") === "sqlite3";
  }
  skipStorage(): boolean {
    return this.skip("ActiveStorage") && !this.sqlite3();
  }
  keeps(): boolean {
    return !this.options.skipKeeps;
  }
  /** @internal */
  devcontainer(): boolean {
    return !!this.options.devcontainer;
  }
  /** @internal */
  skipDevcontainer(): boolean {
    return !this.options.devcontainer;
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

  protected deduceImpliedOptions(opts: AppBaseOptions): AppBaseOptions {
    const out: Record<string, unknown> = { ...opts };
    let changed = true;
    while (changed) {
      changed = false;
      for (const [reason, implications] of Object.entries(OPTION_IMPLICATIONS)) {
        if (out[reason] !== true) continue;
        for (const impl of implications) {
          if (out[impl] === undefined) {
            out[impl] = true;
            changed = true;
          }
        }
      }
    }
    return out as unknown as AppBaseOptions;
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
