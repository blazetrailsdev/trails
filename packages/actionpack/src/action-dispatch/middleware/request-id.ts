import { SecureRandom, rbFSend } from "@blazetrails/ruby-compat";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { Request } from "../http/request.js";

type RackApp = (env: RackEnv) => Promise<RackResponse>;

export interface RequestIdOptions {
  header?: string;
}

export class RequestId {
  private app: RackApp;
  private header: string;
  private envHeader: string;

  constructor(app: RackApp, options: RequestIdOptions = {}) {
    this.app = app;
    this.header = options.header ?? "X-Request-Id";
    this.envHeader = `HTTP_${this.header.toUpperCase().replaceAll("-", "_")}`;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const req = new Request(env);
    req.requestId = this.makeRequestId(req.getHeader(this.envHeader) as string | undefined);
    const [status, headers, body] = await (rbFSend(this.app, "call", env) as ReturnType<
      typeof this.app
    >);
    headers[this.header.toLowerCase()] = req.requestId!;
    return [status, headers, body];
  }

  private makeRequestId(requestId: string | undefined): string {
    if (requestId != null && requestId !== "") {
      return requestId.replace(/[^\w\-@]/g, "").slice(0, 255);
    }
    return this.internalRequestId();
  }

  /** @internal */
  private internalRequestId(): string {
    return SecureRandom.uuid();
  }
}
