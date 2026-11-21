import { Rack, Utils, type RackApp, type RackEnv, type RackResponse } from "@blazetrails/rack";
import {
  Logger,
  rbBlockGivenP,
  rbObjRespondTo,
  rbProcCall,
  STDOUT,
  TopLevel,
} from "@blazetrails/ruby-compat";

import { Resource } from "./cors/resource.js";
import { Resources } from "./cors/resources.js";
import { Result } from "./cors/result.js";

type DebugLogger = { debug(message: unknown, block?: () => unknown): unknown };
type CorsOptions = { debug?: unknown; logger?: DebugLogger | (() => DebugLogger) | null };
type Headers = Record<string, unknown>;
type CorsBlock = (this: Cors, cors: Cors) => void;

export class Cors {
  static readonly HTTP_ORIGIN = "HTTP_ORIGIN";
  static readonly HTTP_X_ORIGIN = "HTTP_X_ORIGIN";

  static readonly HTTP_ACCESS_CONTROL_REQUEST_METHOD = "HTTP_ACCESS_CONTROL_REQUEST_METHOD";
  static readonly HTTP_ACCESS_CONTROL_REQUEST_HEADERS = "HTTP_ACCESS_CONTROL_REQUEST_HEADERS";

  static readonly PATH_INFO = "PATH_INFO";
  static readonly REQUEST_METHOD = "REQUEST_METHOD";

  static readonly RACK_LOGGER = "rack.logger";
  static readonly RACK_CORS = "rack.cors";
  static readonly ENV_KEY = Cors.RACK_CORS;

  static readonly OPTIONS = "OPTIONS";

  static readonly DEFAULT_VARY_HEADERS: readonly string[] = Object.freeze(["Origin"]);

  static readonly Resource = Resource;
  static readonly Resources = Resources;
  static readonly Result = Result;

  /** @internal */
  protected app: RackApp;
  /** @internal */
  protected debugMode: boolean;
  /** @internal */
  protected logger: DebugLogger | null;
  /** @internal */
  protected loggerProc: (() => DebugLogger) | null;
  /** @internal */
  protected _allResources?: Resources[];

  constructor(app: RackApp, opts: CorsOptions | CorsBlock = {}, block?: CorsBlock) {
    if (rbBlockGivenP(opts)) {
      block = opts as CorsBlock;
      opts = {};
    }
    this.app = app;
    this.debugMode = (opts as CorsOptions).debug != null && (opts as CorsOptions).debug !== false;
    this.logger = this.loggerProc = null;

    const logger = (opts as CorsOptions).logger;
    if (logger != null) {
      if (rbObjRespondTo(logger, "call")) {
        this.loggerProc = (opts as CorsOptions).logger as () => DebugLogger;
      } else {
        this.logger = logger as DebugLogger;
      }
    }

    if (block == null) return;

    if (block.length === 1) {
      block.call(undefined as never, this);
    } else {
      block.call(this, this);
    }
  }

  isDebug(): boolean {
    return this.debugMode;
  }

  allow(block: (this: Resources, resources: Resources) => void): void {
    let resources: Resources;
    this.allResources().push((resources = new Resources()));

    if (block.length === 1) {
      block.call(undefined as never, resources);
    } else {
      block.call(resources, resources);
    }
  }

  async call(env: RackEnv): Promise<RackResponse> {
    if (env[Cors.HTTP_X_ORIGIN] != null) env[Cors.HTTP_ORIGIN] ??= env[Cors.HTTP_X_ORIGIN];

    const path = this.evaluatePath(env);

    let addHeaders: Headers | null = null;
    if (env[Cors.HTTP_ORIGIN] != null) {
      this.debug(env, null, () =>
        [
          "Incoming Headers:",
          `  Origin: ${env[Cors.HTTP_ORIGIN] as string}`,
          `  Path-Info: ${path ?? ""}`,
          `  Access-Control-Request-Method: ${(env[Cors.HTTP_ACCESS_CONTROL_REQUEST_METHOD] as string | undefined) ?? ""}`,
          `  Access-Control-Request-Headers: ${(env[Cors.HTTP_ACCESS_CONTROL_REQUEST_HEADERS] as string | undefined) ?? ""}`,
        ].join("\n"),
      );

      if (
        env[Cors.REQUEST_METHOD] === Cors.OPTIONS &&
        env[Cors.HTTP_ACCESS_CONTROL_REQUEST_METHOD] != null
      ) {
        if (!Utils.validPath(path!)) return [400, {}, []];

        const headers = this.processPreflight(env, path);
        this.debug(
          env,
          null,
          () =>
            "Preflight Headers:\n" +
            Object.entries(headers)
              .map((kv) => `  ${kv.join(": ")}`)
              .join("\n"),
        );
        return [200, headers, []];
      } else {
        addHeaders = this.processCors(env, path);
      }
    } else {
      Result.miss(env, Result.MISS_NO_ORIGIN);
    }

    const varyResource = this.resourceForPath(path);

    const [status, appHeaders, body] = (await rbProcCall(this.app, env)) as RackResponse;
    let headers = appHeaders as Headers;

    if (addHeaders != null) {
      headers = { ...addHeaders, ...headers };
      this.debug(env, null, () => {
        for (const [key, value] of Object.entries(addHeaders)) {
          if (Object.hasOwn(headers, key)) headers[`x-rack-cors-original-${key}`] = value;
        }
      });
    }

    if (varyResource != null) {
      const vary = headers["vary"] as string | string[] | undefined;
      const corsVaryHeaders =
        varyResource.varyHeaders != null && varyResource.varyHeaders.length > 0
          ? varyResource.varyHeaders
          : Cors.DEFAULT_VARY_HEADERS;
      headers["vary"] = [
        ...new Set([
          ...(vary != null ? [vary].flat().flatMap((v) => v.split(/,\s*/)) : []),
          ...corsVaryHeaders,
        ]),
      ].join(", ");
    }

    const result = env[Cors.ENV_KEY] as Result | null | undefined;
    if (this.isDebug() && result != null) result.appendHeader(headers);

    return [status, headers as RackResponse[1], body];
  }

  /** @internal */
  protected debug(env: RackEnv, message: unknown = null, block?: () => unknown): void {
    if (this.isDebug()) (this.logger || this.selectLogger(env)).debug(message, block);
  }

  /** @internal */
  protected selectLogger(env: RackEnv): DebugLogger {
    const Trails = (TopLevel as { Trails?: { logger?: DebugLogger | null } }).Trails;
    let logger: DebugLogger;
    if (this.loggerProc != null) {
      const loggerProc = this.loggerProc;
      this.loggerProc = null;
      logger = rbProcCall(loggerProc) as DebugLogger;
    } else if (Trails != null && rbObjRespondTo(Trails, "logger") && Trails.logger != null) {
      logger = Trails.logger;
    } else if (env[Cors.RACK_LOGGER] != null) {
      logger = env[Cors.RACK_LOGGER] as DebugLogger;
    } else {
      const stdoutLogger = new Logger(STDOUT);
      stdoutLogger.level = Logger.Severity.DEBUG;
      logger = stdoutLogger;
    }
    return (this.logger = logger);
  }

  /** @internal */
  protected evaluatePath(env: RackEnv): string | null {
    let path = (env[Cors.PATH_INFO] as string | null | undefined) ?? null;

    if (path != null) {
      path = Utils.unescapePath(path);

      if (Utils.validPath(path)) path = Utils.cleanPathInfo(path);
    }

    return path;
  }

  /** @internal */
  protected allResources(): Resources[] {
    return (this._allResources ??= []);
  }

  /** @internal */
  protected processPreflight(env: RackEnv, path: string | null): Record<string, string> {
    const result = Result.preflight(env);

    const [resource, error] = this.matchResource(path, env);
    if (resource == null) {
      result.miss(error);
      return {};
    }

    return resource.processPreflight(env, result);
  }

  /** @internal */
  protected processCors(env: RackEnv, path: string | null): Record<string, string> | null {
    const [resource, error] = this.matchResource(path, env);
    if (resource != null) {
      Result.hit(env);
      const cors = resource.toHeaders(env);
      return cors;
    } else {
      Result.miss(env, error);
      return null;
    }
  }

  /** @internal */
  protected resourceForPath(pathInfo: string | null): Resource | null {
    for (const r of this.allResources()) {
      const found = r.resourceForPath(pathInfo);
      if (found != null) return found;
    }
    return null;
  }

  /** @internal */
  protected matchResource(path: string | null, env: RackEnv): [Resource | null, string | null] {
    const origin = env[Cors.HTTP_ORIGIN] as string | null;

    let originMatched = false;
    for (const r of this.allResources()) {
      if (!r.isAllowOrigin(origin, env)) continue;

      originMatched = true;
      const found = r.matchResource(path, env);
      if (found != null) return [found, null];
    }

    return [null, originMatched ? Result.MISS_NO_PATH : Result.MISS_NO_ORIGIN];
  }
}

Rack.Cors = Cors;

declare module "@blazetrails/rack" {
  interface RackNamespace {
    Cors?: typeof Cors;
  }
}
