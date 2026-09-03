import { File } from "@blazetrails/ruby-compat";
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
  | "Keeps";

export type AppBaseOptions = GeneratorOptions & {
  appPath: string;
  name?: string;
  database?: DatabaseName;
  api?: boolean;
  devcontainer?: boolean;
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
  readonly destinationRoot: string;
  readonly options: AppBaseOptions;
  private _database?: Database;

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
