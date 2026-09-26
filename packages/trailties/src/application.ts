import {
  ArgumentError,
  dasherize,
  deepMerge,
  EncryptedFile,
  getEnv,
  isPlainObject,
  OrderedOptions,
  runLoadHooks,
  setTrailsRoot,
  underscore,
} from "@blazetrails/activesupport";
import { getFs, getPath, RuntimeError } from "@blazetrails/ruby-compat";
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
import type { Logger } from "@blazetrails/activesupport";
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
  private _credentials?: EncryptedFile;
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

  static register(subclass: typeof Application): void {
    const fresh = !_registered.has(subclass);
    Trailtie.register(subclass);
    _appClass = subclass;
    if (fresh) {
      _registered.add(subclass);
      runLoadHooks("before_configuration", subclass);
    }
  }

  static override get config(): Configuration {
    return this.instance().config;
  }

  static async findRoot(from: string): Promise<string> {
    const fs = getFs();
    return this.findRootWithFlag("config.ts", from, fs.cwd());
  }

  override get config(): Configuration {
    const cfg = this._config;
    if (cfg instanceof Configuration) return cfg;
    const newCfg = new Configuration(null);
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
    await this.root();
    setTrailsRoot(() => this.config.root);
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

  /** @internal */
  async ensureGeneratorTemplatesAdded(): Promise<void> {
    const configuredPaths = this.config.generators().templates as string[];
    const libTemplates = (await this.paths()).get("lib/templates");
    const existent = libTemplates ? await libTemplates.existent() : [];
    configuredPaths.unshift(...existent.filter((p) => !configuredPaths.includes(p)));
  }

  routesReloader(): RoutesReloader {
    return (this._routesReloader ??= new RoutesReloader());
  }

  async reloadRoutesBang(): Promise<void> {
    await this.routesReloader().reload();
  }

  async reloadRoutesUnlessLoaded(): Promise<boolean> {
    return this.initialized() && (await this.routesReloader().executeUnlessLoaded(this));
  }

  secretKeyBase(): string | null {
    return this.config.secretKeyBase ?? getEnv("SECRET_KEY_BASE") ?? null;
  }

  keyGenerator(secretKeyBase: string | null = this.secretKeyBase()): CachingKeyGenerator {
    if (secretKeyBase === null) {
      throw new ArgumentError(
        `Missing \`secret_key_base\` for '${Trails.env}' environment, set this string with \`bin/rails credentials:edit\``,
      );
    }
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

  async credentials(): Promise<EncryptedFile> {
    if (this._credentials) return this._credentials;
    const c = this.config.credentials;
    await this.root();
    const def = await this.config.credentialsDefaults();
    return (this._credentials = await this.encrypted(c.contentPath ?? def.contentPath, {
      keyPath: c.keyPath ?? def.keyPath,
    }));
  }

  async encrypted(
    path: string,
    opts: { keyPath?: string; envKey?: string } = {},
  ): Promise<EncryptedFile> {
    const p = getPath();
    const root = await this.root();
    return new EncryptedFile({
      contentPath: p.resolve(root, path),
      keyPath: p.resolve(root, opts.keyPath ?? "config/master.key"),
      envKey: opts.envKey ?? "RAILS_MASTER_KEY",
      raiseIfMissingKey: this.config.requireMasterKey,
    });
  }

  async configFor(
    name: string,
    { env = Trails.env.toString() }: { env?: string } = {},
  ): Promise<unknown> {
    const configDir = ((await (await this.paths()).get("config")?.existent()) ?? [])[0];
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
}

Object.defineProperty(Application, "name", { value: "Rails::Application" });
