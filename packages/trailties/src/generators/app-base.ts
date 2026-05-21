// Mirrors railties/lib/rails/generators/app_base.rb. Ports the option
// surface, predicate helpers, and option-implication propagation. The
// Ruby gemfile/bundler workflow is intentionally omitted — trailties
// uses npm/pnpm — and the corresponding Rails methods (bundle_command,
// run_bundle, run_javascript, run_hotwire, run_kamal,
// generate_bundler_binstub, target_rails_prerelease, dockerfile_*,
// rails_gemfile_entry, etc.) are tracked as PR 1.14d follow-ups.

import { GeneratorBase, type GeneratorOptions } from "./base.js";
import { Database, type DatabaseName } from "./database.js";

// Skip flags consumed by AppBase predicates and OPTION_IMPLICATIONS. The
// app-generator may pass additional flags (skipDocker, skipGit, etc.);
// `skip(...)` reads any `skip<X>` field, the union just type-checks the
// names used here.
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
  database?: DatabaseName;
  api?: boolean;
  devcontainer?: boolean;
  [k: `skip${string}`]: boolean | undefined;
};

// Mirrors AppBase::OPTION_IMPLICATIONS: meta options activate their
// implications unless explicitly revoked with `false`.
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
    // Mirrors AppBase#set_default_accessors!: destination_root resolves
    // app_path against the parent destination_root. Subclasses generate
    // into this directory, not the parent cwd.
    // PathAdapter.isAbsolute is optional; fall back to a POSIX/Win check.
    const isAbs =
      this.path.isAbsolute?.(options.appPath) ??
      (options.appPath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(options.appPath));
    this.destinationRoot = isAbs ? options.appPath : this.path.join(options.cwd, options.appPath);
    this.cwd = this.destinationRoot;
    this.options = this.deduceImpliedOptions(options);
  }

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
  devcontainer(): boolean {
    return !!this.options.devcontainer;
  }
  skipDevcontainer(): boolean {
    return !this.options.devcontainer;
  }
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
