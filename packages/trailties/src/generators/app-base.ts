import { Dir, File, include, rbFPublicSend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Trails } from "../rails.js";
import { Generators } from "../generators.js";
import { GeneratorBase, type GeneratorOptions } from "./base.js";
import { Database, type DatabaseName } from "./database.js";

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
  api?: boolean;
  devcontainer?: boolean;
  dev?: boolean;
  [k: `skip${string}`]: boolean | undefined;
};

const UNPORTED_SUBSYSTEM_SKIP_DEFAULTS: Readonly<Record<string, boolean>> = {
  skipActionCable: true,
  skipActionMailer: true,
  skipActiveJob: true,
  skipActiveStorage: true,
};

export const OPTION_IMPLICATIONS: Record<string, ReadonlyArray<keyof AppBaseOptions>> = {
  skipActiveJob: ["skipActionMailer", "skipActiveStorage"],
  skipActiveRecord: ["skipActiveStorage", "skipSolid"],
  skipActiveStorage: ["skipActionMailbox", "skipActionText"],
  skipJavascript: ["skipHotwire"],
};

export abstract class AppBase extends GeneratorBase {
  readonly appPath: string;
  readonly options: AppBaseOptions;
  private _database?: Database;
  /** @internal */
  private _builder?: object;

  static {
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

  constructor(options: AppBaseOptions) {
    super(options);
    this.appPath = options.appPath;
    this.destinationRoot = File.expandPath(options.appPath, options.cwd);
    this.cwd = this.destinationRoot;
    this.options = this.deduceImpliedOptions({ ...UNPORTED_SUBSYSTEM_SKIP_DEFAULTS, ...options });
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
    if (rbObjRespondTo(this.builder(), meth)) return rbFPublicSend(this.builder(), meth, ...args);
    return undefined;
  }

  /** @internal */
  get database(): Database {
    if (!this._database) this._database = Database.build(this.options.database ?? "sqlite3");
    return this._database;
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
    return !this.skip("Keeps");
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
    return !(this.skip("SystemTest") || this.skip("Test") || this.options.api);
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

  /** @internal */
  protected emptyDirectoryWithKeepFile(
    destination: string,
    config: { verbose?: boolean } = {},
  ): string | null {
    this.emptyDirectory(destination, config);
    return this.keepFile(destination);
  }

  /** @internal */
  protected keepFile(destination: string): string | null {
    return this.keeps() ? this.createFile(`${destination}/.keep`, "") : null;
  }
}
