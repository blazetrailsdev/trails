import "./trailties/active-support.js";
import "./trailties/action-dispatch.js";
import { EnvironmentInquirer } from "@blazetrails/activesupport";
import { getEnv } from "@blazetrails/activesupport";
import { ActiveSupport, Autoload, extend } from "@blazetrails/activesupport";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import type { ErrorReporter } from "@blazetrails/activesupport";
import type { CacheStore, Logger } from "@blazetrails/activesupport";
import { Application } from "./application.js";
import { BacktraceCleaner } from "./backtrace-cleaner.js";
import { Engine } from "./engine.js";
import { Trailtie } from "./trailtie.js";
import type { Autoloaders } from "./autoloaders.js";
import type { Generators } from "./generators.js";
import type { Configuration } from "./application/configuration.js";
import type { Console } from "./commands/console.js";
import type { Server } from "./commands/server.js";
import { resolveEnv } from "./database.js";
import type { InitializerGroup } from "./initializable.js";
import type { ActionMethods } from "./generators/trails/app/app-generator.js";
import { VERSION, gemVersion } from "./gem-version.js";
import { deprecator } from "./deprecator.js";
import { version } from "./version.js";
import type { Info } from "./info.js";
import type { InfoController } from "./info-controller.js";
import type { WelcomeController } from "./welcome-controller.js";
import type { HealthController } from "./health-controller.js";
import type { PwaController } from "./pwa-controller.js";
import type { MailersController } from "./mailers-controller.js";
import * as TrailsConfiguration from "./configuration.js";
import * as Paths from "./paths.js";
import { SourceAnnotationExtractor } from "./source-annotation-extractor.js";

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
  declare static HealthController: typeof HealthController;
  declare static Info: typeof Info;
  declare static InfoController: typeof InfoController;
  declare static MailersController: typeof MailersController;
  declare static PwaController: typeof PwaController;
  declare static WelcomeController: typeof WelcomeController;
  declare static Configuration: typeof TrailsConfiguration;
  declare static Paths: typeof Paths;
  declare static SourceAnnotationExtractor: typeof SourceAnnotationExtractor;
  declare static Rack?: typeof import("./rack.js");
  declare static Server?: typeof Server;
  declare static Console?: typeof Console;
  declare static Generators?: typeof Generators;
  declare static TestUnitRailtie?: typeof import("./test-unit/trailtie.js").TestUnitRailtie;
  declare static eagerLoadBang: () => Promise<void>;
  declare static autoload: (constName: string, path?: string | null) => void;
  declare static eagerAutoload: (block: () => void) => void;
  declare static _autoloads?: Record<string, () => Promise<string>>;

  static loadPath: Record<string, () => Promise<unknown>> = {
    "trails/info": () => import("./info.js"),
    "trails/info_controller": () => import("./info-controller.js"),
    "trails/mailers_controller": () => import("./mailers-controller.js"),
    "trails/welcome_controller": () => import("./welcome-controller.js"),
    "trails/health_controller": () => import("./health-controller.js"),
    "trails/pwa_controller": () => import("./pwa-controller.js"),
    "rack/cache": () => import("@blazetrails/rack-cache"),
    "action_dispatch/http/rack_cache": () =>
      import("@blazetrails/actionpack/action-dispatch/http/rack-cache"),
  };

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
    if (_application) return _application;
    const klass = Application.appClass;
    if (!klass) return null as RegisteredApplication;
    _application = klass.instance();
    return _application;
  }
  static set application(app: Application | null) {
    _application = app;
  }

  static get autoloaders(): Autoloaders {
    return Trails.application!.autoloaders;
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
  declare static Command?: {
    invoke(fullNamespace: string, args?: string[], config?: Record<string, unknown>): Promise<void>;
  };
  static version = version;
  static deprecator = deprecator;

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
    const expanded = paths.get("public")?.expanded();
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

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function _resetEnv(): void {
  _env = undefined;
}

/** @internal */
export function _resetTrailsEnv(): void {
  _resetEnv();
  _backtraceCleaner = undefined;
}

extend(Trails, Autoload);
const reopened = TopLevel.Trails;
constSet(TopLevel, "Trails", Trails);
if (reopened !== undefined) {
  Object.assign(
    Trails,
    Object.fromEntries(Object.entries(reopened).filter(([id]) => !(id in Trails))),
  );
}

Trails.autoload("Info");
Trails.autoload("InfoController");
Trails.autoload("MailersController");
Trails.autoload("WelcomeController");

Trails.eagerAutoload(() => {
  Trails.autoload("HealthController");
  Trails.autoload("PwaController");
});

Trails.Configuration = TrailsConfiguration;
Trails.Paths = Paths;
Trails.SourceAnnotationExtractor = SourceAnnotationExtractor;
