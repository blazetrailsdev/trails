import {
  REQUEST_METHOD,
  SERVER_NAME,
  SERVER_PORT,
  SERVER_PROTOCOL,
  QUERY_STRING,
  PATH_INFO,
  RACK_URL_SCHEME,
  HTTPS,
  SCRIPT_NAME,
  RACK_ERRORS,
  RACK_INPUT,
  GET,
  POST,
  PUT,
  PATCH,
  DELETE,
  HEAD,
  OPTIONS,
} from "./constants.js";
import {
  type Generic,
  isSymbol,
  rbObjRespondTo,
  RFC2396Parser,
  StringIO,
} from "@blazetrails/ruby-compat";
import { Lint } from "./lint.js";
import { MockResponse } from "./mock-response.js";
import { buildMultipart, MULTIPART_BOUNDARY } from "./multipart.js";
import { buildNestedQuery, parseNestedQuery } from "./utils.js";
import type { RackResponse } from "./index.js";

export class FatalWarning extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalWarning";
  }
}

export class FatalWarner {
  puts(warning: string): void {
    throw new FatalWarning(warning);
  }
  write(warning: string): void {
    throw new FatalWarning(warning);
  }
  flush(): void {}
  string(): string {
    return "";
  }
}

export type RackApp = (
  env: Record<string, any>,
) => [number, RackResponse[1], any] | Promise<[number, RackResponse[1], any]>;

export class MockRequest {
  private static parser: RFC2396Parser | undefined;

  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async get(uri = "/", opts: Record<string, any> = {}): Promise<MockResponse> {
    return this.request(GET, uri, opts);
  }
  async post(uri = "/", opts: Record<string, any> = {}): Promise<MockResponse> {
    return this.request(POST, uri, opts);
  }
  async put(uri = "/", opts: Record<string, any> = {}): Promise<MockResponse> {
    return this.request(PUT, uri, opts);
  }
  async patch(uri = "/", opts: Record<string, any> = {}): Promise<MockResponse> {
    return this.request(PATCH, uri, opts);
  }
  async delete(uri = "/", opts: Record<string, any> = {}): Promise<MockResponse> {
    return this.request(DELETE, uri, opts);
  }
  async head(uri = "/", opts: Record<string, any> = {}): Promise<MockResponse> {
    return this.request(HEAD, uri, opts);
  }
  async options(uri = "/", opts: Record<string, any> = {}): Promise<MockResponse> {
    return this.request(OPTIONS, uri, opts);
  }

  async request(method = GET, uri = "", opts: Record<string, any> = {}): Promise<MockResponse> {
    const env = MockRequest.envFor(uri, { ...opts, ":method": method });

    let app: RackApp;
    if (opts[":lint"]) {
      const lint = new Lint(this.app);
      app = lint.call.bind(lint);
    } else {
      app = this.app;
    }

    const errors = env[RACK_ERRORS];
    let body: any;
    try {
      const result = await app(env);
      const [status, headers, b] = result;
      body = b;
      return new MockResponse(status, headers, body, errors);
    } finally {
      if (body && typeof body.close === "function") body.close();
    }
  }

  static parseUriRfc2396(uri: string): Generic {
    MockRequest.parser ??= new RFC2396Parser();
    return MockRequest.parser.parse(uri);
  }

  static envFor(uri = "", opts: Record<string, any> = {}): Record<string, any> {
    const parsedUri = MockRequest.parseUriRfc2396(uri);
    if (parsedUri.path![0] !== "/") parsedUri.path = `/${parsedUri.path}`;

    const env: Record<string, any> = {};

    env[REQUEST_METHOD] = opts[":method"] ? String(opts[":method"]).toUpperCase() : GET;
    env[SERVER_NAME] = parsedUri.host || "example.org";
    env[SERVER_PORT] = parsedUri.port != null ? String(parsedUri.port) : "80";
    env[SERVER_PROTOCOL] = opts[":http_version"] || "HTTP/1.1";
    env[QUERY_STRING] = String(parsedUri.query ?? "");
    env[PATH_INFO] = parsedUri.path;
    env[RACK_URL_SCHEME] = parsedUri.scheme || "http";
    env[HTTPS] = env[RACK_URL_SCHEME] === "https" ? "on" : "off";

    env[SCRIPT_NAME] = opts[":script_name"] || "";

    if (opts[":fatal"]) {
      env[RACK_ERRORS] = new FatalWarner();
    } else {
      env[RACK_ERRORS] = new StringIO();
    }

    let params = opts[":params"];
    if (params != null && params !== false) {
      if (env[REQUEST_METHOD] === GET) {
        if (typeof params === "string") params = parseNestedQuery(params);
        Object.assign(params, parseNestedQuery(env[QUERY_STRING]));
        env[QUERY_STRING] = buildNestedQuery(params);
      } else if (!(":input" in opts)) {
        opts["CONTENT_TYPE"] = "application/x-www-form-urlencoded";
        if (typeof params === "object") {
          const data = buildMultipart(params);
          if (typeof data === "string") {
            opts[":input"] = data;
            opts["CONTENT_LENGTH"] ??= String(data.length);
            opts["CONTENT_TYPE"] = `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`;
          } else {
            opts[":input"] = buildNestedQuery(params);
          }
        } else {
          opts[":input"] = params;
        }
      }
    }

    let rackInput = opts[":input"];
    if (typeof rackInput === "string") {
      rackInput = new StringIO(rackInput);
    }

    if (rackInput != null && rackInput !== false) {
      env[RACK_INPUT] = rackInput;

      if (rbObjRespondTo(env[RACK_INPUT], "size"))
        env["CONTENT_LENGTH"] ??= String(env[RACK_INPUT].size());
    }

    for (const [field, value] of Object.entries(opts)) {
      if (!isSymbol(field)) env[field] = value;
    }

    return env;
  }
}
