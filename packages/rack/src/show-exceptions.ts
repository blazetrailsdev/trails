import { File } from "@blazetrails/ruby-compat";
import { chomp } from "@blazetrails/ruby-compat";

import { CONTENT_TYPE, CONTENT_LENGTH, RACK_ERRORS } from "./constants.js";
import { Request } from "./request.js";
import { escapeHtml } from "./utils.js";
import type { RackApp } from "./mock-request.js";

export class Frame {
  private _filename: string | null = null;
  private _lineno: number | null = null;
  private _function: string | null = null;
  private _preContextLineno: number | null = null;
  private _preContext: string[] | null = null;
  private _contextLine: string | null = null;
  private _postContextLineno: number | null = null;
  private _postContext: string[] | null = null;

  get filename(): string | null {
    return this._filename;
  }
  setFilename(filename: string | null): void {
    this._filename = filename;
  }

  get lineno(): number | null {
    return this._lineno;
  }
  setLineno(lineno: number | null): void {
    this._lineno = lineno;
  }

  get function(): string | null {
    return this._function;
  }
  setFunction(func: string | null): void {
    this._function = func;
  }

  get preContextLineno(): number | null {
    return this._preContextLineno;
  }
  setPreContextLineno(preContextLineno: number | null): void {
    this._preContextLineno = preContextLineno;
  }

  get preContext(): string[] | null {
    return this._preContext;
  }
  setPreContext(preContext: string[] | null): void {
    this._preContext = preContext;
  }

  get contextLine(): string | null {
    return this._contextLine;
  }
  setContextLine(contextLine: string | null): void {
    this._contextLine = contextLine;
  }

  get postContextLineno(): number | null {
    return this._postContextLineno;
  }
  setPostContextLineno(postContextLineno: number | null): void {
    this._postContextLineno = postContextLineno;
  }

  get postContext(): string[] | null {
    return this._postContext;
  }
  setPostContext(postContext: string[] | null): void {
    this._postContext = postContext;
  }
}

export class ShowExceptions {
  static readonly CONTEXT = 7;

  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  prefersPlaintext(env: Record<string, any>): boolean {
    return !this.acceptsHtml(env);
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    try {
      return await this.app(env);
    } catch (e: any) {
      const exceptionString = this.dumpException(e);

      env[RACK_ERRORS].puts(exceptionString);
      env[RACK_ERRORS].flush();

      let contentType: string;
      let body: string;
      if (this.acceptsHtml(env)) {
        contentType = "text/html";
        body = this.pretty(env, e);
      } else {
        contentType = "text/plain";
        body = exceptionString;
      }

      return [
        500,
        { [CONTENT_TYPE]: contentType, [CONTENT_LENGTH]: String(Buffer.byteLength(body)) },
        [body],
      ];
    }
  }

  dumpException(exception: Error): string {
    const message = (exception as any).detailedMessage
      ? (exception as any).detailedMessage()
      : exception.message || "";
    const name = exception.constructor?.name || (exception as any).name || "Error";
    const backtrace = this.backtrace(exception)
      .map((l) => `\t${l}`)
      .join("\n");
    return `${name}: ${message}\n${backtrace}`;
  }

  pretty(env: Record<string, any>, exception: Error): string {
    const req = new Request(env);

    const path = (req.scriptName + req.pathInfo).replace(/\/+/g, "/");

    const frames = this.backtrace(exception)
      .map((line) => {
        const frame = new Frame();
        const m = /(.*?):(\d+)(:in `(.*)')?/.exec(line);
        if (m) {
          frame.setFilename(m[1]);
          frame.setLineno(parseInt(m[2], 10));
          frame.setFunction(m[4] ?? null);

          try {
            const lineno = frame.lineno! - 1;
            const lines = File.readlines(frame.filename!);
            frame.setPreContextLineno(Math.max(lineno - ShowExceptions.CONTEXT, 0));
            frame.setPreContext(lines.slice(frame.preContextLineno!, lineno));
            frame.setContextLine(chomp(lines[lineno]));
            frame.setPostContextLineno(Math.min(lineno + ShowExceptions.CONTEXT, lines.length));
            frame.setPostContext(lines.slice(lineno + 1, frame.postContextLineno! + 1));
          } catch {
            /** @empty */
          }

          return frame;
        } else {
          return null;
        }
      })
      .filter((frame): frame is Frame => frame !== null);

    return this.template(env, exception, path, frames);
  }

  private backtrace(exception: Error): string[] {
    if (!exception.stack) return [];
    return exception.stack
      .split("\n")
      .slice(1)
      .map((line) => {
        const m = /^\s*at (?:(.*?) \()?(.*?):(\d+):\d+\)?$/.exec(line);
        return m ? `${m[2]}:${m[3]}${m[1] ? `:in \`${m[1]}'` : ""}` : line.trim();
      });
  }

  protected template(
    env: Record<string, any>,
    exception: Error,
    path?: string,
    frames?: Frame[],
  ): string {
    const name = exception.constructor?.name || (exception as any).name || "Error";
    const message = (exception as any).detailedMessage
      ? (exception as any).detailedMessage()
      : exception.message || "";
    const stack = frames ? this.formatFrames(frames) : this.formatBacktrace(exception);
    const getData = this.formatGetData(env);
    const postData = this.formatPostData(env);

    return (
      `<!DOCTYPE html><html><head><title>${this.h(name)} at ${this.h(path ?? env["PATH_INFO"] ?? "/")}</title></head>` +
      `<body><h1>${this.h(name)}: ${this.h(message)}</h1>` +
      `<p>You're seeing this error because you use <code>Rack::ShowExceptions</code>.</p>` +
      `<h3>Backtrace</h3><pre>${stack}</pre>` +
      `<h3>GET Data</h3><p>${getData}</p>` +
      `<h3>POST Data</h3><p>${postData}</p>` +
      `</body></html>`
    );
  }

  h(obj: any): string {
    const str = typeof obj === "string" ? obj : String(obj);
    return escapeHtml(str);
  }

  /** @internal */
  private acceptsHtml(env: Record<string, any>): boolean {
    const accept = env["HTTP_ACCEPT"] || "";
    return accept.includes("text/html") || accept.includes("*/*");
  }

  private renderPlaintext(
    e: Error,
    name: string,
    message: string,
    _env: Record<string, any>,
  ): string {
    const stack = e.stack || "unknown location";
    return `${name}: ${message}\n\n${stack}`;
  }

  private formatBacktrace(e: Error): string {
    const stack = e.stack;
    if (!stack) return "unknown location";
    const lines = stack.split("\n").filter((line) => {
      return (
        line.includes(":") && (line.includes("/") || line.includes("\\") || line.includes("at "))
      );
    });
    if (lines.length === 0) return "unknown location";
    return escapeHtml(lines.join("\n"));
  }

  private formatFrames(frames: Frame[]): string {
    if (frames.length === 0) return "unknown location";
    return escapeHtml(
      frames
        .map(
          (frame) =>
            `${frame.filename}:${frame.lineno}${frame.function ? `:in \`${frame.function}'` : ""}`,
        )
        .join("\n"),
    );
  }

  private formatGetData(env: Record<string, any>): string {
    const qs = env["QUERY_STRING"];
    if (!qs || qs === "") return "No GET data";
    return escapeHtml(qs);
  }

  private formatPostData(env: Record<string, any>): string {
    const input = env["rack.input"];
    if (!input) return "No POST data";
    try {
      const body = typeof input.read === "function" ? input.read() : String(input);
      if (!body || body === "") return "No POST data";
      return escapeHtml(body);
    } catch {
      return "Invalid POST data";
    }
  }
}
