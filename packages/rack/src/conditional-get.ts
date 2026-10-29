import type { RackHeaders } from "./index.js";
import { rbProcCall } from "@blazetrails/ruby-compat";
import { Time } from "@blazetrails/date";
import { BodyProxy } from "./body-proxy.js";
import { REQUEST_METHOD, ETAG, CONTENT_TYPE, CONTENT_LENGTH } from "./constants.js";
import type { RackApp } from "./mock-request.js";

export class ConditionalGet {
  private app: RackApp | { call: RackApp };

  constructor(app: RackApp | { call: RackApp }) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, RackHeaders, any]> {
    const method = env[REQUEST_METHOD];
    if (method !== "GET" && method !== "HEAD") {
      return rbProcCall(this.app, env) as ReturnType<RackApp>;
    }

    const response = await (rbProcCall(this.app, env) as ReturnType<RackApp>);
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

  private fresh(env: Record<string, any>, headers: RackHeaders): boolean | undefined {
    const noneMatch = env["HTTP_IF_NONE_MATCH"];
    if (noneMatch) {
      return this.isEtagMatches(noneMatch, headers);
    }
    let modifiedSince: string | Time | null = env["HTTP_IF_MODIFIED_SINCE"];
    if (modifiedSince && (modifiedSince = this.toRfc2822(modifiedSince as string))) {
      return this.modifiedSince(modifiedSince, headers);
    }
  }

  private isEtagMatches(noneMatch: string, headers: RackHeaders): boolean {
    return headers[ETAG] === noneMatch;
  }

  private modifiedSince(modifiedSince: Time, headers: RackHeaders): boolean {
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
