import { SERVER_PROTOCOL, CONTENT_LENGTH, RACK_ERRORS } from "./constants.js";
import { Process, sprintf, rbFSend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Time } from "@blazetrails/date";
import type { RackApp } from "./mock-request.js";
import { Request } from "./request.js";
import { BodyProxy } from "./body-proxy.js";

function clockTime(): number {
  return Process.clockGettime(Process.CLOCK_MONOTONIC);
}

export class CommonLogger {
  static readonly FORMAT = `%s - %s [%s] "%s %s%s%s %s" %d %s %0.4f `;

  private app: RackApp;
  private logger: any;

  constructor(app: RackApp, logger?: any) {
    this.app = app;
    this.logger = logger || null;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string | string[]>, any]> {
    const beganAt = clockTime();
    const response = await (rbFSend(this.app, "call", env) as ReturnType<typeof this.app>);
    const [status, headers, body] = response;

    response[2] = new BodyProxy(body, () => {
      this.log(env, status, headers, beganAt);
    });
    return response;
  }

  /** @missingRailsArgs sprintf — PERMANENT */
  private log(
    env: Record<string, any>,
    status: number,
    responseHeaders: Record<string, string | string[]>,
    beganAt: number,
  ): void {
    const request = new Request(env);
    const length = this.extractContentLength(responseHeaders);

    let msg = sprintf(
      CommonLogger.FORMAT,
      request.ip || "-",
      request.getHeader("REMOTE_USER") || "-",
      Time.now().strftime("%d/%b/%Y:%H:%M:%S %z"),
      request.requestMethod,
      request.scriptName,
      request.pathInfo,
      request.queryString.length === 0 ? "" : `?${request.queryString}`,
      request.getHeader(SERVER_PROTOCOL),
      String(status).slice(0, 4),
      length,
      clockTime() - beganAt,
    );

    msg = msg.replace(/[\p{Cc}\p{Cn}\p{Cs}\p{Zl}\p{Zp}]/gu, (c) =>
      sprintf("\\x%x", c.codePointAt(0)),
    );
    msg = msg.slice(0, -1) + "\n";

    const logger = this.logger || request.getHeader(RACK_ERRORS);

    if (rbObjRespondTo(logger, "write")) {
      logger.write(msg);
    } else {
      logger.append(msg);
    }
  }

  private extractContentLength(headers: Record<string, string | string[]>): string {
    const value = headers[CONTENT_LENGTH];
    return !value || value === "0" ? "-" : String(value);
  }
}
