import { Dir, File } from "@blazetrails/ruby-compat";
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

  static {
    this.classOption("skipEslint", { type: "boolean", default: null, desc: "Skip ESLint setup" });
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
}
