import { Exception, StandardError, rbFSend } from "@blazetrails/ruby-compat";
import type { RackApp, RackEnv, RackHeaders, RackResponse, RackBody } from "./index.js";
import { BodyProxy } from "./body-proxy.js";
import { Request } from "./request.js";
import { Raw } from "./response.js";

export const Abstract = {
  onStart(_req: Request, _res: BufferedResponse | null): void {},

  onCommit(_req: Request, _res: BufferedResponse): void {},

  onSend(_req: Request, _res: BufferedResponse): void {},

  onFinish(_req: Request, _res: BufferedResponse | undefined): void {},

  onError(_req: Request, _res: BufferedResponse | undefined, _e: unknown): void {},
};

export type EventHandler = typeof Abstract;

/** @internal */
export class EventedBodyProxy extends BodyProxy {
  readonly request: Request;
  readonly response: BufferedResponse;
  private handlers: EventHandler[];

  constructor(
    body: RackBody,
    request: Request,
    response: BufferedResponse,
    handlers: EventHandler[],
    block: () => void,
  ) {
    super(body, block);
    this.request = request;
    this.response = response;
    this.handlers = handlers;
  }

  override each(callback: (item: any) => void): void {
    [...this.handlers].reverse().forEach((handler) => handler.onSend(this.request, this.response));
    super.each(callback);
  }

  /** @noRailsEquivalent PERMANENT */
  override async *[Symbol.asyncIterator](): AsyncIterator<any> {
    [...this.handlers].reverse().forEach((handler) => handler.onSend(this.request, this.response));
    yield* { [Symbol.asyncIterator]: () => super[Symbol.asyncIterator]() };
  }
}

/** @internal */
export class BufferedResponse extends Raw {
  readonly body: RackBody;

  constructor(status: number, headers: Record<string, any>, body: RackBody) {
    super(status, headers);
    this.body = body;
  }

  toA(): RackResponse {
    return [this.status, this.headers, this.body];
  }
}

export class Events {
  private app: RackApp;
  private handlers: EventHandler[];

  constructor(app: RackApp, handlers: EventHandler[]) {
    this.app = app;
    this.handlers = handlers;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const request = this.makeRequest(env);
    this.onStart(request, null);

    let body: RackBody;
    let response: BufferedResponse | undefined;
    try {
      let status: number, headers: RackHeaders;
      [status, headers, body] = await (rbFSend(this.app, "call", request.env) as ReturnType<
        typeof this.app
      >);
      response = this.makeResponse(status, headers, body);
      this.onCommit(request, response);
    } catch (e) {
      if (e instanceof Exception && !(e instanceof StandardError)) throw e;
      this.onError(request, response, e);
      this.onFinish(request, response);
      throw e;
    }

    body = new EventedBodyProxy(body, request, response, this.handlers, () => {
      this.onFinish(request, response);
    }) as unknown as RackBody;
    return [response.status, response.headers, body];
  }

  /** @internal */
  private onError(request: Request, response: BufferedResponse | undefined, e: unknown): void {
    [...this.handlers].reverse().forEach((handler) => handler.onError(request, response, e));
  }

  /** @internal */
  private onCommit(request: Request, response: BufferedResponse): void {
    [...this.handlers].reverse().forEach((handler) => handler.onCommit(request, response));
  }

  /** @internal */
  private onStart(request: Request, _response: BufferedResponse | null): void {
    this.handlers.forEach((handler) => handler.onStart(request, null));
  }

  /** @internal */
  private onFinish(request: Request, response: BufferedResponse | undefined): void {
    [...this.handlers].reverse().forEach((handler) => handler.onFinish(request, response));
  }

  /** @internal */
  private makeRequest(env: RackEnv): Request {
    return new Request(env as Record<string, unknown>);
  }

  /** @internal */
  private makeResponse(status: number, headers: RackHeaders, body: RackBody): BufferedResponse {
    return new BufferedResponse(status, headers, body);
  }
}
