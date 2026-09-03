import type { RackApp, RackEnv, RackResponse, RackBody } from "./index.js";
import { Request } from "./request.js";

export interface EventHandler {
  onStart?(req: Request, res: EventResponse): void;
  onCommit?(req: Request, res: EventResponse): void;
  onSend?(req: Request, res: EventResponse): void;
  onFinish?(req: Request, res: EventResponse): void;
  onError?(req: Request, res: EventResponse, error: Error): void;
}

export class EventResponse {
  status: number;
  headers: Record<string, string>;
  constructor(status: number, headers: Record<string, string>) {
    this.status = status;
    this.headers = headers;
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
    const req = new Request(env);
    const res = new EventResponse(0, {});

    for (const h of this.handlers) {
      h.onStart?.(req, res);
    }

    let response: RackResponse;
    try {
      response = await this.app(env);
    } catch (error) {
      for (const h of this.handlers) {
        h.onError?.(req, res, error as Error);
      }
      for (const h of [...this.handlers].reverse()) {
        h.onFinish?.(req, res);
      }
      throw error;
    }

    res.status = response[0];
    res.headers = response[1];

    for (const h of this.handlers) {
      h.onCommit?.(req, res);
    }

    const originalBody = response[2];
    const handlers = this.handlers;
    const wrappedBody = wrapBody(originalBody, handlers, req, res);

    return [response[0], response[1], wrappedBody];
  }

  /** @internal */
  private makeRequest(env: RackEnv): Request {
    return new Request(env as Record<string, unknown>);
  }

  /** @internal */
  private makeResponse(
    status: number,
    headers: Record<string, string>,
    _body: RackBody,
  ): EventResponse {
    return new EventResponse(status, headers);
  }
}

interface EventBody extends RackBody {
  close(): void;
}

function wrapBody(
  body: RackBody,
  handlers: EventHandler[],
  req: Request,
  res: EventResponse,
): EventBody {
  let sent = false;
  let finished = false;

  const iter: EventBody = {
    async *[Symbol.asyncIterator]() {
      for await (const chunk of body) {
        yield chunk;
      }
      if (!sent) {
        sent = true;
        for (const h of handlers) {
          h.onSend?.(req, res);
        }
      }
    },
    close() {
      if (!finished) {
        finished = true;
        for (const h of [...handlers].reverse()) {
          h.onFinish?.(req, res);
        }
      }
    },
  };

  return iter;
}
