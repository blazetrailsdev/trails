// Port of `Rails::Application`. PR 2.5c adds routesReloader/configFor/
// credentials/encrypted/keyGenerator/messageVerifier. Skipped methods
// listed in docs/trailties-plan.md.
import {
  dasherize,
  EncryptedFile,
  getEnv,
  getFsAsync,
  getPathAsync,
  runLoadHooks,
  setTrailsRoot,
  underscore,
} from "@blazetrails/activesupport";
import { Reloader } from "@blazetrails/activesupport";
import { CachingKeyGenerator, KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Engine } from "./engine.js";
import { Trailtie } from "./trailtie.js";
import { Bootstrap } from "./application/bootstrap.js";
import { DefaultMiddlewareStack } from "./application/default-middleware-stack.js";
import { Finisher } from "./application/finisher.js";
import { Configuration } from "./application/configuration.js";
import { RoutesReloader } from "./application/routes-reloader.js";
import { resolveEnv, loadDatabaseConfig, type DatabaseConfig } from "./database.js";
import { Collection, type InitializerGroup } from "./initializable.js";
import type { CacheStore, Logger } from "@blazetrails/activesupport";
import type { MiddlewareStack, RackApp } from "@blazetrails/actionpack";

let _appClass: typeof Application | null = null;
/** @internal Tracks which subclasses have fired `:before_configuration`. */
const _registered = new WeakSet<typeof Application>();

export class Application extends Engine {
  private _initialized = false;
  private _routesReloader?: RoutesReloader;
  private _keyGenerators = new Map<string, CachingKeyGenerator>();
  private _credentials?: EncryptedFile;
  private _app?: RackApp;
  /** Rails: `@reloader = Class.new(ActiveSupport::Reloader)` (`application.rb:123`) —
   * a per-application subclass so one app's prepare callbacks don't leak into
   * another's. */
  readonly reloader = class extends Reloader {};
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

  override get config(): Configuration {
    const cfg = this._config;
    if (cfg instanceof Configuration) return cfg;
    const newCfg = new Configuration(null);
    this._config = newCfg;
    return newCfg;
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
   * Rails' `Application#initializers` (`application.rb:445-449`).
   *
   * @missingRailsCall railties_initializers — Rails wraps the inherited
   * collection in `railties_initializers(super)` so `config.railties_order`
   * can reorder engines around the app; `ordered_railties` is not ported
   * (see `application.ts` PR 2.5), so the inherited collection is spliced
   * in load order.
   */
  get initializers(): Collection {
    const bootstrap = Bootstrap.initializersFor(this);
    const inherited = super.initializers;
    return bootstrap.plus(inherited).plus(Finisher.initializersFor(this));
  }

  /**
   * Run the initializer chain — Rails' `initialize!`. Idempotency mirrors
   * Rails: re-entry raises rather than silently returning.
   *
   * `config.root` is pinned to the resolved root before the chain runs:
   * Rails' `Application::Configuration#root` is `@root ||= find_root(...)`
   * and so is never nil once the app boots, which is what lets
   * `add_routing_paths` and `add_view_paths` read `paths[...]`. Trails'
   * `Configuration#root` is a plain reader and its resolution is async, so
   * it is pinned here rather than lazily in the getter.
   */
  async initialize(group: InitializerGroup = "default"): Promise<this> {
    if (this._initialized) throw new Error("Application has been already initialized.");
    // Publish a live view of the app root so ActiveRecord's path-resolution
    // sites (SQLite DB path, config/database.* lookup) expand against it —
    // mirrors Rails' `Rails.root` being a live read of `application.config.root`
    // (rails.rb:65-67). The getter prefers `config.root` so a later
    // `config.setRoot(...)` (e.g. in an initializer) stays visible; `bootRoot`
    // is the discovered/cwd fallback for before any explicit override.
    const bootRoot = await this.resolvedRoot();
    if (this.config.root === null) this.config.setRoot(bootRoot);
    setTrailsRoot(() => this.config.root ?? bootRoot);
    await this.runInitializers(group, this);
    this._initialized = true;
    runLoadHooks("after_initialize", this);
    return this;
  }

  /**
   * Mirrors `Engine#app` (`engine.rb:516-524`) — builds the middleware
   * stack once and wraps the endpoint in it.
   *
   * @missingRailsCall build_middleware, merge_into — Rails merges
   * `config.app_middleware + config.middleware` (both
   * `MiddlewareStackProxy`s) into the default stack. `MiddlewareStackProxy`
   * is not ported (`trailtie/configuration.ts:87` — `appMiddleware()`
   * returns undefined), so there are no queued operations to merge and the
   * default stack is assigned to `config.middleware` directly.
   */
  app(): RackApp {
    if (this._app) return this._app;
    const stack = this.defaultMiddlewareStack();
    this.config.middleware = stack;
    return (this._app = stack.build(this.endpoint()));
  }

  /** Rails: `alias :build_middleware_stack :app` (`application.rb:558`). */
  buildMiddlewareStack(): RackApp {
    return this.app();
  }

  /**
   * Mirrors `Engine#endpoint` (`engine.rb:527-529`) — `self.class.endpoint`
   * is not ported, so the route set is always the endpoint. Rails hands the
   * `RouteSet` itself to the stack because it responds to `call`; trails'
   * `RackApp` is a function type, so the method is wrapped.
   */
  endpoint(): RackApp {
    const routes = this.routes();
    return (env) => routes.call(env);
  }

  /** Mirrors `Application#default_middleware_stack` (`application.rb:626-629`).
   * Rails passes `paths`; `Engine#paths()` is async in trails (it resolves the
   * root first), so the sync `config.paths()` it delegates to is passed here. */
  defaultMiddlewareStack(): MiddlewareStack {
    const defaultStack = new DefaultMiddlewareStack(this, this.config, this.config.paths());
    return defaultStack.buildStack();
  }

  /**
   * Mirrors `Application#ensure_generator_templates_added`
   * (`application.rb:631-634`).
   *
   * Rails filters `paths["lib/templates"]` through `existent`;
   * `Path#existent` is async in trails (`paths.ts:147`) while initializers run
   * synchronously (`Initializable#runInitializers`), so the declared paths are
   * unshifted unfiltered — see the `generator-templates-existent-paths` story.
   */
  ensureGeneratorTemplatesAdded(): void {
    const configuredPaths = this.config.generators().templates as string[];
    const libTemplates = this.config.paths().get("lib/templates")?.toAry() ?? [];
    configuredPaths.unshift(...libTemplates.filter((p) => !configuredPaths.includes(p)));
  }

  routesReloader(): RoutesReloader {
    return (this._routesReloader ??= new RoutesReloader());
  }

  /** `config.secretKeyBase` wins, else `SECRET_KEY_BASE` env. */
  secretKeyBase(): string | null {
    return this.config.secretKeyBase ?? getEnv("SECRET_KEY_BASE") ?? null;
  }

  /** 1000 iterations match Rails for cookie compatibility. */
  keyGenerator(secretKeyBase: string | null = this.secretKeyBase()): CachingKeyGenerator {
    if (secretKeyBase === null) throw new Error("Missing secret_key_base.");
    let gen = this._keyGenerators.get(secretKeyBase);
    if (!gen) {
      gen = new CachingKeyGenerator(new KeyGenerator(secretKeyBase, { iterations: 1000 }));
      this._keyGenerators.set(secretKeyBase, gen);
    }
    return gen;
  }

  /** Raw 64-byte derived key — Rails feeds `generate_key(salt)` bytes to
   * HMAC, not hex; required for signed-cookie compatibility. */
  messageVerifier(name: string): MessageVerifier {
    return new MessageVerifier(this.keyGenerator().generateKey(name));
  }

  async credentials(): Promise<EncryptedFile> {
    if (this._credentials) return this._credentials;
    const c = this.config.credentials;
    const def = await defaultCredentialPaths(await this.resolvedRoot());
    return (this._credentials = await this.encrypted(c.contentPath ?? def.contentPath, {
      keyPath: c.keyPath ?? def.keyPath,
    }));
  }

  /** `contentPath` matches Rails' `encrypted(path, ...)` arg — absolute or
   * root-relative; both flow through Rails.root.join / path.resolve. */
  async encrypted(
    contentPath: string,
    opts: { keyPath?: string; envKey?: string } = {},
  ): Promise<EncryptedFile> {
    const p = await getPathAsync();
    const root = await this.resolvedRoot();
    return new EncryptedFile({
      contentPath: p.resolve(root, contentPath),
      keyPath: p.resolve(root, opts.keyPath ?? "config/master.key"),
      envKey: opts.envKey ?? "RAILS_MASTER_KEY",
      raiseIfMissingKey: this.config.requireMasterKey,
    });
  }

  /** Trails: only `"database"` — dynamic `import()` of config/database.{ts,js}. */
  async configFor(name: string, opts: { env?: string } = {}): Promise<DatabaseConfig> {
    if (name !== "database") {
      throw new Error(`configFor: only "database" is supported in trailties (got "${name}").`);
    }
    return loadDatabaseConfig(opts.env ?? resolveEnv(), await this.resolvedRoot());
  }

  /** Boot-time root resolution for callers that need a concrete path
   * (credentials, `configFor`, the `trailsRoot()` seam): explicit
   * `config.root=` override, then the discovered source root, then cwd.
   * The cwd tail is a trails addition with no Rails counterpart — Rails'
   * `config.root` is a plain reader that stays nil. `Trails.root()` is the
   * Rails-faithful accessor and deliberately does NOT use this. */
  async resolvedRoot(): Promise<string> {
    return this.config.root ?? (await this.root()) ?? (await getFsAsync()).cwd();
  }
}

async function defaultCredentialPaths(
  root: string,
): Promise<{ contentPath: string; keyPath: string }> {
  const path = await getPathAsync();
  const fs = await getFsAsync();
  const env = resolveEnv();
  const envContent = path.resolve(root, "config", "credentials", `${env}.yml.enc`);
  if (await fs.exists(envContent)) {
    return {
      contentPath: envContent,
      keyPath: path.resolve(root, "config", "credentials", `${env}.key`),
    };
  }
  return {
    contentPath: path.resolve(root, "config", "credentials.yml.enc"),
    keyPath: path.resolve(root, "config", "master.key"),
  };
}
