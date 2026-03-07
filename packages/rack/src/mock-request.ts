import {
  REQUEST_METHOD, SERVER_NAME, SERVER_PORT, SERVER_PROTOCOL,
  QUERY_STRING, PATH_INFO, RACK_URL_SCHEME, HTTPS, SCRIPT_NAME,
  RACK_ERRORS, RACK_INPUT, GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS,
} from "./constants.js";
import { MockResponse } from "./mock-response.js";
import { buildNestedQuery, parseNestedQuery } from "./utils.js";

export class FatalWarning extends Error {
  constructor(message: string) { super(message); this.name = "FatalWarning"; }
}

class FatalWarner {
  puts(warning: string): void { throw new FatalWarning(warning); }
  write(warning: string): void { throw new FatalWarning(warning); }
  flush(): void {}
  string(): string { return ""; }
}

class StringIO {
  private _data: string;
  private _closed = false;
  constructor(data = "") { this._data = data; }
  read(): string { return this._data; }
  write(s: string): void { this._data += s; }
  string(): string { return this._data; }
  get size(): number { return Buffer.byteLength(this._data); }
  close(): void { this._closed = true; }
  get closed(): boolean { return this._closed; }
}

export type RackApp = (env: Record<string, any>) => [number, Record<string, string>, any] | Promise<[number, Record<string, string>, any]>;

export class MockRequest {
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
    const env = MockRequest.envFor(uri, { ...opts, method });
    const app = this.app;
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

  static envFor(uri = "", opts: Record<string, any> = {}): Record<string, any> {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(uri, "http://example.org");
    } catch {
      parsedUrl = new URL("http://example.org" + (uri.startsWith("/") ? uri : "/" + uri));
    }

    const env: Record<string, any> = {};
    const method = opts.method ? String(opts.method).toUpperCase() : GET;

    env[REQUEST_METHOD] = method;
    env[SERVER_NAME] = parsedUrl.hostname || "example.org";
    env[SERVER_PORT] = parsedUrl.port || "80";
    env[SERVER_PROTOCOL] = opts.http_version || "HTTP/1.1";
    env[QUERY_STRING] = parsedUrl.search ? parsedUrl.search.substring(1) : "";
    env[PATH_INFO] = parsedUrl.pathname || "/";
    env[RACK_URL_SCHEME] = parsedUrl.protocol.replace(":", "") || "http";
    env[HTTPS] = env[RACK_URL_SCHEME] === "https" ? "on" : "off";
    env[SCRIPT_NAME] = opts.script_name ?? "";

    if (opts.fatal) {
      env[RACK_ERRORS] = new FatalWarner();
    } else {
      env[RACK_ERRORS] = new StringIO();
    }

    if (opts.params) {
      let params = opts.params;
      if (method === GET) {
        if (typeof params === "string") params = parseNestedQuery(params);
        const existingParams = parseNestedQuery(env[QUERY_STRING]);
        Object.assign(params, existingParams);
        env[QUERY_STRING] = buildNestedQuery(params);
      } else if (!opts.input) {
        opts["CONTENT_TYPE"] = "application/x-www-form-urlencoded";
        if (typeof params === "object") {
          opts.input = buildNestedQuery(params);
        } else {
          opts.input = params;
        }
      }
    }

    let rackInput = opts.input;
    if (typeof rackInput === "string") {
      rackInput = new StringIO(rackInput);
    }
    if (rackInput) {
      env[RACK_INPUT] = rackInput;
      if (!env["CONTENT_TYPE"] && method !== GET) {
        env["CONTENT_TYPE"] = "application/x-www-form-urlencoded";
      }
      if (rackInput.size !== undefined) {
        env["CONTENT_LENGTH"] = env["CONTENT_LENGTH"] || String(rackInput.size);
      }
    }

    // Copy string keys from opts to env
    for (const [key, value] of Object.entries(opts)) {
      if (typeof key === "string" && key === key.toUpperCase() && key.length > 1) {
        env[key] = value;
      } else if (typeof key === "string" && key.startsWith("HTTP_")) {
        env[key] = value;
      }
    }

    return env;
  }
}
