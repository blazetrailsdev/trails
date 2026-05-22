import * as zlib from "zlib";
import { CONTENT_TYPE, CONTENT_LENGTH } from "./constants.js";

export interface DeflaterOptions {
  include?: string[];
  if?: (
    env: Record<string, any>,
    status: number,
    headers: Record<string, any>,
    body: any,
  ) => boolean;
  sync?: boolean;
}

export class Deflater {
  private app: any;
  private include: string[] | null;
  private condition:
    | ((
        env: Record<string, any>,
        status: number,
        headers: Record<string, any>,
        body: any,
      ) => boolean)
    | null;
  private sync: boolean;

  constructor(app: any, opts: DeflaterOptions = {}) {
    this.app = app;
    this.include = opts.include || null;
    this.condition = opts.if || null;
    this.sync = opts.sync !== false;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, any>, any]> {
    const [status, headers, body] = await this.app(env);

    if (!this.shouldDeflate(env, status, headers, body)) {
      return [status, headers, body];
    }

    const acceptEncoding = env["HTTP_ACCEPT_ENCODING"] || "";
    const encoding = this.preferredEncoding(acceptEncoding);

    if (!encoding) {
      // No acceptable encoding - respond with 406? No, just pass through per Rack behavior
      return [status, headers, body];
    }

    if (encoding === "identity") {
      return [status, headers, body];
    }

    // Update Vary header
    const vary = headers["vary"];
    if (!vary || (!vary.includes("*") && !vary.toLowerCase().includes("accept-encoding"))) {
      headers["vary"] = vary ? vary + ", Accept-Encoding" : "Accept-Encoding";
    }

    delete headers[CONTENT_LENGTH];
    headers["content-encoding"] = encoding;

    const compressed = await this.compress(body, encoding);
    headers[CONTENT_LENGTH] = String(Buffer.byteLength(compressed));

    return [status, headers, [compressed]];
  }

  private shouldDeflate(
    env: Record<string, any>,
    status: number,
    headers: Record<string, any>,
    body: any,
  ): boolean {
    if ((status >= 100 && status < 200) || status === 204 || status === 304) return false;
    const cc = headers["cache-control"] || "";
    if (/\bno-transform\b/.test(cc)) return false;
    const ce = headers["content-encoding"];
    if (ce && !/\bidentity\b/.test(ce)) return false;
    if (this.include) {
      if (!Object.prototype.hasOwnProperty.call(headers, CONTENT_TYPE)) return false;
      const mediaType = (headers[CONTENT_TYPE] || "").split(";")[0].trim();
      if (!this.include.includes(mediaType)) return false;
    }
    if (this.condition && !this.condition(env, status, headers, body)) return false;
    if (headers[CONTENT_LENGTH] === "0") return false;
    return true;
  }

  private preferredEncoding(accept: string): string | null {
    const encodings = accept.split(",").map((s) => s.trim().split(";")[0].trim().toLowerCase());
    if (encodings.includes("gzip") || encodings.includes("x-gzip")) return "gzip";
    if (encodings.includes("deflate")) return "deflate";
    if (encodings.includes("identity") || encodings.includes("*")) return "identity";
    if (encodings.length === 0 || (encodings.length === 1 && encodings[0] === ""))
      return "identity";
    return null;
  }

  private async compress(body: any, encoding: string): Promise<string> {
    const chunks: string[] = [];
    if (Array.isArray(body)) {
      for (const chunk of body) chunks.push(String(chunk));
    } else if (body && typeof body.each === "function") {
      body.each((chunk: string) => chunks.push(String(chunk)));
    } else if (body && typeof body.forEach === "function") {
      body.forEach((chunk: string) => chunks.push(String(chunk)));
    } else if (typeof body === "string") {
      chunks.push(body);
    }

    if (body && typeof body.close === "function") {
      body.close();
    }

    const input = Buffer.from(chunks.join(""));

    return new Promise((resolve, reject) => {
      const cb = (err: Error | null, result: Buffer) => {
        if (err) reject(err);
        else resolve(result.toString("binary"));
      };

      if (encoding === "gzip") {
        zlib.gzip(input, cb);
      } else if (encoding === "deflate") {
        zlib.deflate(input, cb);
      } else {
        resolve(input.toString());
      }
    });
  }
}
