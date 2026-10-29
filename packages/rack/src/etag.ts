import type { RackHeaders } from "./index.js";
import { ETAG, CACHE_CONTROL } from "./constants.js";
import { Digest, rbProcCall } from "@blazetrails/ruby-compat";
import type { RackApp } from "./mock-request.js";

const DEFAULT_CACHE_CONTROL = "max-age=0, private, must-revalidate";

export class ETag {
  private app: RackApp | { call: RackApp };
  private noCacheControl: string | null;
  private cacheControl: string | null;

  constructor(
    app: RackApp | { call: RackApp },
    noCacheControl?: string | null,
    cacheControl?: string | null,
  ) {
    this.app = app;
    this.noCacheControl = noCacheControl ?? null;
    this.cacheControl = arguments.length < 3 ? DEFAULT_CACHE_CONTROL : (cacheControl ?? null);
  }

  async call(env: Record<string, any>): Promise<[number, RackHeaders, any]> {
    const response = await (rbProcCall(this.app, env) as ReturnType<RackApp>);
    const [status, headers, body] = response;

    let digest: string | null = null;

    if (this.etagStatus(status) && Array.isArray(body) && !this.skipCaching(headers)) {
      digest = this.digestBody(body);
      if (digest) {
        headers[ETAG] = `W/"${digest}"`;
        response[2] = body;
      }
    }

    if (!headers[CACHE_CONTROL]) {
      if (digest) {
        if (this.cacheControl) headers[CACHE_CONTROL] = this.cacheControl;
      } else {
        if (this.noCacheControl) headers[CACHE_CONTROL] = this.noCacheControl;
      }
    }

    return response;
  }

  /** @internal */
  private etagStatus(status: number): boolean {
    return status === 200 || status === 201;
  }

  /** @internal */
  private skipCaching(headers: RackHeaders): boolean {
    return ETAG in headers || "last-modified" in headers;
  }

  /** @internal */
  private digestBody(body: string[]): string | null {
    const sha = Digest.SHA256.new();
    let hasContent = false;
    for (const part of body) {
      if (part.length > 0) {
        sha.update(part);
        hasContent = true;
      }
    }
    return hasContent ? sha.hexdigest().substring(0, 32) : null;
  }
}
