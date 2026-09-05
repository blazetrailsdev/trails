import { isPlainObject, type Included } from "@blazetrails/activesupport";
import { Generic, HTTPS, URI, pack } from "@blazetrails/ruby-compat";
import {
  MockRequest,
  MockResponse,
  Request,
  parseNestedQuery,
  release,
  type RackApp,
  type RackEnv,
} from "@blazetrails/rack";
import { CookieJar } from "./cookie-jar.js";
import type { Utils } from "./utils.js";

export const DEFAULT_HOST = "example.org";

export const MULTIPART_BOUNDARY = "----------XnJLe9ZIbbGUYtzPQJ16u1";

export const START_BOUNDARY = `--${MULTIPART_BOUNDARY}\r\n`;

export const END_BOUNDARY = `--${MULTIPART_BOUNDARY}--\r\n`;

export class Error extends globalThis.Error {}

/** @noRailsEquivalent PERMANENT */
export type ResponseBlock = (response: MockResponse) => void;

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rack::Test::Utils` (`vendor/rack-test/lib/rack/test.rb:55`); the class/interface merge is how a mixin surfaces on the type side. */
export interface Session extends Included<typeof Utils> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class Session {
  cookieJar!: CookieJar;

  readonly defaultHost: string;

  /** @internal */
  private readonly app: RackApp;

  /** @internal */
  private _env: RackEnv = {};

  /** @internal */
  private _afterRequest: Array<() => void> = [];

  /** @internal */
  private _lastRequest: Request | null = null;

  /** @internal */
  private _lastResponse: MockResponse | null = null;

  static new(app: RackApp | Session, defaultHost: string = DEFAULT_HOST): Session {
    if (app instanceof Session) {
      return app;
    } else {
      return new Session(app, defaultHost);
    }
  }

  constructor(app: RackApp, defaultHost: string = DEFAULT_HOST) {
    this._env = {};
    this.app = app;
    this._afterRequest = [];
    this.defaultHost = defaultHost;
    this._lastRequest = null;
    this._lastResponse = null;
    this.clearCookies();
  }

  get(
    uri: string,
    params: unknown = {},
    env: RackEnv = {},
    block?: ResponseBlock,
  ): Promise<MockResponse> {
    return this.customRequest("GET", uri, params, env, block);
  }

  post(
    uri: string,
    params: unknown = {},
    env: RackEnv = {},
    block?: ResponseBlock,
  ): Promise<MockResponse> {
    return this.customRequest("POST", uri, params, env, block);
  }

  put(
    uri: string,
    params: unknown = {},
    env: RackEnv = {},
    block?: ResponseBlock,
  ): Promise<MockResponse> {
    return this.customRequest("PUT", uri, params, env, block);
  }

  patch(
    uri: string,
    params: unknown = {},
    env: RackEnv = {},
    block?: ResponseBlock,
  ): Promise<MockResponse> {
    return this.customRequest("PATCH", uri, params, env, block);
  }

  delete(
    uri: string,
    params: unknown = {},
    env: RackEnv = {},
    block?: ResponseBlock,
  ): Promise<MockResponse> {
    return this.customRequest("DELETE", uri, params, env, block);
  }

  options(
    uri: string,
    params: unknown = {},
    env: RackEnv = {},
    block?: ResponseBlock,
  ): Promise<MockResponse> {
    return this.customRequest("OPTIONS", uri, params, env, block);
  }

  head(
    uri: string,
    params: unknown = {},
    env: RackEnv = {},
    block?: ResponseBlock,
  ): Promise<MockResponse> {
    return this.customRequest("HEAD", uri, params, env, block);
  }

  clearCookies(): void {
    this.cookieJar = new CookieJar([], this.defaultHost);
  }

  setCookie(cookie: unknown, uri: Generic | null = null): void {
    this.cookieJar.merge(cookie as string, uri);
  }

  lastRequest(): Request {
    if (!this._lastRequest) throw new Error("No request yet. Request a page first.");
    return this._lastRequest;
  }

  lastResponse(): MockResponse {
    if (!this._lastResponse) throw new Error("No response yet. Request a page first.");
    return this._lastResponse;
  }

  async request(uri: string, env: RackEnv = {}, block?: ResponseBlock): Promise<MockResponse> {
    const parsedUri = this.parseUri(uri, env);
    env = this.envFor(parsedUri, env);
    return this.processRequest(parsedUri, env, block);
  }

  async customRequest(
    verb: string,
    uri: string,
    params: unknown = {},
    env: RackEnv = {},
    block?: ResponseBlock,
  ): Promise<MockResponse> {
    const parsedUri = this.parseUri(uri, env);
    env = this.envFor(parsedUri, {
      ...env,
      ":method": String(verb).toUpperCase(),
      ":params": params,
    });
    return this.processRequest(parsedUri, env, block);
  }

  header(name: string, value: unknown): void {
    name = name.toUpperCase();
    name = name.replaceAll("-", "_");
    if (name !== "CONTENT_TYPE" && name !== "CONTENT_LENGTH") name = `HTTP_${name}`;
    this.env(name, value);
  }

  /** @missingRailsCall delete — PERMANENT */
  env(name: string, value: unknown): void {
    if (value == null) {
      delete this._env[name];
    } else {
      this._env[name] = value;
    }
  }

  basicAuthorize(username: unknown, password: unknown): void {
    const encodedLogin = pack([`${String(username)}:${String(password)}`], "m0");
    this.header("Authorization", `Basic ${encodedLogin}`);
  }

  authorize = this.basicAuthorize;

  /** @internal */
  // eslint-disable-next-line unused-imports/no-unused-vars -- `def close_body(body); end` (`vendor/rack-test/lib/rack/test.rb:266`) names the argument and does nothing with it.
  private closeBody(body: unknown): void {}

  /** @internal */
  private parseUri(path: string, env: RackEnv): Generic {
    const uri = URI.parse(path);
    if (!uri.path!.startsWith("/")) uri.path = `/${uri.path}`;
    uri.host ??= this.defaultHost;
    if (env["HTTPS"] === "on") uri.scheme ??= "https";
    return uri;
  }

  /** @internal */
  private static readonly DEFAULT_ENV: RackEnv = {
    "rack.test": true,
    REMOTE_ADDR: "127.0.0.1",
    SERVER_PROTOCOL: "HTTP/1.0",
  };

  /** @internal */
  private envFor(uri: Generic, env: RackEnv): RackEnv {
    env = { ...Session.DEFAULT_ENV, ...this._env, ...env };

    env["HTTP_HOST"] ??= [uri.host, uri.port !== uri.defaultPort ? uri.port : null]
      .filter((part) => part != null)
      .join(":");
    if (uri instanceof HTTPS) env["HTTPS"] = "on";
    if (env[":xhr"] != null && env[":xhr"] !== false) {
      env["HTTP_X_REQUESTED_WITH"] = "XMLHttpRequest";
    }
    env["REQUEST_METHOD"] ??= env[":method"] != null ? String(env[":method"]).toUpperCase() : "GET";

    let params = env[":params"];
    delete env[":params"];
    let queryArray: Array<string | null | undefined> = [uri.query];

    if (env["REQUEST_METHOD"] === "GET") {
      if (params != null && params !== false) {
        this.appendQueryParams(queryArray, params);
      }
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

    const queryParams = env[":query_params"];
    delete env[":query_params"];
    if (queryParams != null && queryParams !== false) {
      this.appendQueryParams(queryArray, queryParams);
    }
    queryArray = queryArray.filter((q) => q != null);
    queryArray = queryArray.filter((q) => q !== "");
    uri.query = queryArray.join("&");

    if (":cookie" in env) {
      const cookie = env[":cookie"];
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
  private multipartContentType(env: RackEnv): string {
    const requestedContentType = env["CONTENT_TYPE"] as string;
    if (requestedContentType.startsWith("multipart/")) {
      return requestedContentType;
    } else {
      return "multipart/form-data";
    }
  }

  /**
   * @missingRailsCall call — PERMANENT
   * @internal
   */
  private async processRequest(
    uri: Generic,
    env: RackEnv,
    block?: ResponseBlock,
  ): Promise<MockResponse> {
    env["HTTP_COOKIE"] ??= this.cookieJar.for(uri);
    this._lastRequest = new Request(env);
    const [status, headers, rackBody] = await this.app(env);
    const body: string[] = [];
    for await (const chunk of rackBody) body.push(String(chunk));

    this._lastResponse = new MockResponse(
      status,
      headers,
      body,
      (env["rack.errors"] as { flush(): unknown }).flush(),
    );
    this.closeBody(rackBody);
    this.cookieJar.merge(this.lastResponse().headers["set-cookie"], uri);
    this._afterRequest.forEach((hook) => hook());
    this._lastResponse.finish();

    if (block) block(this._lastResponse);

    return this._lastResponse;
  }
}

export function encodingAwareStrings(): boolean {
  return release() >= "1.6";
}
