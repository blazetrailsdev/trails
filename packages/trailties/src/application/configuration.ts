// Port of `Rails::Application::Configuration` from
// `railties/lib/rails/application/configuration.rb`. PR 2.5b: scalar/state
// defaults only — `loadDefaults(version)` version-dispatch + credentials +
// `databaseConfiguration` are 2.5c or later.
import { EngineConfiguration } from "../engine/configuration.js";
import type { Root } from "../paths.js";

export interface PublicFileServer {
  enabled: boolean;
  indexName: string;
  headers: Record<string, string> | null;
}
export type SslOptions = {
  hsts?: { subdomains?: boolean } | boolean;
  secureCookies?: boolean;
  redirect?: unknown;
};
type WeekDay = "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
type LogLevel = "debug" | "info" | "warn" | "error" | "fatal" | "unknown";

/** Mirrors Rails' `Rails::Application::Configuration`. */
export class Configuration extends EngineConfiguration {
  allowConcurrency: boolean | null = null;
  considerAllRequestsLocal = false;
  filterParameters: Array<string | RegExp> = [];
  helpersPaths: string[] = [];
  hosts: Array<string | RegExp> = [];
  hostAuthorization: Record<string, unknown> = {};
  publicFileServer: PublicFileServer = { enabled: true, indexName: "index", headers: null };
  assumeSsl = false;
  forceSsl = false;
  sslOptions: SslOptions = {};
  sessionStore: unknown = null;
  sessionOptions: Record<string, unknown> = {};
  timeZone = "UTC";
  beginningOfWeek: WeekDay = "monday";
  logger: unknown = null;
  logLevel: LogLevel = "debug";
  logFormatter: unknown = null;
  logTags: unknown[] = [];
  logFileSize: number | null = null;
  autoflushLog = true;
  silenceHealthcheckPath: string | null = null;
  cacheClasses: boolean | null = null;
  cacheStore: unknown = ["file_store", "tmp/cache/"];
  reloadClassesOnlyOnChange = true;
  fileWatcher: unknown = null;
  exceptionsApp: unknown = null;
  debugExceptionResponseFormat: "default" | "api" | null = null;
  railtiesOrder: Array<string | symbol> = ["all"];
  relativeUrlRoot: string | null = null;
  requireMasterKey = false;
  secretKeyBase: string | null = null;
  credentials: { contentPath: string | null; keyPath: string | null } = {
    contentPath: null,
    keyPath: null,
  };
  disableSandbox = false;
  sandboxByDefault = false;
  encoding = "utf-8";
  apiOnly = false;
  eagerLoad: boolean | null = null;
  addAutoloadPathsToLoadPath = true;
  rakeEagerLoad = false;
  serverTiming = false;
  yjit = false;

  get enableReloading(): boolean {
    return !this.cacheClasses;
  }
  set enableReloading(value: boolean) {
    this.cacheClasses = !value;
  }
  reloadingEnabled(): boolean {
    return this.enableReloading;
  }

  /**
   * Mirrors `Rails::Application::Configuration#paths`: appends the app-only
   * path entries (`public`, `tmp`, `log`, …) on top of `EngineConfiguration#paths`.
   * Only `public` is added today; the remaining Rails entries land with their
   * respective consumers (PR 2.7-followups). See
   * `vendor/rails/railties/lib/rails/application/configuration.rb:396`.
   */
  override paths(): Root {
    const paths = super.paths();
    if (!paths.get("public")) paths.add("public");
    return paths;
  }
}
