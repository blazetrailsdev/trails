/**
 * ActionController::Metal
 *
 * Minimal controller with Rack interface. Provides params, request,
 * response accessors and basic status/header management.
 */

import { AbstractController } from "../abstract-controller/base.js";
import { Request } from "../action-dispatch/http/request.js";
import { Response } from "../action-dispatch/http/response.js";
import { Parameters } from "./metal/strong-parameters.js";
import type { RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";
import { underscore } from "@blazetrails/activesupport";
import {
  MiddlewareStack as DispatchMiddlewareStack,
  type MiddlewareEntry,
} from "../action-dispatch/middleware/stack.js";
import { includeContent } from "./metal/head.js";

const STATUS_CODES: Record<string, number> = {
  ok: 200,
  created: 201,
  accepted: 202,
  no_content: 204,
  moved_permanently: 301,
  found: 302,
  see_other: 303,
  not_modified: 304,
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  not_acceptable: 406,
  conflict: 409,
  gone: 410,
  unprocessable_entity: 422,
  too_many_requests: 429,
  internal_server_error: 500,
  not_implemented: 501,
  bad_gateway: 502,
  service_unavailable: 503,
};

export class MiddlewareStack extends DispatchMiddlewareStack {}

export class Middleware {
  readonly klass: MiddlewareEntry["klass"];
  readonly args: unknown[];

  constructor(klass: MiddlewareEntry["klass"], args: unknown[] = []) {
    this.klass = klass;
    this.args = args;
  }
}

const _middlewareStacks = new WeakMap<object, MiddlewareStack>();

export class Metal extends AbstractController {
  request!: Request;
  response!: Response;
  params: Parameters = new Parameters({});

  static controllerPath(): string {
    return underscore(this.name.replace(/Controller$/, ""));
  }

  static controllerName(): string {
    const path = this.controllerPath();
    const lastSlash = path.lastIndexOf("/");
    return lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  }

  static makeResponseBang(request: Request): Response {
    const res = new Response();
    res.request = request;
    return res;
  }

  static actionEncodingTemplate(_action: string): false {
    return false;
  }

  static middleware(): MiddlewareStack {
    let stack = _middlewareStacks.get(this);
    if (!stack) {
      stack = new MiddlewareStack();
      _middlewareStacks.set(this, stack);
    }
    return stack;
  }

  static use(...args: unknown[]): void {
    this.middleware().use(args[0] as MiddlewareEntry["klass"], ...(args.slice(1) as any));
  }

  static action(
    this: typeof Metal,
    name: string,
  ): (env: Record<string, unknown>) => Promise<Response> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const Klass = this;
    const app = async (env: Record<string, unknown>) => {
      const req = new Request(env);
      const res = Klass.makeResponseBang(req);
      const controller = new Klass();
      return controller.dispatch(name, req, res);
    };

    return app;
  }

  static build(
    name: string,
    app?: (env: Record<string, unknown>) => Promise<Response>,
  ): (env: Record<string, unknown>) => Promise<Response> {
    return app ?? this.action(name);
  }

  controllerPath(): string {
    return (this.constructor as typeof Metal).controllerPath();
  }

  controllerName(): string {
    return (this.constructor as typeof Metal).controllerName();
  }

  inspect(): string {
    return `#<${this.constructor.name}>`;
  }

  urlFor(str: string): string {
    return str;
  }

  protected _status: number = 200;
  protected _headers: Record<string, string> = {};
  protected _contentType: string | null = null;

  /** Dispatch an action in the context of a request/response. */
  async dispatch(action: string, request: Request, response: Response): Promise<Response> {
    this.setRequestBang(request);
    this.setResponseBang(response);
    this.params =
      (request as any).parameters ??
      new Parameters({ ...request.params, ...request.pathParameters });

    await this.processAction(action);

    // Commit the response
    this.response.status = this._status;
    for (const [k, v] of Object.entries(this._headers)) {
      this.response.setHeader(k, v);
    }
    if (this._contentType) {
      this.response.setHeader("content-type", this._contentType);
    }
    // Commit on any explicit assignment — `_responseBody` is `null` only
    // when no render/head ran. An empty string from `head()` must still
    // clear any body the caller wrote earlier in the same request.
    const body = this._responseBody;
    if (body !== null) {
      this.response.body = typeof body === "string" ? body : body.toString();
    }

    return this.response;
  }

  setRequestBang(request: Request): void {
    this.request = request;
    (request as any).controllerInstance = this;
  }

  setResponseBang(response: Response): void {
    this.response = response;
  }

  resetSession(): void {
    if (this.request && typeof (this.request as any).resetSession === "function") {
      (this.request as any).resetSession();
    }
  }

  /** Set response status. Accepts number or symbol. */
  set status(value: number | string) {
    if (typeof value === "string") {
      const code = STATUS_CODES[value];
      if (!code) throw new Error(`Unknown status: ${value}`);
      this._status = code;
    } else {
      this._status = value;
    }
  }

  get status(): number {
    return this._status;
  }

  /** Set a response header. */
  setHeader(name: string, value: string): void {
    this._headers[name.toLowerCase()] = value;
  }

  /** Get a response header. */
  getHeader(name: string): string | undefined {
    return this._headers[name.toLowerCase()];
  }

  /** Set content type. */
  set contentType(value: string) {
    this._contentType = value;
  }

  get contentType(): string | null {
    return this._contentType;
  }

  /** Send a head-only response with given status. Mirrors Rails'
   * `ActionController::Head#head` (`actionpack/lib/action_controller/metal/head.rb`):
   * sets status, optional `location` / `content_type` / extra headers,
   * and assigns `response_body = ""` to mark `performed?` true. */
  head(status: number | string | null, options?: Record<string, unknown>): true {
    if (status !== null && typeof status === "object") {
      throw new Error(`${JSON.stringify(status)} is not a valid value for \`status\`.`);
    }
    const resolvedStatus = status ?? "ok";
    let location: unknown;
    let contentType: unknown;
    if (options) {
      location = options.location;
      contentType = options.content_type;
      for (const [key, value] of Object.entries(options)) {
        if (key === "location" || key === "content_type") continue;
        // Rails capitalizes each `-`/`_`-separated segment (`cache_control`
        // → `Cache-Control`), but `setHeader` lowercases keys for storage,
        // so the case transformation has no observable effect — only the
        // underscore-to-hyphen normalization matters here.
        this.setHeader(key.replace(/_/g, "-"), String(value));
      }
    }
    if (typeof resolvedStatus === "string") {
      const code = STATUS_CODES[resolvedStatus];
      if (!code) throw new Error(`Unknown status: ${resolvedStatus}`);
      this._status = code;
    } else {
      this._status = resolvedStatus;
    }
    if (location !== undefined && location !== null) {
      this.setHeader("location", this.urlFor(String(location)));
    }
    if (includeContent(this._status)) {
      if (!this._contentType) {
        this._contentType = contentType ? String(contentType) : "text/html";
      }
    }
    // Route through the public setter so the response stream is updated
    // in lock-step (mirrors Rails' `self.response_body = ""` in head.rb).
    this.responseBody = "";
    return true;
  }

  /** Set the response body directly. */
  set body(value: string) {
    this._responseBody = value;
  }

  get body(): string {
    const body = this._responseBody;
    return typeof body === "string" ? body : (body?.toString() ?? "");
  }

  /**
   * Public Rails-style setter that writes through to the underlying
   * response. Mirrors `ActionController::Metal#response_body=`. After
   * assignment, `isPerformed()` returns true.
   */
  override set responseBody(body: string | string[] | Buffer | null | undefined) {
    if (body === null || body === undefined) {
      // Mirror Rails' `else: response.reset_body!`. We assign the empty
      // string (rather than leaving the prior body in place) so the
      // visible `responseBody`/`body` getters reflect the reset; the
      // non-null value still keeps `performed?` true, matching Rails'
      // semantic where assigning falsy body still records the call.
      this._responseBody = "";
      if (this.response) this.response.body = "";
      return;
    }
    const str = Array.isArray(body)
      ? body.join("")
      : Buffer.isBuffer(body)
        ? body.toString()
        : body;
    this._responseBody = str;
    if (this.response) this.response.body = str;
  }

  override get responseBody(): string {
    const body = this._responseBody;
    return typeof body === "string" ? body : (body?.toString() ?? "");
  }

  /**
   * Tests if render or redirect has already happened. Mirrors
   * `ActionController::Metal#performed?` which returns
   * `response_body || response.committed?`.
   */
  isPerformed(): boolean {
    return this.performed || (this.response?.committed ?? false);
  }

  /** Convert controller to a Rack-compatible response. */
  toRackResponse(): RackResponse {
    const headers = { ...this._headers };
    if (this._contentType) {
      headers["content-type"] = this._contentType;
    }
    return [this._status, headers, bodyFromString(this.body)];
  }

  /** Resolve a status symbol to a number. */
  static resolveStatus(status: number | string): number {
    if (typeof status === "number") return status;
    return STATUS_CODES[status] ?? 500;
  }
}
