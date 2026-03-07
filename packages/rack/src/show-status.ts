import { CONTENT_TYPE, CONTENT_LENGTH, RACK_SHOWSTATUS_DETAIL } from "./constants.js";
import { HTTP_STATUS_CODES, escapeHtml } from "./utils.js";
import type { RackApp } from "./mock-request.js";

export class ShowStatus {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    const response = await this.app(env);
    const [status, headers, body] = response;
    const detail = env[RACK_SHOWSTATUS_DETAIL];

    if (status >= 400) {
      const bodyEmpty = (Array.isArray(body) && body.join("").length === 0) ||
        (headers[CONTENT_LENGTH] === "0");
      if (bodyEmpty || detail) {
        // Close original body if it has a close method
        if (body && typeof body.close === "function") body.close();

        const detailStr = detail != null ? String(detail) : "";
        const message = HTTP_STATUS_CODES[status] || "Unknown";
        const html = `<!DOCTYPE html><html><head><title>${status} ${escapeHtml(message)}</title></head><body><h1>${status} ${escapeHtml(message)}</h1><p>${escapeHtml(detailStr)}</p></body></html>`;
        headers[CONTENT_TYPE] = "text/html";
        headers[CONTENT_LENGTH] = String(Buffer.byteLength(html));
        response[2] = [html];
      }
    }

    return response;
  }
}
