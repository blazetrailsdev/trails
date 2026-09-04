import { AbstractController } from "../abstract-controller/base.js";
import { Request } from "../action-dispatch/http/request.js";
import { Response } from "../action-dispatch/http/response.js";
import type { Session } from "../action-dispatch/request/session.js";
import { Parameters } from "./metal/strong-parameters.js";
import type { RackResponse } from "@blazetrails/rack";
import { underscore } from "@blazetrails/activesupport";
import {
  MiddlewareStack as AbstractMiddlewareStack,
  type MiddlewareEntry,
  type RackApp,
  type RackAppObject,
} from "../action-dispatch/middleware/stack.js";
import type { RackEnv } from "@blazetrails/rack";
import { includeContent } from "./metal/head.js";
import { MimeType } from "../action-dispatch/http/mime-type.js";
import { Renderers } from "./metal/renderers.js";
import { resolveStatus } from "./metal/status-codes.js";
import {
  _normalizeOptions as _normalizeOptionsFn,
  _normalizeText as _normalizeTextFn,
  _processOptions as _processOptionsFn,
  _processVariant as _processVariantFn,
  _renderInPriorities as _renderInPrioritiesFn,
  _setHtmlContentType as _setHtmlContentTypeFn,
  _setRenderedContentType as _setRenderedContentTypeFn,
  _setVaryHeader as _setVaryHeaderFn,
} from "./metal/rendering.js";

export class MiddlewareStack extends AbstractMiddlewareStack {
  /** @internal */
  buildMiddleware(
    klass: MiddlewareEntry["klass"],
    args: unknown[],
    block?: (app: RackApp) => RackApp,
  ): MiddlewareEntry {
    const middleware = Metal.buildMiddleware(klass, args);
    return { klass: middleware.klass, args: middleware.args, block, valid: middleware.valid };
  }

  build(action: string | RackApp | RackAppObject, app?: RackApp | RackAppObject): RackApp {
    if (typeof action !== "string") return super.build(action);
    let current: RackApp =
      typeof app === "function" ? app : (env: RackEnv) => (app as RackAppObject).call(env);
    const middlewares = this.middlewares;
    for (let i = middlewares.length - 1; i >= 0; i--) {
      const middleware = middlewares[i];
      if (middleware.valid && !middleware.valid(action)) continue;
      const mw = new middleware.klass(current, ...middleware.args);
      current = (env: RackEnv) => mw.call(env);
    }
    return current;
  }
}

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
  _request!: Request;
  _response!: Response;
  _params: Parameters = new Parameters({});

  get params(): Parameters {
    return this._params;
  }
  set params(value: Parameters) {
    this._params = value;
  }

  get request(): Request {
    return this._request;
  }
  set request(value: Request) {
    this._request = value;
  }

  get response(): Response {
    return this._response;
  }
  set response(value: Response) {
    this.setResponseBang(value);

    this.markPerformed();
  }

  get session(): Session {
    return this.request.session;
  }

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
      const superclass = Object.getPrototypeOf(this) as typeof Metal | null;
      stack =
        superclass && typeof superclass.middleware === "function"
          ? superclass.middleware().dup()
          : new MiddlewareStack();
      _middlewareStacks.set(this, stack);
    }
    return stack;
  }

  static use(...args: unknown[]): void {
    this.middleware().use(args[0] as MiddlewareEntry["klass"], ...(args.slice(1) as any));
  }

  static action(this: typeof Metal, name: string): RackApp {
    const app: RackApp = async (env: RackEnv) => {
      const req = new Request(env);
      const res = this.makeResponseBang(req);
      const controller = new this();
      await controller.dispatch(name, req, res);
      return controller.toRackResponse();
    };

    if (this.middleware().isAny()) {
      return this.middleware().build(name, app);
    } else {
      return app;
    }
  }

  static async dispatch(
    this: typeof Metal,
    name: string,
    req: Request,
    res: Response,
  ): Promise<RackResponse> {
    if (this.middleware().isAny()) {
      return await this.middleware().build(name, async () => {
        const controller = new this();
        await controller.dispatch(name, req, res);
        return controller.toRackResponse();
      })(req.env);
    } else {
      const controller = new this();
      await controller.dispatch(name, req, res);
      return controller.toRackResponse();
    }
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

  urlFor(string: string): string {
    return string;
  }

  async dispatch(name: string, request: Request, response: Response): Promise<RackResponse> {
    this.setRequestBang(request);
    this.setResponseBang(response);
    const reqParams = request.parameters;
    this.params = reqParams instanceof Parameters ? reqParams : new Parameters(reqParams);

    await this.process(name);

    request.commitFlash();

    return this.toRackResponse();
  }

  setRequestBang(request: Request): void {
    this.request = request;
    request.controllerInstance = this;
  }

  setResponseBang(response: Response): void {
    this._response = response;
  }

  resetSession(): void {
    if (this.request && typeof (this.request as any).resetSession === "function") {
      (this.request as any).resetSession();
    }
  }

  set status(value: number | string) {
    this.response.status = value;
  }

  get status(): number {
    return this.response.status;
  }

  get headers(): Response["headers"] {
    return this.response.headers;
  }

  setHeader(name: string, value: string): void {
    this.response.setHeader(name, value);
  }

  getHeader(name: string): string | undefined {
    return this.response.getHeader(name);
  }

  set contentType(value: string) {
    this.response.contentType = value;
  }

  get contentType(): string | null {
    return this.response.contentType ?? null;
  }

  get mediaType(): string | undefined {
    return this.response.mediaType;
  }

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
        this.setHeader(key.replace(/_/g, "-"), String(value));
      }
    }
    this.status = resolvedStatus;
    if (location !== undefined && location !== null) {
      this.setHeader("location", this.urlFor(String(location)));
    }
    if (includeContent(this.status)) {
      if (!this.mediaType) {
        const f = (this as Metal & { formats?: ReadonlyArray<string | symbol> }).formats;
        const negotiated =
          f && f.length > 0 && MimeType.isRegistered(String(f[0]))
            ? MimeType.lookup(String(f[0])).toString()
            : undefined;
        this.contentType =
          contentType != null ? String(contentType) : (negotiated ?? MimeType.HTML.toString());
      }
      this.response.charset = false;
    }
    this.responseBody = "";
    return true;
  }

  set body(value: string) {
    this.responseBody = value;
  }

  get body(): string {
    return this.responseBody;
  }

  override set responseBody(body: string | string[] | Buffer | null | undefined) {
    if (body === null || body === undefined) {
      this.response.resetBodyBang();
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

  isPerformed(): boolean {
    return this.performed || (this.response?.committed ?? false);
  }

  toRackResponse(): RackResponse {
    return this.response.toRack() as RackResponse;
  }

  static resolveStatus = resolveStatus;

  /** @internal */
  static buildMiddleware(
    klass: MiddlewareEntry["klass"],
    args: unknown[],
    _block?: unknown,
  ): Middleware & { valid(action: string): boolean } {
    const next = [...args];
    const last = next[next.length - 1];
    const options: Record<string, unknown> =
      last && typeof last === "object" && !Array.isArray(last)
        ? { ...(next.pop() as Record<string, unknown>) }
        : {};
    const only = ([] as string[]).concat((options.only as string | string[]) ?? []).map(String);
    const except = ([] as string[]).concat((options.except as string | string[]) ?? []).map(String);
    delete options.only;
    delete options.except;
    if (Object.keys(options).length > 0) next.push(options);

    let strategy: (list: string[] | null, action: string) => boolean = () => true;
    let list: string[] | null = null;
    if (only.length > 0) {
      strategy = (l, a) => (l ?? []).includes(a);
      list = only;
    } else if (except.length > 0) {
      strategy = (l, a) => !(l ?? []).includes(a);
      list = except;
    }
    const wrapped = new Middleware(klass, next) as Middleware & {
      valid(action: string): boolean;
    };
    wrapped.valid = (action: string) => strategy(list, action);
    return wrapped;
  }

  /** @internal */
  renderToBody(options: Record<string, unknown> = {}): unknown {
    const truthy = (v: unknown): boolean => v != null && v !== false;
    const renderer = Renderers._renderToBodyWithRenderer(options);
    if (truthy(renderer)) return renderer;
    const priority = _renderInPrioritiesFn(options);
    if (truthy(priority)) return priority;
    return " ";
  }

  /** @internal */
  static _normalizeOptions = _normalizeOptionsFn;
  /** @internal */
  static _normalizeText = _normalizeTextFn;
  /** @internal */
  static _processOptions = _processOptionsFn;
  /** @internal */
  static _processVariant = _processVariantFn;
  /** @internal */
  static _renderInPriorities = _renderInPrioritiesFn;
  /** @internal */
  static _setHtmlContentType = _setHtmlContentTypeFn;
  /** @internal */
  static _setRenderedContentType = _setRenderedContentTypeFn;
  /** @internal */
  static _setVaryHeader = _setVaryHeaderFn;
}
