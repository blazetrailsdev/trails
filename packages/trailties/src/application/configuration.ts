// Port of `Rails::Application::Configuration` from
// `railties/lib/rails/application/configuration.rb`. PR 2.5b: scalar/state
// defaults only — `loadDefaults(version)` version-dispatch + credentials +
// `databaseConfiguration` are 2.5c or later.
import { Session } from "@blazetrails/actionpack";
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

  /** @internal `@session_store` (`application/configuration.rb:545`). */
  private _sessionStore: unknown = null;
  /** @internal `@session_options` (`application/configuration.rb:546`). */
  private _sessionOptions: Record<string, unknown> = {};

  /**
   * Mirrors `Configuration#session_store`
   * (`application/configuration.rb:543-557`). Ruby's one method both writes
   * (with an argument) and reads (without); the reader resolves a Symbol
   * through `ActionDispatch::Session.resolve_store`.
   */
  sessionStore(newSessionStore?: unknown, options?: Record<string, unknown>): unknown {
    if (newSessionStore != null && newSessionStore !== false) {
      this._sessionStore = newSessionStore;
      this._sessionOptions = options ?? {};
      return undefined;
    }
    if (this._sessionStore === ":disabled") return null;
    if (typeof this._sessionStore === "string" && this._sessionStore.startsWith(":")) {
      return Session.resolveStore(this._sessionStore);
    }
    return this._sessionStore;
  }

  /** Mirrors `Configuration#session_store?` (`application/configuration.rb:559-561`). */
  sessionStoreQ(): unknown {
    return this._sessionStore;
  }

  /** Mirrors the `attr_accessor :session_options` (`application/configuration.rb:32`). */
  get sessionOptions(): Record<string, unknown> {
    return this._sessionOptions;
  }
  set sessionOptions(value: Record<string, unknown>) {
    this._sessionOptions = value;
  }

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
   * Only `public` and `lib/templates` are added today; the remaining Rails entries land with their
   * respective consumers (PR 2.7-followups). See
   * `vendor/rails/railties/lib/rails/application/configuration.rb:396`.
   */
  override paths(): Root {
    const paths = super.paths();
    if (!paths.get("public")) paths.add("public");
    if (!paths.get("lib/templates")) paths.add("lib/templates");
    return paths;
  }
}
