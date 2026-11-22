import {
  excBacktrace,
  include,
  rbModName,
  rbObjClone,
  rbObjDup,
  rbObjRespondTo,
  rbProcCall,
  stringSplit,
} from "@blazetrails/ruby-compat";
import type { MetaStore } from "./meta-store.js";
import { Options } from "./options.js";
import { Request } from "./request.js";
import { Response } from "./response.js";
import type { Storage } from "./storage.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a Rack env holds values of every type
type Env = Record<string, any>;
type EntityStore = Parameters<MetaStore["store"]>[2];

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Rack::Cache::Options` (`rack-cache/context.rb:10`)
export interface Context extends Omit<Options, "metastore" | "entitystore"> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Context {
  /** @internal */
  private _trace: unknown[];

  /** @internal */
  private _backend: unknown;

  /** @internal */
  private _options: Record<string, unknown>;

  /** @internal */
  private _privateHeaderKeys: string[];

  /** @internal */
  private _request!: Request;

  declare _env: Env | null | undefined;

  /** @internal */
  declare protected initializeOptions: (options?: Record<string, unknown>) => void;

  get trace(): unknown[] {
    return this._trace;
  }

  get backend(): unknown {
    return this._backend;
  }

  constructor(
    backend: unknown,
    options: Record<string, unknown> = {},
    block?: (context: Context) => void,
  ) {
    this._backend = backend;
    this._trace = [];
    this._env = null;
    this._options = options;

    this.initializeOptions(options);
    if (block !== undefined) block(this);

    this._privateHeaderKeys = (this.privateHeaders as string[]).map(
      (name) => `HTTP_${name.toUpperCase().replaceAll("-", "_")}`,
    );
  }

  async metastore(): Promise<MetaStore> {
    const uri = this.options["rack-cache.metastore"];
    return (await (this.storage as Storage).resolveMetastoreUri(uri, this._options)) as MetaStore;
  }

  async entitystore(): Promise<EntityStore> {
    const uri = this.options["rack-cache.entitystore"];
    return (await (this.storage as Storage).resolveEntitystoreUri(
      uri,
      this._options,
    )) as EntityStore;
  }

  async call(env: Env): Promise<[number, object, unknown]> {
    if (
      env["rack.run_once"] != null &&
      env["rack.run_once"] !== false &&
      (env["rack.multithread"] == null || env["rack.multithread"] === false)
    ) {
      return this.callBang(env);
    } else {
      return rbObjClone(this).callBang(env);
    }
  }

  async callBang(env: Env): Promise<[number, object, unknown]> {
    this._trace = [];
    for (const [k, v] of Object.entries(this._defaultOptions)) {
      if (env[k] == null || env[k] === false) env[k] = v;
    }
    this._env = env;
    this._request = new Request(Object.freeze({ ...this._env }));

    let response: Response;
    if (this._request.isGet() || this._request.isHead()) {
      if (
        (this._env["HTTP_EXPECT"] == null || this._env["HTTP_EXPECT"] === false) &&
        (this._env["rack-cache.force-pass"] == null || this._env["rack-cache.force-pass"] === false)
      ) {
        response = await this.lookup();
      } else {
        response = await this.pass();
      }
    } else {
      if (this._request.isOptions()) {
        response = await this.pass();
      } else {
        response = await this.invalidate();
      }
    }

    const trace = this._trace.join(", ");
    response.headers.set("x-rack-cache", trace);

    if (this.isVerbose()) {
      const message = `cache: [${this._request.requestMethod} ${this._request.fullpath}] ${trace}\n`;
      this.logInfo(message);
    }

    if ((this._request.isGet() || this._request.isHead()) && this.isNotModified(response)) {
      response.notModifiedBang();
    }

    if (this._request.isHead()) {
      if (rbObjRespondTo(response.body, "close")) (response.body as { close(): unknown }).close();
      response.body = [];
    }
    return response.toA();
  }

  /** @internal */
  private record(event: unknown): unknown[] {
    this._trace.push(event);
    return this._trace;
  }

  /** @internal */
  private isPrivateRequest(): boolean {
    return this._privateHeaderKeys.some((key) => Object.hasOwn(this._env!, key));
  }

  /** @internal */
  private isNotModified(response: Response): boolean | null {
    const lastModified = this._request.env["HTTP_IF_MODIFIED_SINCE"];
    let etags = this._request.env["HTTP_IF_NONE_MATCH"];
    if (etags != null) {
      etags = stringSplit(etags as string, /\s*,\s*/);
      return (
        ((etags as string[]).includes(response.etag as string) ||
          (etags as string[]).includes("*")) &&
        (lastModified == null || response.lastModified === lastModified)
      );
    } else if (lastModified != null) {
      return response.lastModified === lastModified;
    }
    return null;
  }

  /** @internal */
  private isFreshEnough(entry: Response): boolean | null {
    if (entry.isFresh()) {
      let maxAge;
      if (this.isAllowRevalidate() && (maxAge = this._request.cacheControl.maxAge()) != null) {
        return maxAge > 0 && maxAge >= entry.age;
      } else {
        return true;
      }
    }
    return null;
  }

  /** @internal */
  private async forward(): Promise<Response> {
    const [status, headers, body] = (await rbProcCall(this.backend, this._env)) as [
      number,
      unknown,
      unknown,
    ];
    return new Response(status, headers, body);
  }

  /** @internal */
  private async pass(): Promise<Response> {
    this.record("pass");
    return this.forward();
  }

  /** @internal */
  private async invalidate(): Promise<Response> {
    try {
      await (await this.metastore()).invalidate(this._request, await this.entitystore());
    } catch (e) {
      this.logError(e as Error);
      return this.pass();
    }
    this.record("invalidate");
    return this.pass();
  }

  /** @internal */
  private async lookup(): Promise<Response> {
    const noCache = this._request.isNoCache();
    if (noCache != null && noCache !== false && this.isAllowReload()) {
      this.record("reload");
      return this.fetch();
    } else {
      let entry: Response | null;
      try {
        entry = await (await this.metastore()).lookup(this._request, await this.entitystore());
      } catch (e) {
        this.logError(e as Error);
        return this.pass();
      }
      if (entry != null) {
        if (this.isFreshEnough(entry)) {
          this.record("fresh");
          entry.headers.set("age", String(entry.age));
          return entry;
        } else {
          this.record("stale");
          if (this.isFaultTolerant()) {
            return this.validateWithStaleCacheFailover(entry);
          } else {
            return this.validate(entry);
          }
        }
      } else {
        this.record("miss");
        return this.fetch();
      }
    }
  }

  /** @internal */
  private async validateWithStaleCacheFailover(entry: Response): Promise<Response> {
    try {
      return await this.validate(entry);
    } catch (e) {
      this.record("connnection_failed");
      const age = String(entry.age);
      entry.headers.set("age", age);
      this.record(
        `Fail-over to stale cache data with age ${age} due to ${rbModName((e as Error).constructor)}: ${(e as Error).message}`,
      );
      return entry;
    }
  }

  /** @internal */
  private async validate(entry: Response): Promise<Response> {
    this.convertHeadToGetBang();

    this._env!["HTTP_IF_MODIFIED_SINCE"] = entry.lastModified;

    const cachedEtags = stringSplit(String(entry.etag ?? ""), /\s*,\s*/);
    const requestEtags = stringSplit(
      String(this._request.env["HTTP_IF_NONE_MATCH"] ?? ""),
      /\s*,\s*/,
    );
    const etags = [...new Set([...cachedEtags, ...requestEtags])];
    this._env!["HTTP_IF_NONE_MATCH"] = etags.length === 0 ? null : etags.join(", ");

    let response = await this.forward();

    if (response.status === 304) {
      this.record("valid");

      const etag = response.headers.get("etag");
      if (etag != null && requestEtags.includes(etag) && !cachedEtags.includes(etag)) {
        return response;
      }

      entry = rbObjDup(entry);
      entry.headers.delete("date");
      for (const name of ["Date", "expires", "cache-control", "etag", "last-modified"]) {
        const value = response.headers.get(name);
        if (value == null) continue;
        entry.headers.set(name, value);
      }

      if (rbObjRespondTo(response.body, "close")) (response.body as { close(): unknown }).close();

      response = entry;
    } else {
      this.record("invalid");
    }

    if (response.isCacheable()) await this.store(response);

    return response;
  }

  /** @internal */
  private async fetch(): Promise<Response> {
    this.convertHeadToGetBang();

    const response = await this.forward();

    const isPublic = response.cacheControl.isPublic();
    if (this.isPrivateRequest() && (isPublic == null || isPublic === false)) {
      response.private = true;
    } else {
      const mustRevalidate = response.cacheControl.isMustRevalidate();
      if (
        (this.defaultTtl as number) > 0 &&
        response.ttl == null &&
        (mustRevalidate == null || mustRevalidate === false)
      ) {
        response.ttl = this.defaultTtl as number;
      }
    }

    if (response.isCacheable()) await this.store(response);

    return response;
  }

  /** @internal */
  private async store(response: Response): Promise<unknown[] | null> {
    try {
      this.stripIgnoreHeaders(response);
      await (await this.metastore()).store(this._request, response, await this.entitystore());
      response.headers.set("age", String(response.age));
    } catch (e) {
      this.logError(e as Error);
      return null;
    }
    return this.record("store");
  }

  /** @internal */
  private stripIgnoreHeaders(response: Response): unknown[] | undefined {
    const strippedValues = (this.ignoreHeaders as string[]).map((name) =>
      response.headers.delete(name),
    );
    if (strippedValues.some((value) => value != null)) return this.record("ignore");
    return undefined;
  }

  /** @internal */
  private logError(exception: Error): void {
    const message = `cache error: ${exception.message}\n${(excBacktrace(exception) ?? []).join("\n")}\n`;
    this.log("error", message);
  }

  /** @internal */
  private logInfo(message: string): void {
    this.log("info", message);
  }

  /** @internal */
  private log(level: "error" | "info", message: string): void {
    if (this._env!["rack.logger"] != null && this._env!["rack.logger"] !== false) {
      this._env!["rack.logger"][level](message);
    } else {
      this._env!["rack.errors"].write(message);
    }
  }

  /** @internal */
  private convertHeadToGetBang(): void {
    if (this._env!["REQUEST_METHOD"] === "HEAD") {
      this._env!["REQUEST_METHOD"] = "GET";
      this._env!["rack.methodoverride.original_method"] = "HEAD";
    }
  }
}
include(Context, Options);
