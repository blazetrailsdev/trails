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
  underscore,
} from "@blazetrails/activesupport";
import { CachingKeyGenerator, KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Engine } from "./engine.js";
import { Trailtie } from "./trailtie.js";
import { Bootstrap } from "./application/bootstrap.js";
import { Configuration } from "./application/configuration.js";
import { RoutesReloader } from "./application/routes-reloader.js";
import { resolveEnv, loadDatabaseConfig, type DatabaseConfig } from "./database.js";
import { Collection, type InitializerGroup } from "./initializable.js";
import type { CacheStore, Logger } from "@blazetrails/activesupport";

let _appClass: typeof Application | null = null;
/** @internal Tracks which subclasses have fired `:before_configuration`. */
const _registered = new WeakSet<typeof Application>();

export class Application extends Engine {
  private _initialized = false;
  private _routesReloader?: RoutesReloader;
  private _keyGenerators = new Map<string, CachingKeyGenerator>();
  private _credentials?: EncryptedFile;
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

  routesReloader(): RoutesReloader {
    return (this._routesReloader ??= new RoutesReloader());
  }

  /** `config.secretKeyBase` wins, else `SECRET_KEY_BASE` env. */
  secretKeyBase(): string | null {
    return this.config.secretKeyBase ?? getEnv("SECRET_KEY_BASE") ?? null;
  }

  /** 1000 iterations match Rails for cookie compatibility. */
  keyGenerator(secret: string | null = this.secretKeyBase()): CachingKeyGenerator {
    if (secret === null) throw new Error("Missing secret_key_base.");
    let gen = this._keyGenerators.get(secret);
    if (!gen) {
      gen = new CachingKeyGenerator(new KeyGenerator(secret, { iterations: 1000 }));
      this._keyGenerators.set(secret, gen);
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
    const def = await defaultCredentialPaths(await this.requireRoot());
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
    const root = await this.requireRoot();
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
    return loadDatabaseConfig(opts.env ?? resolveEnv(), await this.requireRoot());
  }

  private async requireRoot(): Promise<string> {
    return (await this.root()) ?? (await getFsAsync()).cwd();
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
