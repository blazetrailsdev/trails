import type { MimeType } from "../action-dispatch/http/mime-type.js";
import { AbstractController } from "../abstract-controller/base.js";
import { Request } from "../action-dispatch/http/request.js";
import { Response } from "../action-dispatch/http/response.js";
import type { Session } from "../action-dispatch/request/session.js";
import { Parameters } from "./metal/strong-parameters.js";
import type { RackResponse, Response as RackResponseObject } from "@blazetrails/rack";
import {
  classAttribute,
  demodulize,
  initializeIncludedModules,
  isAnonymous,
  SafeBuffer,
  underscore,
} from "@blazetrails/activesupport";
import { rbCheckArrayType, rbModSingletonP, rbObjRespondTo } from "@blazetrails/ruby-compat";
import {
  MiddlewareStack as AbstractMiddlewareStack,
  Middleware as AbstractMiddleware,
  type MiddlewareBlock,
  type MiddlewareFactory,
  type RackApp,
  type RackAppObject,
} from "../action-dispatch/middleware/stack.js";
import type { RackEnv } from "@blazetrails/rack";
import type { EncodingTemplate } from "../action-dispatch/http/param-builder.js";
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

function inherited(this: typeof Metal, subclass: typeof Metal): void {
  subclass.middlewareStack = this.middlewareStack.dup();
}

export class Metal extends AbstractController {
  static {
    this.abstractBang();
  }

  declare static middlewareStack: MiddlewareStack;
  declare static isMiddlewareStack: boolean;
  declare middlewareStack: MiddlewareStack;
  declare isMiddlewareStack: boolean;

  static {
    classAttribute.call(this, "middlewareStack", { default: new MiddlewareStack() });
    const reader = Object.getOwnPropertyDescriptor(this, "middlewareStack")!;
    Object.defineProperty(this, "middlewareStack", {
      ...reader,
      get(this: typeof Metal) {
        if (
          !Object.prototype.hasOwnProperty.call(this, "__class_attr_middlewareStack") &&
          !rbModSingletonP(this)
        ) {
          inherited.call(Object.getPrototypeOf(this), this);
        }
        return reader.get!.call(this);
      },
    });
  }

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
  set response(response: Response | RackResponse | RackResponseObject) {
    this.setResponseBang(response);

    this._responseBody = true;
  }

  get session(): Session {
    return this.request.session;
  }

  protected static _controllerName?: string | null;

  static controllerName(): string | null {
    if (Object.hasOwn(this, "_controllerName") && this._controllerName != null) {
      return this._controllerName;
    }
    return (this._controllerName = isAnonymous(this)
      ? null
      : underscore(demodulize(this.name).replace(/Controller$/, "")));
  }

  static makeResponseBang(request: Request): Response {
    const res = new Response();
    res.request = request;
    return res;
  }

  static actionEncodingTemplate(_action: unknown): EncodingTemplate | false | null {
    return false;
  }

  static middleware(): MiddlewareStack {
    return this.middlewareStack;
  }

  static use(...args: unknown[]): void {
    this.middlewareStack.use(args[0] as MiddlewareFactory, ...(args.slice(1) as any));
  }

  static action(this: typeof Metal, name: string): RackApp {
    const app: RackApp = async (env: RackEnv) => {
      const req = new Request(env);
      const res = this.makeResponseBang(req);
      const controller = new this();
      await controller.dispatch(name, req, res);
      return controller.toA();
    };

    if (this.middlewareStack.isAny()) {
      return this.middlewareStack.build(name, app);
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
    if (this.middlewareStack.isAny()) {
      return await this.middlewareStack.build(name, async () => {
        const controller = new this();
        await controller.dispatch(name, req, res);
        return controller.toA();
      })(req.env);
    } else {
      const controller = new this();
      await controller.dispatch(name, req, res);
      return controller.toA();
    }
  }

  controllerName(): string | null {
    return (this.constructor as typeof Metal).controllerName();
  }

  urlFor(string: unknown): string {
    return string as string;
  }

  async dispatch(name: string, request: Request, response: Response): Promise<RackResponse> {
    this.setRequestBang(request);
    this.setResponseBang(response);
    await this.process(name);
    request.commitFlash();
    return this.toA();
  }

  setRequestBang(request: Request): void {
    this.request = request;
    request.controllerInstance = this;
  }

  setResponseBang(response: Response | RackResponse | RackResponseObject): void {
    if (this._response) {
      const [, , body] = rbCheckArrayType(this._response) ?? [];
      if (rbObjRespondTo(body, "close")) (body as { close(): void }).close();
    }

    this._response = response as Response;
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

  get responseCode(): number {
    return this.status;
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

  set contentType(value: string | MimeType | undefined) {
    this.response.contentType = value;
  }

  get contentType(): string | null {
    return this.response.contentType ?? null;
  }

  get mediaType(): string | undefined {
    return this.response.mediaType;
  }

  override set responseBody(body: string | SafeBuffer | string[] | Buffer | null | undefined) {
    if (body === null || body === undefined) {
      this.response.resetBodyBang();
      return;
    }
    const str = Array.isArray(body)
      ? body.join("")
      : body instanceof SafeBuffer
        ? body.toString()
        : body;
    this._responseBody = str;
    if (this.response) this.response.body = str;
  }

  override get responseBody(): string | Buffer | true | null {
    return this._responseBody;
  }

  override get performed(): boolean {
    return this.responseBody != null || this.response.committed;
  }

  toA(): RackResponse {
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
