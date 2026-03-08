/**
 * Rack::Logger
 *
 * Sets up rack.logger to write to rack.errors (or a provided stream).
 */

import type { RackApp, RackEnv, RackResponse } from "./index.js";

export interface LoggerStream {
  write(msg: string): void;
}

export class Logger {
  private app: RackApp;
  private level: string;

  constructor(app: RackApp, level: string = "INFO") {
    this.app = app;
    this.level = level;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const errors = env["rack.errors"] as LoggerStream | undefined;
    env["rack.logger"] = new RackLogger(errors);
    return this.app(env);
  }
}

const LEVELS = ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"] as const;

class RackLogger {
  private output: LoggerStream | undefined;

  constructor(output?: LoggerStream) {
    this.output = output;
  }

  debug(msg: string): void { this.log("DEBUG", msg); }
  info(msg: string): void { this.log("INFO", msg); }
  warn(msg: string): void { this.log("WARN", msg); }
  error(msg: string): void { this.log("ERROR", msg); }
  fatal(msg: string): void { this.log("FATAL", msg); }

  private log(level: string, msg: string): void {
    if (this.output) {
      this.output.write(`${level} -- : ${msg}\n`);
    }
  }
}
