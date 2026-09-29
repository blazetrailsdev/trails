import {
  dasherize,
  deepMerge,
  EncryptedConfiguration,
  getEnv,
  isPlainObject,
  OrderedOptions,
  ParameterFilter,
  runLoadHooks,
  setTrailsRoot,
  underscore,
} from "@blazetrails/activesupport";
import { getFs, getPath, rbConstGet, RuntimeError, symbolToS } from "@blazetrails/ruby-compat";
import { Executor, Reloader } from "@blazetrails/activesupport";
import { CachingKeyGenerator, KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Deprecators } from "@blazetrails/activesupport";
import { deprecator } from "./deprecator.js";
import { Engine } from "./engine.js";
import type { MiddlewareStackProxy } from "./configuration.js";
import { Trailtie } from "./trailtie.js";
import { Bootstrap } from "./application/bootstrap.js";
import { DefaultMiddlewareStack } from "./application/default-middleware-stack.js";
import { Finisher } from "./application/finisher.js";
import { Configuration } from "./application/configuration.js";
import { RoutesReloader } from "./application/routes-reloader.js";
import "./assets/trailtie.js";
import { Trails } from "./rails.js";
import { Collection, type InitializerGroup } from "./initializable.js";
import { Logger } from "@blazetrails/activesupport";
import type { MiddlewareStack, RackApp, Request } from "@blazetrails/actionpack";
import type { RackEnv } from "@blazetrails/rack";

let _appClass: typeof Application | null = null;
/** @internal */
const _registered = new WeakSet<typeof Application>();

export class Application extends Engine {
  private _initialized = false;
  private _routesReloader?: RoutesReloader;
  private _orderedRailties?: Array<Trailtie | Trailtie[] | string>;
  private _keyGenerators = new Map<string, CachingKeyGenerator>();
  private _appEnvConfig?: Record<string, unknown>;
  private _credentials?: EncryptedConfiguration;
  private _deprecators?: Deprecators;
  readonly executor: typeof Executor = class extends Executor {};
  readonly reloader: typeof Reloader = class extends Reloader {};
  logger: Logger | null = null;
  readonly reloaders: unknown[] = [];

  constructor() {
    super();
    this.reloader.executor = this.executor;
  }

  static get appClass(): typeof Application | null {
    return _appClass;
  }
  static set appClass(klass: typeof Application | null) {
    _appClass = klass;
  }

  static override register(subclass: typeof Application, calledFrom?: string): void {
    const fresh = !_registered.has(subclass);
    super.register(subclass, calledFrom);
    _appClass = subclass;
    if (fresh) {
      _registered.add(subclass);
      runLoadHooks("before_configuration", subclass);
    }
  }

  static override get config(): Configuration {
    return this.instance().config;
  }

  static override findRoot(from: string | undefined): string {
    const fs = getFs();
    return this.findRootWithFlag("config.ts", from, fs.cwd());
  }

  override get config(): Configuration {
    const cfg = this._config;
    if (cfg instanceof Configuration) return cfg;
    const klass = this.constructor as typeof Application;
    const newCfg = new Configuration(klass.findRoot(klass.calledFrom()));
    this._config = newCfg;
    return newCfg;
  }

  get deprecators(): Deprecators {
    if (!this._deprecators) {
      this._deprecators = new Deprecators();
      this._deprecators.set("trailties", deprecator());
    }
    return this._deprecators;
  }

  initialized(): boolean {
    return this._initialized;
  }

  name(): string {
    return dasherize(underscore(this.constructor.name)).replace(/-application$/, "");
  }

  get initializers(): Collection {
    const bootstrap = Bootstrap.initializersFor(this);
    const inherited = super.initializers;
    return bootstrap
      .plus(this.railtiesInitializers(inherited))
      .plus(Finisher.initializersFor(this));
  }

  /** @internal */
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

      const all: Trailtie[] = this.railties().minus(order as Trailtie[]);
      if (!(all as unknown[]).concat(order).includes(this)) all.push(this);
      if (!order.includes(":all")) order.push(":all");

      const index = order.indexOf(":all");
      order[index] = all;
      this._orderedRailties = order;
    }
    return this._orderedRailties;
  }

  /** @internal */
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

  async initialize(group: InitializerGroup = "default"): Promise<this> {
    if (this._initialized) throw new Error("Application has been already initialized.");
    setTrailsRoot(() => this.config.root);
    if (
      getEnv("SECRET_KEY_BASE_DUMMY") != null ||
      (getEnv("SECRET_KEY_BASE") == null && Trails.env["local?"]())
    ) {
      await this.config.generateLocalSecret();
    }
    await this.runInitializers(group, this);
    this._initialized = true;
    return this;
  }

  /** @internal */
  override buildRequest(env: RackEnv): Request {
    const req = super.buildRequest(env);
    env["ORIGINAL_FULLPATH"] = req.fullpath;
    env["ORIGINAL_SCRIPT_NAME"] = req.scriptName;
    return req;
  }

  /** @internal */
  override buildMiddleware(): MiddlewareStackProxy {
    return this.config.appMiddleware().plus(super.buildMiddleware());
  }

  /** @internal */
  buildMiddlewareStack(): RackApp {
    return this.app();
  }

  /** @internal */
  override defaultMiddlewareStack(): MiddlewareStack {
    const defaultStack = new DefaultMiddlewareStack(this, this.config, this.config.paths());
    return defaultStack.buildStack();
  }

  override async loadGenerators(app: Engine = this): Promise<this> {
    await (app as Application).ensureGeneratorTemplatesAdded();
    return super.loadGenerators(app);
  }

  /** @internal */
  async ensureGeneratorTemplatesAdded(): Promise<void> {
    const configuredPaths = this.config.generators().templates;
    const libTemplates = this.paths().get("lib/templates");
    const existent = libTemplates ? await libTemplates.existent() : [];
    configuredPaths.unshift(...existent.filter((p) => !configuredPaths.includes(p)));
  }

  async requireEnvironmentBang(): Promise<void> {
    const environment = (await (await this.paths()).get("config/environment")!.existent())[0];
    if (environment) await import(getPath().pathToFileURL!(environment).href);
  }

  routesReloader(): RoutesReloader {
    return (this._routesReloader ??= new RoutesReloader());
  }

  watchableArgs(): [string[], Record<string, string[]>] {
    const [files, dirs] = [[...this.config.watchableFiles], { ...this.config.watchableDirs }];

    return [files, dirs];
  }

  async reloadRoutesBang(): Promise<void> {
    await this.routesReloader().reloadBang();
  }

  async reloadRoutesUnlessLoaded(): Promise<boolean | null> {
    return this.initialized() && (await this.routesReloader().executeUnlessLoaded());
  }

  secretKeyBase(): string {
    return this.config.secretKeyBase;
  }

  keyGenerator(secretKeyBase: string = this.secretKeyBase()): CachingKeyGenerator {
    let gen = this._keyGenerators.get(secretKeyBase);
    if (!gen) {
      gen = new CachingKeyGenerator(new KeyGenerator(secretKeyBase, { iterations: 1000 }));
      this._keyGenerators.set(secretKeyBase, gen);
    }
    return gen;
  }

  messageVerifier(verifierName: string): MessageVerifier {
    return new MessageVerifier(this.keyGenerator().generateKey(verifierName));
  }

  override envConfig(): Record<string, unknown> {
    return (this._appEnvConfig ??= {
      ...super.envConfig(),
      "action_dispatch.parameter_filter": this.filterParameters(),
      "action_dispatch.redirect_filter": this.config.filterRedirect,
      "action_dispatch.secret_key_base": this.secretKeyBase(),
      "action_dispatch.show_exceptions": this.config.actionDispatch.showExceptions,
      "action_dispatch.show_detailed_exceptions": this.config.considerAllRequestsLocal,
      "action_dispatch.log_rescued_responses": this.config.actionDispatch.logRescuedResponses,
      "action_dispatch.debug_exception_log_level": rbConstGet(
        Logger,
        symbolToS(this.config.actionDispatch.debugExceptionLogLevel).toUpperCase(),
      ),
      "action_dispatch.logger": Trails.logger,
      "action_dispatch.backtrace_cleaner": Trails.backtraceCleaner,
      "action_dispatch.key_generator": this.keyGenerator(),
      "action_dispatch.http_auth_salt": this.config.actionDispatch.httpAuthSalt,
      "action_dispatch.signed_cookie_salt": this.config.actionDispatch.signedCookieSalt,
      "action_dispatch.encrypted_cookie_salt": this.config.actionDispatch.encryptedCookieSalt,
      "action_dispatch.encrypted_signed_cookie_salt":
        this.config.actionDispatch.encryptedSignedCookieSalt,
      "action_dispatch.authenticated_encrypted_cookie_salt":
        this.config.actionDispatch.authenticatedEncryptedCookieSalt,
      "action_dispatch.use_authenticated_cookie_encryption":
        this.config.actionDispatch.useAuthenticatedCookieEncryption,
      "action_dispatch.encrypted_cookie_cipher": this.config.actionDispatch.encryptedCookieCipher,
      "action_dispatch.signed_cookie_digest": this.config.actionDispatch.signedCookieDigest,
      "action_dispatch.cookies_serializer": this.config.actionDispatch.cookiesSerializer,
      "action_dispatch.cookies_digest": this.config.actionDispatch.cookiesDigest,
      "action_dispatch.cookies_rotations": this.config.actionDispatch.cookiesRotations,
      "action_dispatch.cookies_same_site_protection": this.coerceSameSiteProtection(
        this.config.actionDispatch.cookiesSameSiteProtection,
      ),
      "action_dispatch.use_cookies_with_metadata":
        this.config.actionDispatch.useCookiesWithMetadata,
      "action_dispatch.content_security_policy": this.config.contentSecurityPolicy(),
      "action_dispatch.content_security_policy_report_only":
        this.config.contentSecurityPolicyReportOnly,
      "action_dispatch.content_security_policy_nonce_generator":
        this.config.contentSecurityPolicyNonceGenerator,
      "action_dispatch.content_security_policy_nonce_directives":
        this.config.contentSecurityPolicyNonceDirectives,
      "action_dispatch.permissions_policy": this.config.permissionsPolicy(),
    });
  }

  async credentials(): Promise<EncryptedConfiguration> {
    if (this._credentials) return this._credentials;
    const c = this.config.credentials;
    const def = await this.config.credentialsDefaults();
    const credentials = await this.encrypted(c.contentPath ?? def.contentPath, {
      keyPath: c.keyPath ?? def.keyPath,
    });
    await credentials.config();
    return (this._credentials = credentials);
  }

  async encrypted(
    path: string,
    opts: { keyPath?: string; envKey?: string } = {},
  ): Promise<EncryptedConfiguration> {
    const p = getPath();
    const root = this.root()!;
    return new EncryptedConfiguration({
      configPath: p.resolve(root, path),
      keyPath: p.resolve(root, opts.keyPath ?? "config/master.key"),
      envKey: opts.envKey ?? "RAILS_MASTER_KEY",
      raiseIfMissingKey: this.config.requireMasterKey,
    });
  }

  async configFor(
    name: string,
    { env = Trails.env.toString() }: { env?: string } = {},
  ): Promise<unknown> {
    const configDir = ((await this.paths().get("config")?.existent()) ?? [])[0];
    const yaml = `${configDir}/${name}`;
    let ext: string | undefined;
    for (const e of [".ts", ".js"]) ext ??= (await getFs().exists(`${yaml}${e}`)) ? e : undefined;
    if (ext !== undefined) {
      const mod: { default?: unknown } = await import(
        getPath().pathToFileURL!(`${yaml}${ext}`).href
      );
      const allConfigs = mod.default ?? {};
      let config = (allConfigs as Record<string, unknown>)[env] ?? null;
      const shared = (allConfigs as Record<string, unknown>).shared;

      if (shared != null && shared !== false) {
        if (config == null && isPlainObject(shared)) config = {};
        if (isPlainObject(config) && isPlainObject(shared)) {
          config = deepMerge(shared, config);
        } else if (config == null) {
          config = shared;
        }
      }

      if (isPlainObject(config)) {
        config = new OrderedOptions().update(config);
      }

      return config;
    } else {
      throw new RuntimeError(`Could not load configuration. No such file - ${yaml}.ts`);
    }
  }

  /** @internal */
  private coerceSameSiteProtection(protection: unknown): unknown {
    return typeof protection === "function" ? protection : () => protection;
  }

  /** @internal */
  private filterParameters(): Array<string | RegExp | ((key: string, value: unknown) => unknown)> {
    if (this.config.precompileFilterParameters) {
      this.config.filterParameters.splice(
        0,
        this.config.filterParameters.length,
        ...ParameterFilter.precompileFilters(this.config.filterParameters),
      );
    }
    return this.config.filterParameters;
  }
}

Object.defineProperty(Application, "name", { value: "Rails::Application" });
