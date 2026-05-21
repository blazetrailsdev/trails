// Port of `Rails::Application` from `railties/lib/rails/application.rb`.
// PR 2.5a: the Application shell — findRoot, `initialize!` happy path
// (Bootstrap + inherited Engine/Trailtie chain), `initialized?`, `name`,
// and the `appClass` accessor that PR 2.6's `Rails.application` reads.
// Configuration defaults + default middleware stack + Finisher splicing
// land in PR 2.5b; routes-reloader + config_for + credentials in PR 2.5c.
// Skipped from upstream (see docs/trailties-plan.md): secrets, eager_load!,
// assets, sandbox, executor, reloader, autoloaders, helpers_paths, to_app,
// migration_railties, load_generators, require_environment!, console/
// runner/generators/server block runners (PR 2.1b Configurable work).
// Trailties differs from Rails by using `config.ts` as the root flag
// (trails' rackup analog) and explicit `Application.register(klass)`
// instead of Ruby's `inherited` hook.
import { dasherize, getFsAsync, runLoadHooks, underscore } from "@blazetrails/activesupport";
import { Engine } from "./engine.js";
import { Trailtie } from "./trailtie.js";
import { Bootstrap } from "./application/bootstrap.js";
import { Collection, type InitializerGroup } from "./initializable.js";
import type { CacheStore, Logger } from "@blazetrails/activesupport";

let _appClass: typeof Application | null = null;
/** @internal Tracks which subclasses have fired `:before_configuration`. */
const _registered = new WeakSet<typeof Application>();

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
    const fresh = !_registered.has(subclass);
    Trailtie.register(subclass);
    _appClass = subclass;
    if (fresh) {
      _registered.add(subclass);
      runLoadHooks("before_configuration", subclass);
    }
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
   * Dasherized application name — mirrors Rails' `def name`. Strips a
   * trailing `/application` segment so `MyApp::Application#name` returns
   * `"my-app"`.
   */
  name(): string {
    return dasherize(underscore(this.constructor.name)).replace(/-application$/, "");
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
