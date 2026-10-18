import { SERVER_PROTOCOL, CONTENT_LENGTH, RACK_ERRORS } from "./constants.js";
import { Process, sprintf, rbFSend } from "@blazetrails/ruby-compat";
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

    // boundary: Common Log Format timestamp (`[10/Oct/2000:13:55:36 -0700]`)
    const now = new Date();
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const pad = (n: number) => String(n).padStart(2, "0");
    const tz = now.getTimezoneOffset();
    const tzSign = tz <= 0 ? "+" : "-";
    const tzH = pad(Math.floor(Math.abs(tz) / 60));
    const tzM = pad(Math.abs(tz) % 60);
    const timestamp = `${pad(now.getDate())}/${months[now.getMonth()]}/${now.getFullYear()}:${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${tzSign}${tzH}${tzM}`;

    let msg = sprintf(
      CommonLogger.FORMAT,
      request.ip || "-",
      request.getHeader("REMOTE_USER") || "-",
      timestamp,
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

    if (logger && typeof logger.write === "function") {
      logger.write(msg);
    } else if (logger && typeof logger.info === "function") {
      logger.info(msg.trimEnd());
    }
  }

  private extractContentLength(headers: Record<string, string | string[]>): string {
    const value = headers[CONTENT_LENGTH];
    return !value || value === "0" ? "-" : String(value);
  }
}
