// Port of `Rails::Application`. PR 2.5c adds routesReloader/configFor/
// credentials/encrypted/keyGenerator/messageVerifier. Skipped methods
// listed in docs/trailties-plan.md.
import {
  ArgumentError,
  dasherize,
  EncryptedFile,
  getEnv,
  getFsAsync,
  getPathAsync,
  runLoadHooks,
  setTrailsRoot,
  underscore,
} from "@blazetrails/activesupport";
import { Executor, Reloader } from "@blazetrails/activesupport";
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
import "./trailties/assets.js";

let _appClass: typeof Application | null = null;
/** @internal Tracks which subclasses have fired `:before_configuration`. */
const _registered = new WeakSet<typeof Application>();

export class Application extends Engine {
  private _initialized = false;
  private _routesReloader?: RoutesReloader;
  private _orderedRailties?: Array<Trailtie | Trailtie[] | string>;
  private _keyGenerators = new Map<string, CachingKeyGenerator>();
  private _credentials?: EncryptedFile;
  private _app?: RackApp;
  /** Rails: `@executor = Class.new(ActiveSupport::Executor)` (`application.rb:122`);
   * `@reloader.executor = @executor` (`application.rb:124`) is the constructor.
   * The `typeof Executor` annotation is declaration-emit only: TypeScript
   * cannot write a `.d.ts` for an anonymous class type inheriting `#private`
   * fields (TS4094). */
  readonly executor: typeof Executor = class extends Executor {};
  /** Rails: `@reloader = Class.new(ActiveSupport::Reloader)` (`application.rb:123`) —
   * a per-application subclass so one app's prepare callbacks don't leak into
   * another's. Annotated for the same declaration-emit reason as `executor`. */
  readonly reloader: typeof Reloader = class extends Reloader {};
  logger: Logger | null = null;
  cache: CacheStore | null = null;
  /**
   * Rails: `attr_reader :reloaders` (`application.rb:102`), seeded
   * `@reloaders = []` (`application.rb:113`). Holds every object whose
   * `updated?` the `:set_clear_dependencies_hook` initializer polls; the
   * routes reloader registers itself here from `:set_routes_reloader_hook`
   * (`finisher.rb:162`).
   */
  readonly reloaders: unknown[] = [];

  constructor() {
    super();
    this.reloader.executor = this.executor;
  }

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
   */
  get initializers(): Collection {
    const bootstrap = Bootstrap.initializersFor(this);
    const inherited = super.initializers;
    return bootstrap
      .plus(this.railtiesInitializers(inherited))
      .plus(Finisher.initializersFor(this));
  }

  /**
   * Returns the ordered railties for this application considering
   * railtiesOrder — mirrors `Application#ordered_railties`
   * (`application.rb:588-612`). The `:all` slot holds the nested array Rails
   * flattens back out in `railtiesInitializers`.
   *
   * @internal
   */
  orderedRailties(): Array<Trailtie | Trailtie[] | string> {
    if (!this._orderedRailties) {
      const order: Array<Trailtie | Trailtie[] | string> = this.config.railtiesOrder.map(
        (railtie: unknown) => {
          if (railtie === ":main_app") {
            return this;
          } else if (typeof (railtie as { instance?: unknown })?.instance === "function") {
            return (railtie as { instance(): Trailtie }).instance();
          } else {
            return railtie as Trailtie | string;
          }
        },
      );

      const all = this.railties().minus(order as Trailtie[]);
      if (!(all as unknown[]).concat(order).includes(this)) all.push(this);
      if (!order.includes(":all")) order.push(":all");

      const index = order.indexOf(":all");
      order[index] = all;
      this._orderedRailties = order;
    }
    return this._orderedRailties;
  }

  /**
   * Mirrors `Application#railties_initializers` (`application.rb:614-624`).
   *
   * @internal
   */
  railtiesInitializers(current: Collection): Collection {
    let initializers = new Collection();
    for (const r of [...this.orderedRailties()].reverse().flat()) {
      if (r === this) {
        initializers = initializers.plus(current);
      } else {
        initializers = initializers.plus((r as Trailtie).initializers);
      }
    }
    return initializers;
  }

  /**
   * Run the initializer chain — Rails' `initialize!`. Idempotency mirrors
   * Rails: re-entry raises rather than silently returning.
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
    setTrailsRoot(() => this.config.root ?? bootRoot);
    await this.runInitializers(group, this);
    this._initialized = true;
    return this;
  }

  /**
   * Mirrors `Engine#app` (`engine.rb:516-524`) — builds the middleware
   * stack once and wraps the endpoint in it.
   *
   * @missingRailsCall build_middleware — CONVERGEABLE: Rails merges
   * `config.app_middleware + config.middleware` (both
   * `MiddlewareStackProxy`s) into the default stack. `MiddlewareStackProxy`
   * is not ported (`trailtie/configuration.ts:87` — `appMiddleware()`
   * returns undefined), so there are no queued operations to merge and the
   * default stack is assigned to `config.middleware` directly.
   * @missingRailsCall merge_into — CONVERGEABLE: same gap, the other half of
   * `engine.rb:519` — with no `MiddlewareStackProxy` there is nothing to merge
   * the default stack into.
   */
  app(): RackApp {
    if (this._app) return this._app;
    const stack = this.defaultMiddlewareStack();
    this.config.middleware = stack;
    return (this._app = stack.build(this.endpoint()));
  }

  /**
   * Rails: `alias :build_middleware_stack :app` (`application.rb:558`).
   *
   * @internal
   */
  buildMiddlewareStack(): RackApp {
    return this.app();
  }

  /** Mirrors `Application#default_middleware_stack` (`application.rb:626-629`).
   * Rails passes `paths`; `Engine#paths()` is async in trails (it resolves the
   * root first), so the sync `config.paths()` it delegates to is passed here.
   *
   * @internal
   */
  defaultMiddlewareStack(): MiddlewareStack {
    const defaultStack = new DefaultMiddlewareStack(this, this.config, this.config.paths());
    return defaultStack.buildStack();
  }

  /**
   * Mirrors `Application#ensure_generator_templates_added`
   * (`application.rb:631-634`).
   *
   * @internal
   */
  async ensureGeneratorTemplatesAdded(): Promise<void> {
    const configuredPaths = this.config.generators().templates as string[];
    const libTemplates = (await this.paths()).get("lib/templates");
    const existent = libTemplates ? await libTemplates.existent() : [];
    configuredPaths.unshift(...existent.filter((p) => !configuredPaths.includes(p)));
  }

  routesReloader(): RoutesReloader {
    return (this._routesReloader ??= new RoutesReloader());
  }

  /** Reload application routes regardless if they changed or not. */
  async reloadRoutesBang(): Promise<void> {
    await this.routesReloader().reload();
  }

  /** Rails: `reload_routes_unless_loaded` (`application.rb:164-166`). */
  async reloadRoutesUnlessLoaded(): Promise<boolean> {
    return this.initialized() && (await this.routesReloader().executeUnlessLoaded(this));
  }

  /** `config.secretKeyBase` wins, else `SECRET_KEY_BASE` env. */
  secretKeyBase(): string | null {
    return this.config.secretKeyBase ?? getEnv("SECRET_KEY_BASE") ?? null;
  }

  /**
   * 1000 iterations match Rails for cookie compatibility. A missing
   * `secretKeyBase` raises the `ArgumentError` Rails raises from
   * `Configuration#secret_key_base=`
   * (`railties/lib/rails/application/configuration.rb:524`); trails'
   * `Configuration#secretKeyBase` is a plain field, so the raise lands at the
   * first read that needs a key.
   */
  keyGenerator(secretKeyBase: string | null = this.secretKeyBase()): CachingKeyGenerator {
    if (secretKeyBase === null) {
      throw new ArgumentError(
        `Missing \`secret_key_base\` for '${resolveEnv()}' environment, set this string with \`bin/rails credentials:edit\``,
      );
    }
    let gen = this._keyGenerators.get(secretKeyBase);
    if (!gen) {
      gen = new CachingKeyGenerator(new KeyGenerator(secretKeyBase, { iterations: 1000 }));
      this._keyGenerators.set(secretKeyBase, gen);
    }
    return gen;
  }

  /** Raw 64-byte derived key — Rails feeds `generate_key(salt)` bytes to
   * HMAC, not hex; required for signed-cookie compatibility. */
  messageVerifier(verifierName: string): MessageVerifier {
    return new MessageVerifier(this.keyGenerator().generateKey(verifierName));
  }

  async credentials(): Promise<EncryptedFile> {
    if (this._credentials) return this._credentials;
    const c = this.config.credentials;
    const def = await defaultCredentialPaths(await this.resolvedRoot());
    return (this._credentials = await this.encrypted(c.contentPath ?? def.contentPath, {
      keyPath: c.keyPath ?? def.keyPath,
    }));
  }

  /** `path` is absolute or root-relative; both flow through
   * Rails.root.join / path.resolve. */
  async encrypted(
    path: string,
    opts: { keyPath?: string; envKey?: string } = {},
  ): Promise<EncryptedFile> {
    const p = await getPathAsync();
    const root = await this.resolvedRoot();
    return new EncryptedFile({
      contentPath: p.resolve(root, path),
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
   * (credentials, `configFor`, the `trailsRoot()` seam): an explicit
   * `config.root=` override, else the root `Application.findRoot` resolves.
   * Rails needs no such method — `config.root` is seeded from
   * `find_root(called_from)` when the configuration is built
   * (`engine.rb:553`) and so is never nil — but that seeding is async here.
   * The `cwd` fallback is Rails' own: `find_root_with_flag "config.ru", from,
   * Dir.pwd` (`application.rb:88-90`), not a tail bolted on afterwards.
   */
  async resolvedRoot(): Promise<string> {
    return this.config.root ?? (await this.root());
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
