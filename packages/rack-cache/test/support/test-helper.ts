import {
  env as ENV,
  Dir,
  File,
  FileUtils,
  Process,
  RuntimeError,
  StringIO,
  rbObjClone,
  rbObjRespondTo,
  warn,
} from "@blazetrails/ruby-compat";
import {
  MockRequest,
  MockResponse,
  Request,
  Response,
  type RackEnv,
  type RackResponse,
} from "@blazetrails/rack";
import { Context } from "../../lib/context.js";
import { Storage } from "../../lib/storage.js";
import type { Client } from "memjs";

let tempDirCount = 0;

export async function createTempDirectory(): Promise<string> {
  tempDirCount += 1;
  const path = File.join(Dir.tmpdir(), `rack-cache-${Process.pid}-${tempDirCount}`);
  await FileUtils.mkdirPAsync(path);
  return path;
}

export async function removeEntrySecure(path: string): Promise<void> {
  await FileUtils.rmRfAsync(path);
}

export const MEMCACHED: string = ENV["MEMCACHED"] || "localhost:11211";
export let dalli: Client | false | null = null;

export async function haveDalli(server: string = MEMCACHED): Promise<boolean> {
  if (dalli != null) return dalli !== false;
  try {
    const { Client } = await import("memjs");
    dalli = Client.create(server, { retries: 0 });
    await dalli.set("ping", "");
    return true;
  } catch {
    warn("dalli not working. related tests will be skipped.");
    if (dalli) dalli.quit();
    dalli = false;
    return false;
  }
}

export class FakeApp {
  private _status: number;
  private _headers: Record<string, string>;
  private _body: string[];
  private _bk: ((request: Request, response: Response) => void) | null | undefined;
  private _called = false;

  constructor(
    status = 200,
    headers: Record<string, string> = {},
    body: string[] = ["Hello World"],
    bk?: ((request: Request, response: Response) => void) | null,
  ) {
    this._status = status;
    this._headers = headers;
    this._body = body;
    this._bk = bk;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    this._called = true;
    const response = new Response(this._body, this._status, this._headers);
    const request = new Request(env);
    if (this._bk != null) this._bk(request, response);
    return response.finish() as RackResponse;
  }

  isCalled(): boolean {
    return this._called;
  }

  resetBang(): void {
    this._called = false;
  }
}

export let app: FakeApp | null = null;
export let cache: Context | null = null;
export let caches: Context[] = [];
export let response: MockResponse | null = null;
export let responses: MockResponse[] = [];
let _cacheTemplate: Context | null = null;
let _errors: StringIO | null = null;
let _cacheConfig: ((context: Context) => void) | null | undefined = null;
let _called = false;
let _request: MockRequest | null = null;
let _storage: Storage | null = null;
let _cachePrototype: Context | null | undefined = null;

export function setupCacheContext(): void {
  app = null;
  _cacheTemplate = null;
  cache = null;
  caches = [];
  _errors = new StringIO();
  _cacheConfig = null;
  _called = false;
  _request = null;
  response = null;
  responses = [];
  _storage = new Storage();
}

export function teardownCacheContext(): void {
  app = _cacheTemplate = cache = null;
  caches = null!;
  _called = false;
  _request = response = null;
  responses = null!;
  _cacheConfig = _cachePrototype = null;
}

export function respondWith(
  status = 200,
  headers: Record<string, string> = {},
  body: string[] = ["Hello World"],
  bk?: (request: Request, response: Response) => void,
): FakeApp {
  return (app = new FakeApp(status, headers, body, bk));
}

export function cacheConfig(block: (context: Context) => void): void {
  _cacheConfig = block;
}

export async function request(
  method: string,
  uri = "/",
  opts: Record<string, unknown> = {},
  block?: (cache: Context) => void,
): Promise<MockResponse> {
  opts = {
    "rack.run_once": true,
    "rack.multithread": false,
    "rack.errors": _errors,
    "rack-cache.storage": _storage,
    ...opts,
  };

  if (app == null) throw new RuntimeError("response not specified (use respond_with)");
  if (rbObjRespondTo(app, "resetBang")) app.resetBang();

  _cachePrototype ??= new Context(app, {}, _cacheConfig ?? undefined);
  cache = rbObjClone(_cachePrototype);
  caches.push(cache);
  _request = new MockRequest(cache as unknown as ConstructorParameters<typeof MockRequest>[0]);
  if (block !== undefined) block(cache);
  response = await _request.request(method.toUpperCase(), uri, opts);
  responses.push(response);
  return response;
}

export function get(
  stem: string,
  env: Record<string, unknown> = {},
  b?: (cache: Context) => void,
): Promise<MockResponse> {
  return request("get", stem, env, b);
}

export function head(
  stem: string,
  env: Record<string, unknown> = {},
  b?: (cache: Context) => void,
): Promise<MockResponse> {
  return request("head", stem, env, b);
}

export function post(
  uri?: string,
  opts?: Record<string, unknown>,
  b?: (cache: Context) => void,
): Promise<MockResponse> {
  return request("post", uri, opts, b);
}
