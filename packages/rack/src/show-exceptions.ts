import { CONTENT_TYPE, CONTENT_LENGTH } from "./constants.js";
import { escapeHtml } from "./utils.js";
import type { RackApp } from "./mock-request.js";

export class ShowExceptions {
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
    const backtrace = exception.stack
      ? exception.stack
          .split("\n")
          .slice(1)
          .map((l) => `\t${l}`)
          .join("\n")
      : "";
    return `${name}: ${message}\n${backtrace}`;
  }

  pretty(env: Record<string, any>, exception: Error): string {
    return this.template(env, exception);
  }

  protected template(env: Record<string, any>, exception: Error): string {
    const name = exception.constructor?.name || (exception as any).name || "Error";
    const message = (exception as any).detailedMessage
      ? (exception as any).detailedMessage()
      : exception.message || "";
    const stack = this.formatBacktrace(exception);
    const getData = this.formatGetData(env);
    const postData = this.formatPostData(env);

    return (
      `<!DOCTYPE html><html><head><title>${this.h(name)} at ${this.h(env["PATH_INFO"] || "/")}</title></head>` +
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
      // Filter out lines that don't look like stack frames
      return (
        line.includes(":") && (line.includes("/") || line.includes("\\") || line.includes("at "))
      );
    });
    if (lines.length === 0) return "unknown location";
    return escapeHtml(lines.join("\n"));
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
