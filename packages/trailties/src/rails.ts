import "./trailties/active-support.js";
import "./trailties/action-dispatch.js";
import { EnvironmentInquirer } from "@blazetrails/activesupport";
import { getEnv } from "@blazetrails/activesupport";
import {
  trailsLogger,
  _setTrailsLogger,
  _setTrails as _setTrailsConst,
} from "@blazetrails/activesupport";
import type { CacheStore, Logger } from "@blazetrails/activesupport";
import { Application } from "./application.js";
import { BacktraceCleaner } from "./backtrace-cleaner.js";
import type { Configuration } from "./application/configuration.js";
import { resolveEnv } from "./database.js";
import type { InitializerGroup } from "./initializable.js";
import { VERSION } from "./version.js";
import { _setTrails } from "./trails-slot.js";

let _application: Application | null = null;
let _cache: CacheStore | null = null;
let _env: EnvironmentInquirer | undefined;
let _backtraceCleaner: BacktraceCleaner | undefined;

export class Trails {
  private constructor() {
    throw new Error("Trails is a static-only namespace; do not instantiate.");
  }

  static get application(): Application | null {
    if (_application) return _application;
    const klass = Application.appClass;
    if (!klass) return null;
    _application = klass.instance();
    return _application;
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

  static get logger(): Logger | null {
    return trailsLogger as Logger | null;
  }
  static set logger(value: Logger | null) {
    _setTrailsLogger(value);
  }

  static get version(): string {
    return VERSION;
  }

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
    return app.initialize(group);
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

  static async root(): Promise<string | undefined> {
    const app = Trails.application;
    if (!app) return undefined;
    return app.config.root ?? (await app.root());
  }

  static async publicPath(): Promise<string | null> {
    const app = Trails.application;
    if (!app) return null;
    const paths = await app.paths();
    const expanded = await paths.get("public")?.expanded();
    return expanded?.[0] ?? null;
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

_setTrails(Trails);
_setTrailsConst(Trails as unknown as { env: { "development?"(): boolean } });
