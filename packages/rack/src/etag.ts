import { ETAG, CACHE_CONTROL } from "./constants.js";
import { createHash } from "crypto";
import type { RackApp } from "./mock-request.js";

const DEFAULT_CACHE_CONTROL = "max-age=0, private, must-revalidate";

export class ETag {
  private app: RackApp;
  private noCacheControl: string | null;
  private cacheControl: string | null;

  constructor(app: RackApp, noCacheControl?: string | null, cacheControl?: string | null) {
    this.app = app;
    this.noCacheControl = noCacheControl ?? null;
    this.cacheControl = arguments.length < 3 ? DEFAULT_CACHE_CONTROL : (cacheControl ?? null);
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    const response = await this.app(env);
    const [status, headers, body] = response;

    let digest: string | null = null;

    if ((status === 200 || status === 201) && Array.isArray(body) && !headers[ETAG] && !headers["last-modified"]) {
      const sha = createHash("sha256");
      let hasContent = false;
      for (const part of body) {
        if (part.length > 0) {
          sha.update(part);
          hasContent = true;
        }
      }
      if (hasContent) {
        digest = sha.digest("hex").substring(0, 32);
        headers[ETAG] = `W/"${digest}"`;
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
}
