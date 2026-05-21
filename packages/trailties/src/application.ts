/**
 * Port of `Rails::Application` from `railties/lib/rails/application.rb`.
 *
 * PR 2.5a (this file): the Application shell — class identity, findRoot
 * happy path, `initialize!` happy path that runs the initializer chain
 * (Bootstrap + Trailtie/Engine + Finisher), `initialized?`, and the
 * `appClass` accessor that PR 2.6's `Rails.application` will read.
 *
 * Deferred:
 *   - PR 2.5b: `application/configuration.ts` defaults +
 *     `application/default-middleware-stack.ts` + full Rails-mirrored
 *     tests.
 *   - PR 2.5c: `application/routes-reloader.ts` + `config_for("database")`
 *     dynamic import + credentials/key_generator/message_verifier wiring.
 *
 * Intentionally skipped from upstream (see docs/trailties-plan.md):
 *   - `secrets` (pre-credentials back-compat), `eager_load!`,
 *     `assets`, `sandbox`, `executor`, `reloader`, `autoloaders` —
 *     blocked on subsystems we do not have or that are explicitly out
 *     of scope (Zeitwerk, eager loading).
 *   - `console`/`runner`/`generators`/`server` block runners —
 *     PR 2.1b's Configurable mixin work.
 *   - `migration_railties`, `load_generators`, `helpers_paths`,
 *     `to_app`, `console` block, `require_environment!` — follow-ups.
 *
 * Trailties differences from Rails:
 *   - `findRoot` looks for `config.ts` (the trails equivalent of Rails'
 *     `config.ru` — see `generators/app-generator.ts`).
 *   - Subclasses register explicitly via `Application.register(klass)`
 *     instead of Ruby's `inherited` hook. `register` doubles as Rails'
 *     `Rails.app_class = base` wiring.
 */
import { getFsAsync, runLoadHooks } from "@blazetrails/activesupport";
import { Engine } from "./engine.js";
import { Trailtie } from "./trailtie.js";
import { Bootstrap } from "./application/bootstrap.js";
import { Collection, type InitializerGroup } from "./initializable.js";
import type { CacheStore, Logger } from "@blazetrails/activesupport";

let _appClass: typeof Application | null = null;

export class Application extends Engine {
  private _initialized = false;
  logger: Logger | null = null;
  cache: CacheStore | null = null;

  /** Mirrors Rails' `Rails.app_class`. Set by {@link Application.register}. */
  static get appClass(): typeof Application | null {
    return _appClass;
  }
  static set appClass(klass: typeof Application | null) {
    _appClass = klass;
  }

  /**
   * Register a concrete Application subclass. Replaces Rails' `inherited`
   * hook; mirrors `Rails.app_class = base` and runs the
   * `:before_configuration` load hooks.
   */
  static register(subclass: typeof Application): void {
    Trailtie.register(subclass);
    _appClass = subclass;
    runLoadHooks("before_configuration", subclass);
  }

  /**
   * Trailties equivalent of Rails' `find_root_with_flag "config.ru"`:
   * walks parents from `from` looking for `config.ts`, falling back to
   * the fs adapter's cwd.
   */
  static async findRoot(from: string): Promise<string> {
    const fs = await getFsAsync();
    return this.findRootWithFlag("config.ts", from, fs.cwd());
  }

  /** Returns true once {@link Application#initialize} has completed. */
  initialized(): boolean {
    return this._initialized;
  }

  /**
   * Splice Bootstrap + Engine/Trailtie + Finisher initializers — mirrors
   * Rails' `Application#initializers`. Finisher splicing lands in PR 2.5b
   * once `Configuration` + the middleware stack supply the host methods
   * Finisher requires.
   */
  get initializers(): Collection {
    const bootstrap = Bootstrap.initializersFor(this);
    const inherited = super.initializers;
    return bootstrap.plus(inherited);
  }

  /**
   * Run the initializer chain — Rails' `initialize!`. Idempotency mirrors
   * Rails: re-entry raises rather than silently returning.
   */
  async initialize(group: InitializerGroup = "default"): Promise<this> {
    if (this._initialized) throw new Error("Application has been already initialized.");
    this.runInitializers(group, this);
    this._initialized = true;
    runLoadHooks("after_initialize", this);
    return this;
  }
}
