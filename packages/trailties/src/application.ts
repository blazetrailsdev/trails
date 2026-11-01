import {
  dasherize,
  deepMerge,
  EncryptedConfiguration,
  isPlainObject,
  OrderedOptions,
  ParameterFilter,
  runLoadHooks,
  setTrailsRoot,
  underscore,
} from "@blazetrails/activesupport";
import {
  File,
  getFs,
  getPath,
  LOAD_PATH,
  Pathname,
  constGet,
  RuntimeError,
  setSourceMapsSupport,
  symbolToS,
} from "@blazetrails/ruby-compat";
import { Executor, Reloader } from "@blazetrails/activesupport";
import { CachingKeyGenerator, KeyGenerator } from "@blazetrails/activesupport/key-generator";
import type { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { MessageVerifiers } from "@blazetrails/activesupport";
import { Deprecators } from "@blazetrails/activesupport";
import { deprecator } from "./deprecator.js";
import { Engine } from "./engine.js";
import type { MiddlewareStackProxy } from "./configuration.js";
import { Trailtie, type TrailtieBlock } from "./trailtie.js";
import { Bootstrap } from "./application/bootstrap.js";
import { DefaultMiddlewareStack } from "./application/default-middleware-stack.js";
import { Finisher } from "./application/finisher.js";
import { Configuration } from "./application/configuration.js";
import { RoutesReloader } from "./application/routes-reloader.js";
import "./assets/trailtie.js";
import { Trails } from "./rails.js";
import { Collection, type InitializerGroup } from "./initializable.js";
import { Logger } from "@blazetrails/activesupport";
import type { MiddlewareStack, RackApp, RackAppObject, Request } from "@blazetrails/actionpack";
import type { RackEnv } from "@blazetrails/rack";

let _appClass: typeof Application | null = null;
/** @internal */
const _registered = new WeakSet<typeof Application>();

const INITIAL_VARIABLES = [
  "config",
  "railties",
  "routesReloader",
  "reloaders",
  "routes",
  "helpers",
  "appEnvConfig",
];

export class Application extends Engine {
  private _initialized = false;
  private _routesReloader?: RoutesReloader;
  private _orderedRailties?: Array<Trailtie | Trailtie[] | string>;
  private _keyGenerators = new Map<string, CachingKeyGenerator>();
  private _appEnvConfig?: Record<string, unknown>;
  private _credentials?: EncryptedConfiguration;
  private _deprecators?: Deprecators;
  private _messageVerifiers?: MessageVerifiers;
  private _ranLoadHooks = false;
  private _initialVariableValues: Record<string, unknown>;
  private _block?: (this: this) => void;
  private _reloaders: unknown[] = [];
  assets: unknown = undefined;
  readonly executor: typeof Executor = class extends Executor {};
  readonly reloader: typeof Reloader = class extends Reloader {};
  sandbox: boolean | null | undefined = undefined;

  isSandbox(): boolean | null | undefined {
    return this.sandbox;
  }

  get reloaders(): unknown[] {
    return this._reloaders;
  }

  get defaultUrlOptions(): Record<string, unknown> {
    return this.routes().defaultUrlOptions;
  }

  set defaultUrlOptions(value: Record<string, unknown>) {
    this.routes().defaultUrlOptions = value;
  }

  /** @missingRailsCall new — PERMANENT */
  constructor(
    initialVariableValues: Record<string, unknown> = {},
    block?: (this: Application) => void,
  ) {
    super();
    this.reloader.executor = this.executor;
    this._initialVariableValues = initialVariableValues;
    this._block = block;
  }

  static override instance<T extends typeof Trailtie>(this: T): InstanceType<T> {
    const instance = super.instance.call(this) as unknown as Application;
    return instance.runLoadHooksBang() as unknown as InstanceType<T>;
  }

  static create(
    initialVariableValues: Record<string, unknown> = {},
    block?: (this: Application) => void,
  ): Application {
    return new this(initialVariableValues, block).runLoadHooksBang();
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
      this.addLibToLoadPathBang(subclass.findRoot(subclass.calledFrom()));
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

  runLoadHooksBang(): this {
    if (this._ranLoadHooks) return this;
    this._ranLoadHooks = true;

    for (const [variableName, value] of Object.entries(this._initialVariableValues)) {
      if (INITIAL_VARIABLES.includes(variableName)) {
        (this as unknown as Record<string, unknown>)[`_${variableName}`] = value;
      }
    }

    if (this._block) this._block.call(this);
    return this;
  }

  get initializers(): Collection {
    const bootstrap = Bootstrap.initializersFor(this);
    const inherited = super.initializers;
    return bootstrap
      .plus(this.railtiesInitializers(inherited))
      .plus(Finisher.initializersFor(this));
  }

  /** @internal */
  override runConsoleBlocks(app: unknown): void {
    for (const r of this.railties()) r.runConsoleBlocks(app);
    super.runConsoleBlocks(app);
  }

  /** @internal */
  override async runServerBlocks(app: unknown): Promise<void> {
    for (const r of this.railties()) await r.runServerBlocks(app);
    await super.runServerBlocks(app);
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

  rakeTasks(block: TrailtieBlock): void {
    (this.constructor as typeof Application).rakeTasks(block);
  }

  initializer(...args: Parameters<typeof Application.initializer>): void {
    (this.constructor as typeof Application).initializer(...args);
  }

  runner(blk: TrailtieBlock): void {
    (this.constructor as typeof Application).runner(blk);
  }

  console(blk: TrailtieBlock): void {
    (this.constructor as typeof Application).console(blk);
  }

  generators(blk: TrailtieBlock): void {
    (this.constructor as typeof Application).generators(blk);
  }

  server(blk: TrailtieBlock): void {
    (this.constructor as typeof Application).server(blk);
  }

  isolateNamespace(mod: Parameters<typeof Application.isolateNamespace>[0]): void {
    (this.constructor as typeof Application).isolateNamespace(mod);
  }

  static addLibToLoadPathBang(root: string): void {
    const path = File.join(root, "lib");
    if (File.isExist(path) && !LOAD_PATH.includes(path)) {
      LOAD_PATH.unshift(path);
    }
  }

  async initializeBang(group: InitializerGroup = "default"): Promise<this> {
    if (this._initialized) throw new Error("Application has been already initialized.");
    setSourceMapsSupport(true);
    setTrailsRoot(() => this.config.root);
    await this.runInitializers(group, this);
    this._initialized = true;
    return this;
  }

  toApp(): this {
    return this;
  }

  override async helpersPaths(): Promise<string[]> {
    return this.config.helpersPaths;
  }

  migrationRailties(): Array<Trailtie | string> {
    return this.orderedRailties()
      .flat()
      .filter((railtie) => railtie !== this);
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
  buildMiddlewareStack(): RackApp | RackAppObject {
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

  /** @missingRailsArgs new — CONVERGEABLE message-verifiers-rotation-secret-key-base-keyword */
  messageVerifiers(): MessageVerifiers {
    return (this._messageVerifiers ??= new MessageVerifiers(
      Object.assign(
        (salt: string, { secretKeyBase = this.secretKeyBase() }: { secretKeyBase?: string } = {}) =>
          this.keyGenerator(secretKeyBase).generateKey(salt),
        { parameters: ["secretKeyBase"] },
      ),
    ).rotateDefaults());
  }

  messageVerifier(verifierName: string): MessageVerifier {
    return this.messageVerifiers().get(verifierName);
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
      "action_dispatch.debug_exception_log_level": constGet(
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
    name: string | Pathname,
    { env = Trails.env.toString() }: { env?: string } = {},
  ): Promise<unknown> {
    const configDir = ((await this.paths().get("config")?.existent()) ?? [])[0];
    const yaml = name instanceof Pathname ? name : new Pathname(`${configDir}/${name}`);
    let ext: string | undefined;
    for (const e of name instanceof Pathname ? [""] : [".ts", ".js"]) {
      ext ??= (await getFs().exists(`${yaml}${e}`)) ? e : undefined;
    }
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
