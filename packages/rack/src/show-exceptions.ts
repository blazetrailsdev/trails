import { CONTENT_TYPE, CONTENT_LENGTH } from "./constants.js";
import { escapeHtml } from "./utils.js";
import type { RackApp } from "./mock-request.js";

export class ShowExceptions {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  prefersPlaintext(env: Record<string, any>): boolean {
    const accept = env["HTTP_ACCEPT"] || "";
    if (accept.includes("text/html") || accept.includes("*/*")) return false;
    return true;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    try {
      return await this.app(env);
    } catch (e: any) {
      const message = (e.detailedMessage ? e.detailedMessage() : e.message) || "";
      const name = e.constructor?.name || e.name || "Error";

      if (this.prefersPlaintext(env)) {
        const body = this.renderPlaintext(e, name, message, env);
        return [
          500,
          { [CONTENT_TYPE]: "text/plain", [CONTENT_LENGTH]: String(Buffer.byteLength(body)) },
          [body],
        ];
      }

      const body = this.template(e, name, message, env);
      return [
        500,
        { [CONTENT_TYPE]: "text/html", [CONTENT_LENGTH]: String(Buffer.byteLength(body)) },
        [body],
      ];
    }
  }

  protected template(e: Error, name: string, message: string, env: Record<string, any>): string {
    const stack = this.formatBacktrace(e);
    const getData = this.formatGetData(env);
    const postData = this.formatPostData(env);
    const escapedMessage = escapeHtml(message);
    const escapedName = escapeHtml(name);

    return `<!DOCTYPE html><html><head><title>${escapedName}: ${escapedMessage}</title></head>` +
      `<body><h1>${escapedName}: ${escapedMessage}</h1>` +
      `<h2>Rack::ShowExceptions</h2>` +
      `<h3>Backtrace</h3><pre>${stack}</pre>` +
      `<h3>GET Data</h3><p>${getData}</p>` +
      `<h3>POST Data</h3><p>${postData}</p>` +
      `</body></html>`;
  }

  private renderPlaintext(e: Error, name: string, message: string, env: Record<string, any>): string {
    const stack = e.stack || "unknown location";
    return `${name}: ${message}\n\n${stack}`;
  }

  private formatBacktrace(e: Error): string {
    const stack = e.stack;
    if (!stack) return "unknown location";
    const lines = stack.split("\n").filter(line => {
      // Filter out lines that don't look like stack frames
      return line.includes(":") && (line.includes("/") || line.includes("\\") || line.includes("at "));
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
