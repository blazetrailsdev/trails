import { REQUEST_METHOD, SCRIPT_NAME, PATH_INFO, QUERY_STRING, SERVER_PROTOCOL, CONTENT_LENGTH } from "./constants.js";
import type { RackApp } from "./mock-request.js";
import { forwardedValues } from "./utils.js";

function clockTime(): number {
  return performance.now() / 1000;
}

function escapeNonPrintable(str: string): string {
  return str.replace(/[\x00-\x1f]/g, (ch) => {
    return "\\x" + ch.charCodeAt(0).toString(16).padStart(1, "0");
  });
}

export class CommonLogger {
  private app: RackApp;
  private logger: any;

  constructor(app: RackApp, logger?: any) {
    this.app = app;
    this.logger = logger || null;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    const began = clockTime();
    const response = await this.app(env);
    const [status, headers, body] = response;
    const logger = this.logger || env["rack.errors"];
    const now = clockTime();
    this.log(env, status, headers, now - began, logger);
    return response;
  }

  private log(env: Record<string, any>, status: number, headers: Record<string, string>, elapsed: number, logger: any): void {
    // Determine client IP
    let addr: string;
    if (env["HTTP_X_FORWARDED_FOR"]) {
      addr = env["HTTP_X_FORWARDED_FOR"].split(",")[0].trim();
    } else if (env["HTTP_FORWARDED"]) {
      const forwarded = forwardedValues(env["HTTP_FORWARDED"]);
      addr = forwarded?.for?.[0] || "-";
    } else {
      addr = env["REMOTE_ADDR"] || "-";
    }

    const user = env["REMOTE_USER"] || "-";
    const method = env[REQUEST_METHOD];
    const path = (env[SCRIPT_NAME] || "") + (env[PATH_INFO] || "");
    const qs = env[QUERY_STRING] && env[QUERY_STRING].length > 0 ? `?${env[QUERY_STRING]}` : "";
    const protocol = env[SERVER_PROTOCOL];
    const cl = headers[CONTENT_LENGTH];
    const length = cl && cl !== "0" ? cl : "-";
    const time = elapsed.toFixed(4);

    const now = new Date();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const pad = (n: number) => String(n).padStart(2, "0");
    const tz = now.getTimezoneOffset();
    const tzSign = tz <= 0 ? "+" : "-";
    const tzH = pad(Math.floor(Math.abs(tz) / 60));
    const tzM = pad(Math.abs(tz) % 60);
    const timestamp = `${pad(now.getDate())}/${months[now.getMonth()]}/${now.getFullYear()}:${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${tzSign}${tzH}${tzM}`;

    const msg = escapeNonPrintable(`${addr} - ${user} [${timestamp}] "${method} ${path}${qs} ${protocol}" ${status} ${length} ${time}`) + "\n";

    if (logger && typeof logger.write === "function") {
      logger.write(msg);
    } else if (logger && typeof logger.info === "function") {
      logger.info(msg.trimEnd());
    }
  }
}
