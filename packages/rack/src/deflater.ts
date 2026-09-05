import { GzipWriter, getZlib, hasKey } from "@blazetrails/ruby-compat";
import { CONTENT_TYPE, CONTENT_LENGTH, STATUS_WITH_NO_ENTITY_BODY } from "./constants.js";

export interface DeflaterOptions {
  include?: string[];
  if?: (
    env: Record<string, any>,
    status: number,
    headers: Record<string, any>,
    body: any,
  ) => boolean;
  sync?: boolean | null;
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
  private sync: boolean | null;

  constructor(app: any, options: DeflaterOptions = {}) {
    this.app = app;
    this.include = options.include || null;
    this.condition = options.if || null;
    this.sync = options.sync !== undefined ? options.sync : true;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, any>, any]> {
    const [status, headers, body] = await this.app(env);

    if (!this.shouldDeflate(env, status, headers, body)) {
      return [status, headers, body];
    }

    const acceptEncoding = env["HTTP_ACCEPT_ENCODING"] || "";
    const encoding = this.preferredEncoding(acceptEncoding);

    if (!encoding) {
      return [status, headers, body];
    }

    if (encoding === "identity") {
      return [status, headers, body];
    }

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
    if (hasKey(STATUS_WITH_NO_ENTITY_BODY, status)) return false;
    const cc = headers["cache-control"] || "";
    if (/\bno-transform\b/.test(cc)) return false;
    const ce = headers["content-encoding"];
    if (ce && !/\bidentity\b/.test(ce)) return false;
    if (this.include) {
      if (!hasKey(headers, CONTENT_TYPE)) return false;
      const mediaType = (headers[CONTENT_TYPE] || "").split(";")[0].trim();
      if (!this.include.includes(mediaType)) return false;
    }
    if (this.condition && !this.condition.call(undefined, env, status, headers, body)) return false;
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
    if (encoding === "gzip") {
      const chunks: Uint8Array[] = [];
      const stream = new GzipStream(body, null, this.sync);
      await stream.each((data) => chunks.push(data));
      stream.close();
      return Buffer.concat(chunks).toString("binary");
    }

    const parts: string[] = [];
    if (Array.isArray(body)) {
      for (const chunk of body) parts.push(String(chunk));
    } else if (body && typeof body.each === "function") {
      body.each((chunk: string) => parts.push(String(chunk)));
    } else if (body && typeof body.forEach === "function") {
      body.forEach((chunk: string) => parts.push(String(chunk)));
    } else if (typeof body === "string") {
      parts.push(body);
    }

    if (body && typeof body.close === "function") {
      body.close();
    }

    const input = Buffer.from(parts.join(""));

    if (encoding === "deflate") {
      return Buffer.from(getZlib().deflate(input)).toString("binary");
    }
    return input.toString();
  }
}

export class GzipStream {
  static readonly BUFFER_LENGTH = 128 * 1_024;

  private body: any;
  private mtime: number | null;
  private sync: boolean | null;
  private writer!: (data: Uint8Array) => void;

  constructor(body: any, mtime: number | null, sync: boolean | null) {
    this.body = body;
    this.mtime = mtime;
    this.sync = sync;
  }

  async each(block: (data: Uint8Array) => void): Promise<void> {
    this.writer = block;
    const gzip = new GzipWriter(this);
    if (this.mtime) gzip.mtime = this.mtime;
    try {
      if (typeof this.body.read === "function") {
        let part: string | null;
        while ((part = this.body.read(GzipStream.BUFFER_LENGTH)) != null) {
          gzip.write(Buffer.from(String(part), "binary"));
          if (this.sync) gzip.flush();
        }
      } else {
        const eachPart: (visit: (part: string) => void) => void =
          typeof this.body.each === "function"
            ? (visit) => this.body.each(visit)
            : (visit) => this.body.forEach(visit);
        eachPart((part: string) => {
          if (part.length === 0) return;
          gzip.write(Buffer.from(String(part), "binary"));
          if (this.sync) gzip.flush();
        });
      }
    } finally {
      await gzip.finish();
    }
  }

  write(data: Uint8Array): void {
    this.writer.call(undefined, data);
  }

  close(): void {
    if (typeof this.body.close === "function") this.body.close();
  }
}
