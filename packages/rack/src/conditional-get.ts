import { REQUEST_METHOD, ETAG, CONTENT_TYPE, CONTENT_LENGTH } from "./constants.js";
import type { RackApp } from "./mock-request.js";

export class ConditionalGet {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    const method = env[REQUEST_METHOD];
    if (method !== "GET" && method !== "HEAD") {
      return this.app(env);
    }

    const response = await this.app(env);
    const [status, headers, body] = response;

    if (status === 200 && this.fresh(env, headers)) {
      response[0] = 304;
      delete headers[CONTENT_TYPE];
      delete headers[CONTENT_LENGTH];
      if (body && typeof body.close === "function") body.close();
      response[2] = [];
    }

    return response;
  }

  private fresh(env: Record<string, any>, headers: Record<string, string>): boolean {
    const noneMatch = env["HTTP_IF_NONE_MATCH"];
    if (noneMatch) {
      return headers[ETAG] === noneMatch;
    }

    const modifiedSince = env["HTTP_IF_MODIFIED_SINCE"];
    if (modifiedSince) {
      const parsed = this.toRfc2822(modifiedSince);
      if (parsed) {
        return this.modifiedSince(parsed, headers);
      }
    }

    return false;
  }

  private modifiedSince(modifiedSince: Date, headers: Record<string, string>): boolean {
    const lastModified = this.toRfc2822(headers["last-modified"]);
    return lastModified != null && modifiedSince >= lastModified;
  }

  private toRfc2822(since: string | undefined): Date | null {
    if (!since || since.length < 16) return null;
    try {
      const d = new Date(since);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
}
