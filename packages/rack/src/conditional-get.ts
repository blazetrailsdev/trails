import { Time } from "@blazetrails/date";
import { BodyProxy } from "./body-proxy.js";
import { REQUEST_METHOD, ETAG, CONTENT_TYPE, CONTENT_LENGTH } from "./constants.js";
import type { RackApp } from "./mock-request.js";

export class ConditionalGet {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string | string[]>, any]> {
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
      response[2] = new BodyProxy([], () => {
        if (body != null && typeof body.close === "function") body.close();
      });
    }

    return response;
  }

  private fresh(env: Record<string, any>, headers: Record<string, string | string[]>): boolean {
    const noneMatch = env["HTTP_IF_NONE_MATCH"];
    if (noneMatch) {
      return this.isEtagMatches(noneMatch, headers);
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

  private isEtagMatches(noneMatch: string, headers: Record<string, string | string[]>): boolean {
    return headers[ETAG] === noneMatch;
  }

  private modifiedSince(modifiedSince: Time, headers: Record<string, string | string[]>): boolean {
    const header = headers["last-modified"];
    const lastModified = this.toRfc2822(typeof header === "string" ? header : undefined);
    return lastModified != null && modifiedSince.compare(lastModified)! >= 0;
  }

  private toRfc2822(since: string | undefined): Time | null {
    if (since != null && since.length >= 16) {
      try {
        return Time.rfc2822(since);
      } catch {
        return null;
      }
    }
    return null;
  }
}
