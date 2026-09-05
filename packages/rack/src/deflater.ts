import { GzipWriter, hasKey } from "@blazetrails/ruby-compat";
import { Time } from "@blazetrails/date";
import { BodyProxy } from "./body-proxy.js";
import { Request } from "./request.js";
import * as Utils from "./utils.js";
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
    const response = (await this.app(env)) as [number, Record<string, any>, any];
    const [status, headers, body] = response;

    if (!this.shouldDeflate(env, status, headers, body)) {
      return response;
    }

    const request = new Request(env);

    const encoding = Utils.selectBestEncoding(["gzip", "identity"], request.acceptEncoding);

    const vary = String(headers["vary"] ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v !== "");
    if (!vary.includes("*") && !vary.some((v) => v.toLowerCase() === "accept-encoding")) {
      vary.push("Accept-Encoding");
      headers["vary"] = vary.join(",");
    }

    switch (encoding) {
      case "gzip": {
        headers["content-encoding"] = "gzip";
        delete headers[CONTENT_LENGTH];
        let mtime = headers["last-modified"];
        if (mtime) mtime = Time.httpdate(mtime).toI();
        response[2] = new GzipStream(body, mtime ?? null, this.sync);
        return response;
      }
      case "identity":
        return response;
      default: {
        const message = `An acceptable encoding for the requested resource ${request.fullpath} could not be found.`;
        const bp = new BodyProxy([message], () => {
          if (body != null && typeof body.close === "function") body.close();
        });
        return [
          406,
          { [CONTENT_TYPE]: "text/plain", [CONTENT_LENGTH]: String(message.length) },
          bp,
        ];
      }
    }
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
        const each = (this.body.each ?? this.body.forEach) as (
          visit: (part: string) => void,
        ) => void;
        each.call(this.body, (part: string) => {
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
