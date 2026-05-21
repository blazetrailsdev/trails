// Port of `Rails` module from `railties/lib/rails.rb`.
// Renamed `Rails` → `Trails`; `api:compare` wires the alias via the
// `Rails: "Trails"` entry in `TS_CLASS_RENAMES` (compare.ts).
//
// Modeled as a class with static accessors (cf.
// `packages/activesupport/src/log-subscriber.ts`,
// `packages/activesupport/src/digest.ts`) so the api-compare extractor
// harvests getters/setters —
// `harvestObjectLiteralMethods` ignores accessors on object literals, but
// the class extractor walks `ts.isGetAccessorDeclaration` for static
// members. `Trails` is never instantiated.
import { EnvironmentInquirer } from "@blazetrails/activesupport";
import { getEnv } from "@blazetrails/activesupport";
import type { CacheStore, Logger } from "@blazetrails/activesupport";
import { Application } from "./application.js";
import { BacktraceCleaner } from "./backtrace-cleaner.js";
import type { Configuration } from "./application/configuration.js";
import { resolveEnv } from "./database.js";
import type { InitializerGroup } from "./initializable.js";
import { VERSION } from "./version.js";

let _application: Application | null = null;
let _cache: CacheStore | null = null;
let _logger: Logger | null = null;
let _env: EnvironmentInquirer | undefined;
let _backtraceCleaner: BacktraceCleaner | undefined;

/**
 * Trails-renamed `Rails` module from `railties/lib/rails.rb`. Mutations
 * flow through explicit setters (`Trails.application = app`,
 * `Trails.env = "test"`).
 *
 * `Trails.version` returns the `@blazetrails/trailties` package version
 * (`packages/trailties/src/version.ts`), NOT the tracked Rails upstream
 * version — resolves open question #3 in `docs/trailties-plan.md`.
 */
export class Trails {
  private constructor() {
    throw new Error("Trails is a static-only namespace; do not instantiate.");
  }

  static get application(): Application | null {
    // Rails: `@application ||= (app_class.instance if app_class)`. The `||=`
    // caches the first non-nil result, so a later `Application.appClass =`
    // does not retroactively change `Trails.application`.
    if (_application) return _application;
    const klass = Application.appClass;
    if (!klass) return null;
    _application = klass.instance() as Application;
    return _application;
  }
  static set application(app: Application | null) {
    _application = app;
  }

  static get cache(): CacheStore | null {
    return _cache;
  }
  static set cache(value: CacheStore | null) {
    _cache = value;
  }

  static get logger(): Logger | null {
    return _logger;
  }
  static set logger(value: Logger | null) {
    _logger = value;
  }

  static get version(): string {
    return VERSION;
  }

  /** Rails: `Rails.configuration` → `application.config`. */
  static get configuration(): Configuration | null {
    return Trails.application?.config ?? null;
  }

  /**
   * Rails: `@_env ||= ActiveSupport::EnvironmentInquirer.new(...)`.
   * Delegates to `resolveEnv()` in `database.ts` for a single source of
   * truth — reads `TRAILS_ENV`, defaults to `"development"`. Deliberately
   * does NOT fall back to `NODE_ENV` (see `database.ts:resolveEnv` for
   * the rationale: JS ecosystem treats `NODE_ENV` as a build-time hint,
   * not a runtime selector).
   */
  static get env(): EnvironmentInquirer {
    return (_env ??= new EnvironmentInquirer(resolveEnv()));
  }
  static set env(value: string | EnvironmentInquirer) {
    _env = typeof value === "string" ? new EnvironmentInquirer(value) : value;
  }

  /** Rails: `delegate :initialize!, to: :application`. Throws when no app
   * is registered, matching Rails' `NoMethodError` on `nil.initialize!`. */
  static async initialize(group: InitializerGroup = "default"): Promise<Application> {
    const app = Trails.application;
    if (!app)
      throw new Error("Trails.application is not set — register an Application subclass first.");
    return app.initialize(group);
  }

  /** Rails: `delegate :initialized?, to: :application`. Rails has no
   * `allow_nil:` on the delegate, so this throws when no app is
   * registered — matching the symmetric behavior of `initialize()`. */
  static initialized(): boolean {
    const app = Trails.application;
    if (!app)
      throw new Error("Trails.application is not set — register an Application subclass first.");
    return app.initialized();
  }

  static get backtraceCleaner(): BacktraceCleaner {
    return (_backtraceCleaner ??= new BacktraceCleaner());
  }

  /** Rails: `application && application.config.root`. */
  static async root(): Promise<string | undefined> {
    return Trails.application?.root();
  }

  /** Rails: `application && Pathname.new(application.paths["public"].first)`.
   * Returns null when no app is registered OR when the app's root is still
   * unresolved (Engine.calledFrom unset) — `Path#expanded` throws on a null
   * root, so we short-circuit before reaching it. */
  static async publicPath(): Promise<string | null> {
    const app = Trails.application;
    if (!app) return null;
    if ((await app.root()) === undefined) return null;
    const paths = await app.paths();
    const expanded = await paths.get("public")?.expanded();
    return expanded?.[0] ?? null;
  }

  /**
   * Rails: `Rails.groups(*groups)`. Combines `"default"`, current env, the
   * `TRAILS_GROUPS` env var, and option-hash keys whose value array
   * includes the current env. Result is deduped, preserving insertion
   * order.
   */
  static groups(...args: Array<string | Record<string, string[]>>): string[] {
    // Rails' `extract_options!` only pops a plain Hash. The TS signature
    // restricts callers to `string` group identifiers + an optional
    // trailing plain object, but at runtime someone could still pass an
    // array (`String(arr)` would yield a comma-joined identifier). The
    // plain-Object-prototype check is the defensive guard that mirrors
    // `extract_options!` exactly.
    const last = args[args.length - 1];
    const isPlainObject =
      last !== null &&
      typeof last === "object" &&
      !Array.isArray(last) &&
      (Object.getPrototypeOf(last) === Object.prototype || Object.getPrototypeOf(last) === null);
    const opts = isPlainObject ? (args.pop() as Record<string, string[]>) : {};
    const env = Trails.env.toString();
    const out: string[] = ["default", env, ...(args as string[])];
    // Rails: `groups.concat ENV["RAILS_GROUPS"].to_s.split(",")`.
    // Ruby's `String#split(",")` (no -1 limit) drops trailing empty
    // segments but preserves middle ones — mirror exactly.
    const envGroups = getEnv("TRAILS_GROUPS");
    if (envGroups) {
      const parts = envGroups.split(",");
      while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
      for (const g of parts) out.push(g);
    }
    for (const [k, envs] of Object.entries(opts)) {
      if (envs.includes(env)) out.push(k);
    }
    return [...new Set(out)];
  }
}

/** @internal Test-only — drops cached module-private singletons that
 * leak across vitest tests (EnvironmentInquirer, BacktraceCleaner). */
export function _resetTrailsEnv(): void {
  _env = undefined;
  _backtraceCleaner = undefined;
}
