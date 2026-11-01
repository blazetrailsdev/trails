import "./trailties/active-support.js";
import "./trailties/action-dispatch.js";
import { EnvironmentInquirer } from "@blazetrails/activesupport";
import { getEnv } from "@blazetrails/activesupport";
import { ActiveSupport } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import type { ErrorReporter } from "@blazetrails/activesupport";
import type { CacheStore, Logger } from "@blazetrails/activesupport";
import { Application } from "./application.js";
import { BacktraceCleaner } from "./backtrace-cleaner.js";
import { Engine } from "./engine.js";
import { Trailtie } from "./trailtie.js";
import type { Configuration } from "./application/configuration.js";
import { resolveEnv } from "./database.js";
import type { InitializerGroup } from "./initializable.js";
import type { ActionMethods } from "./generators/app-generator.js";
import { VERSION, gemVersion } from "./gem-version.js";
import { version } from "./version.js";
import "./info-controller.js";
import "./welcome-controller.js";
import "./health-controller.js";
import "./pwa-controller.js";

let _application: Application | null = null;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ApplicationRegistry {}

type RegisteredApplication = ApplicationRegistry extends { application: infer A }
  ? A
  : Application | null;

let _cache: CacheStore | null = null;
let _env: EnvironmentInquirer | undefined;
let _backtraceCleaner: BacktraceCleaner | undefined;

export class Trails {
  private constructor() {
    throw new Error("Trails is a static-only namespace; do not instantiate.");
  }

  static get Application(): typeof Application {
    return Application;
  }

  static get Engine(): typeof Engine {
    return Engine;
  }

  static get Trailtie(): typeof Trailtie {
    return Trailtie;
  }

  declare static ActionMethods: typeof ActionMethods;

  static get application(): RegisteredApplication {
    if (_application) return _application as RegisteredApplication;
    const klass = Application.appClass;
    if (!klass) return null as RegisteredApplication;
    _application = klass.instance();
    return _application as RegisteredApplication;
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

  static logger: Logger | null = null;

  static VERSION = VERSION;
  static gemVersion = gemVersion;
  static version = version;

  static get configuration(): Configuration | null {
    return Trails.application?.config ?? null;
  }

  static get env(): EnvironmentInquirer {
    return (_env ??= new EnvironmentInquirer(resolveEnv()));
  }
  static set env(value: string | EnvironmentInquirer) {
    _env = typeof value === "string" ? new EnvironmentInquirer(value) : value;
  }

  static async initialize(group: InitializerGroup = "default"): Promise<Application> {
    const app = Trails.application;
    if (!app)
      throw new Error("Trails.application is not set — register an Application subclass first.");
    return app.initializeBang(group);
  }

  static initialized(): boolean {
    const app = Trails.application;
    if (!app)
      throw new Error("Trails.application is not set — register an Application subclass first.");
    return app.initialized();
  }

  static get backtraceCleaner(): BacktraceCleaner {
    return (_backtraceCleaner ??= new BacktraceCleaner());
  }

  static root(): string | null | undefined {
    const app = Trails.application;
    return app?.config.root;
  }

  static async publicPath(): Promise<string | null> {
    const app = Trails.application;
    if (!app) return null;
    const paths = app.paths();
    const expanded = await paths.get("public")?.expanded();
    return expanded?.[0] ?? null;
  }

  static get error(): ErrorReporter {
    return ActiveSupport.errorReporter;
  }

  static groups(...args: Array<string | Record<string, string[]>>): string[] {
    const last = args[args.length - 1];
    const isPlainObject =
      last !== null &&
      typeof last === "object" &&
      !Array.isArray(last) &&
      (Object.getPrototypeOf(last) === Object.prototype || Object.getPrototypeOf(last) === null);
    const opts = isPlainObject ? (args.pop() as Record<string, string[]>) : {};
    const env = Trails.env.toString();
    const out: string[] = ["default", env, ...(args as string[])];
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

/** @internal */
export function _resetTrailsEnv(): void {
  _env = undefined;
  _backtraceCleaner = undefined;
}

registerConstant("Trails", Trails);
