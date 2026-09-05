import { isPlainObject, type Included } from "@blazetrails/activesupport";
import { URI } from "@blazetrails/ruby-compat";
import {
  MockRequest,
  MockResponse,
  Request,
  parseNestedQuery,
  type RackApp,
} from "@blazetrails/rack";
import { CookieJar } from "./cookie-jar.js";
import type { Utils } from "./utils.js";

export const DEFAULT_HOST = "example.org";

export const MULTIPART_BOUNDARY = "----------XnJLe9ZIbbGUYtzPQJ16u1";

export const START_BOUNDARY = `--${MULTIPART_BOUNDARY}\r\n`;

export const END_BOUNDARY = `--${MULTIPART_BOUNDARY}--\r\n`;

export class Error extends globalThis.Error {}

/** @internal */
const DEFAULT_ENV: Record<string, unknown> = {
  "rack.test": true,
  REMOTE_ADDR: "127.0.0.1",
  SERVER_PROTOCOL: "HTTP/1.0",
};

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rack::Test::Utils` (`vendor/rack-test/lib/rack/test.rb:55`); the class/interface merge is how a mixin surfaces on the type side. */
export interface Session extends Included<typeof Utils> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class Session {
  cookieJar!: CookieJar;

  readonly defaultHost: string;

  /** @internal */
  private readonly app: RackApp;

  /** @internal */
  private _env: Record<string, unknown> = {};

  /** @internal */
  private _lastRequest: Request | null = null;

  /** @internal */
  private _lastResponse: MockResponse | null = null;

  static new(app: RackApp | Session, defaultHost: string = DEFAULT_HOST): Session {
    if (app instanceof Session) return app;
    return new Session(app, defaultHost);
  }

  constructor(app: RackApp, defaultHost: string = DEFAULT_HOST) {
    this.app = app;
    this.defaultHost = defaultHost;
    this.clearCookies();
  }

  clearCookies(): void {
    this.cookieJar = new CookieJar([], this.defaultHost);
  }

  setCookie(cookie: string | string[] | null | undefined, uri: URL | null = null): void {
    this.cookieJar.merge(cookie, uri && URI.parse(uri.toString()));
  }

  lastRequest(): Request {
    if (!this._lastRequest) throw new Error("No request yet. Request a page first.");
    return this._lastRequest;
  }

  lastResponse(): MockResponse {
    if (!this._lastResponse) throw new Error("No response yet. Request a page first.");
    return this._lastResponse;
  }

  async request(uri: string, env: Record<string, unknown> = {}): Promise<MockResponse> {
    const parsed = this.parseUri(uri, env);
    const requestEnv = this.envFor(parsed, env);
    return this.processRequest(parsed, requestEnv);
  }

  /** @internal */
  private parseUri(path: string, env: Record<string, unknown>): URL {
    const uri = new URL(path, `http://${this.defaultHost}/`);
    if (!uri.pathname.startsWith("/")) uri.pathname = `/${uri.pathname}`;
    if (env["HTTPS"] === "on") uri.protocol = "https:";
    return uri;
  }

  /** @internal */
  private envFor(uri: URL, env: Record<string, unknown>): Record<string, unknown> {
    env = { ...DEFAULT_ENV, ...this._env, ...env };

    env["HTTP_HOST"] ??= [uri.hostname, uri.port === "" ? null : uri.port]
      .filter((part) => part != null)
      .join(":");
    if (uri.protocol === "https:") env["HTTPS"] = "on";
    if (env[":xhr"] != null && env[":xhr"] !== false) {
      env["HTTP_X_REQUESTED_WITH"] = "XMLHttpRequest";
    }
    env["REQUEST_METHOD"] ??= env[":method"] != null ? String(env[":method"]).toUpperCase() : "GET";

    let params = env[":params"];
    delete env[":params"];
    const queryArray: Array<string | null | undefined> = [uri.search.slice(1)];

    if (env["REQUEST_METHOD"] === "GET") {
      if (params != null && params !== false) this.appendQueryParams(queryArray, params);
    } else if (!(":input" in env)) {
      env["CONTENT_TYPE"] ??= "application/x-www-form-urlencoded";
      if (params == null || params === false) params = {};
      let multipart: unknown;
      if (":multipart" in env) {
        multipart = env[":multipart"];
        delete env[":multipart"];
      } else {
        multipart = (env["CONTENT_TYPE"] as string).startsWith("multipart/");
      }

      if (isPlainObject(params)) {
        let data: string | null;
        if (
          Object.keys(params).length !== 0 &&
          (data = this.buildMultipart(params, false, multipart as boolean)) != null
        ) {
          env[":input"] = data;
          env["CONTENT_LENGTH"] ??= String(data.length);
          env["CONTENT_TYPE"] = `${this.multipartContentType(env)}; boundary=${MULTIPART_BOUNDARY}`;
        } else {
          env[":input"] = this.buildNestedQuery(params);
        }
      } else {
        env[":input"] = params;
      }
    }

    const compacted = queryArray.filter((q) => q != null && q !== "");
    uri.search = compacted.join("&");

    if (":cookie" in env) {
      const cookie = env[":cookie"] as string | undefined;
      delete env[":cookie"];
      this.setCookie(cookie, uri);
    }

    return MockRequest.envFor(uri.toString(), env);
  }

  /** @internal */
  private appendQueryParams(
    queryArray: Array<string | null | undefined>,
    queryParams: unknown,
  ): void {
    if (typeof queryParams === "string") queryParams = parseNestedQuery(queryParams);
    queryArray.push(this.buildNestedQuery(queryParams));
  }

  /** @internal */
  private multipartContentType(env: Record<string, unknown>): string {
    const requestedContentType = String(env["CONTENT_TYPE"]);
    if (requestedContentType.startsWith("multipart/")) {
      return requestedContentType;
    } else {
      return "multipart/form-data";
    }
  }

  /** @internal */
  private async processRequest(uri: URL, env: Record<string, unknown>): Promise<MockResponse> {
    env["HTTP_COOKIE"] ??= this.cookieJar.for(URI.parse(uri.toString()));
    this._lastRequest = new Request(env);
    const [status, headers, body] = await this.app(env);
    const parts: string[] = [];
    for await (const chunk of body) parts.push(String(chunk));

    this._lastResponse = new MockResponse(status, headers, parts, env["rack.errors"]);
    this.cookieJar.merge(this._lastResponse.getHeader("set-cookie"), URI.parse(uri.toString()));
    return this._lastResponse;
  }
}
