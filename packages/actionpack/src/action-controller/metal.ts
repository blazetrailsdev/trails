import { AbstractController } from "../abstract-controller/base.js";
import { Request } from "../action-dispatch/http/request.js";
import { Response } from "../action-dispatch/http/response.js";
import type { Session } from "../action-dispatch/request/session.js";
import { Parameters } from "./metal/strong-parameters.js";
import type { RackResponse } from "@blazetrails/rack";
import { initializeIncludedModules, SafeBuffer, underscore } from "@blazetrails/activesupport";
import { ArgumentError, rbInspect } from "@blazetrails/ruby-compat";
import {
  MiddlewareStack as AbstractMiddlewareStack,
  Middleware as AbstractMiddleware,
  type MiddlewareBlock,
  type MiddlewareFactory,
  type RackApp,
  type RackAppObject,
} from "../action-dispatch/middleware/stack.js";
import type { RackEnv } from "@blazetrails/rack";
import { includeContent } from "./metal/head.js";
import { Mime, MimeType } from "../action-dispatch/http/mime-type.js";
import {
  _normalizeOptions as _normalizeOptionsFn,
  _normalizeText as _normalizeTextFn,
  _processOptions as _processOptionsFn,
  _renderInPriorities as _renderInPrioritiesFn,
  _setHtmlContentType as _setHtmlContentTypeFn,
  _setRenderedContentType as _setRenderedContentTypeFn,
  _setVaryHeader as _setVaryHeaderFn,
} from "./metal/rendering.js";

export class MiddlewareStack extends AbstractMiddlewareStack {
  override build(app: RackApp | RackAppObject): RackApp;
  override build(action: string, app?: RackApp | RackAppObject): RackApp;
  override build(action: string | RackApp | RackAppObject, app?: RackApp | RackAppObject): RackApp {
    action = String(action);

    let current: RackApp =
      typeof app === "function" ? app : (env: RackEnv) => (app as RackAppObject).call(env);
    const middlewares = this.middlewares as Middleware[];
    for (let i = middlewares.length - 1; i >= 0; i--) {
      const middleware = middlewares[i];
      current = middleware.valid(action) ? middleware.build(current) : current;
    }
    return current;
  }

  /** @internal */
  override buildMiddleware(
    klass: MiddlewareFactory,
    args: unknown[],
    block?: MiddlewareBlock,
  ): Middleware {
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

    let strategy: Strategy = NULL;
    let list: string[] | null = null;
    if (only.length > 0) {
      strategy = INCLUDE;
      list = only;
    } else if (except.length > 0) {
      strategy = EXCLUDE;
      list = except;
    }
    return new Middleware(klass, next, list, strategy, block);
  }
}

export class Middleware extends AbstractMiddleware {
  private actions: string[] | null;
  private strategy: Strategy;

  constructor(
    klass: MiddlewareFactory,
    args: unknown[],
    actions: string[] | null,
    strategy: Strategy,
    block?: MiddlewareBlock,
  ) {
    super(klass, args, block);
    this.actions = actions;
    this.strategy = strategy;
  }

  valid(action: string): boolean {
    return this.strategy(this.actions, action);
  }
}

type Strategy = (list: string[] | null, action: string) => boolean;

const INCLUDE: Strategy = (list, action) => (list ?? []).includes(action);
const EXCLUDE: Strategy = (list, action) => !(list ?? []).includes(action);
const NULL: Strategy = () => true;

const _middlewareStacks = new WeakMap<object, MiddlewareStack>();

export class Metal extends AbstractController {
  _request!: Request;
  _response!: Response;
  _params: Parameters | Record<string, unknown> | null = null;

  constructor() {
    super();
    initializeIncludedModules(this);
  }

  get params(): Parameters | Record<string, unknown> {
    return (this._params ??= this.request.parameters);
  }
  set params(value: Parameters | Record<string, unknown>) {
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
    this.middleware().use(args[0] as MiddlewareFactory, ...(args.slice(1) as any));
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

  set location(value: string) {
    this.response.location = value;
  }

  get location(): string | undefined {
    return this.response.location;
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
      throw new ArgumentError(`${rbInspect(status)} is not a valid value for \`status\`.`);
    }
    const resolvedStatus = status ?? "ok";
    let location: unknown;
    let contentType: unknown;
    if (options) {
      location = options.location;
      contentType = options.content_type;
      for (const [key, value] of Object.entries(options)) {
        if (key === "location" || key === "content_type") continue;
        this.headers.set(
          key
            .split(/[-_]/)
            .map((v) => v[0].toUpperCase() + v.slice(1))
            .join("-"),
          String(value),
        );
      }
    }
    this.status = resolvedStatus;
    if (location !== undefined && location !== null) {
      this.location = this.urlFor(String(location));
    }
    if (includeContent(this.status)) {
      if (!this.mediaType) {
        const f = (this as Metal & { formats?: ReadonlyArray<string | symbol> }).formats;
        const negotiated = f && f.length > 0 ? Mime.get(String(f[0]))?.toString() : undefined;
        this.contentType =
          contentType != null ? String(contentType) : (negotiated ?? MimeType.HTML.toString());
      }
      this.response.charset = false;
    }
    this.responseBody = "";
    return true;
  }

  override set responseBody(body: string | SafeBuffer | string[] | Buffer | null | undefined) {
    if (body === null || body === undefined) {
      this.response.resetBodyBang();
      return;
    }
    const str = Array.isArray(body)
      ? body.join("")
      : Buffer.isBuffer(body) || body instanceof SafeBuffer
        ? body.toString()
        : body;
    this._responseBody = str;
    if (this.response) this.response.body = str;
  }

  override get responseBody(): string | null {
    const body = this._responseBody;
    return typeof body === "string" ? body : (body?.toString() ?? null);
  }

  override get performed(): boolean {
    return super.performed || (this.response?.committed ?? false);
  }

  toRackResponse(): RackResponse {
    return this.response.toRack() as RackResponse;
  }

  /** @internal */
  static _normalizeOptions = _normalizeOptionsFn;
  /** @internal */
  static _normalizeText = _normalizeTextFn;
  /** @internal */
  static _processOptions = _processOptionsFn;
  /** @internal */
  static _renderInPriorities = _renderInPrioritiesFn;
  /** @internal */
  static _setHtmlContentType = _setHtmlContentTypeFn;
  /** @internal */
  static _setRenderedContentType = _setRenderedContentTypeFn;
  /** @internal */
  static _setVaryHeader = _setVaryHeaderFn;
}
