import { File, GzipWriter, hasKey } from "@blazetrails/ruby-compat";
import { Time } from "@blazetrails/date";
import { BodyProxy } from "./body-proxy.js";
import { Request } from "./request.js";
import * as Utils from "./utils.js";
import {
  CACHE_CONTROL,
  CONTENT_TYPE,
  CONTENT_LENGTH,
  STATUS_WITH_NO_ENTITY_BODY,
} from "./constants.js";

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
  private compressibleTypes: string[] | null;
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
    this.compressibleTypes = options.include || null;
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

    const varyHeader = String(headers["vary"] ?? "");
    const vary = varyHeader === "" ? [] : varyHeader.split(",").map((v) => v.trim());
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
        response[2] = new GzipStream(body, mtime, this.sync);
        return response;
      }
      case "identity":
        return response;
      default: {
        const message = `An acceptable encoding for the requested resource ${request.fullpath} could not be found.`;
        const bp = new BodyProxy([message], () => {
          if (typeof body?.close === "function") body.close();
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
    if (
      hasKey(STATUS_WITH_NO_ENTITY_BODY, status) ||
      /\bno-transform\b/.test(String(headers[CACHE_CONTROL] ?? "")) ||
      (headers["content-encoding"] != null && !/\bidentity\b/.test(headers["content-encoding"]))
    ) {
      return false;
    }

    if (
      this.compressibleTypes &&
      !(
        hasKey(headers, CONTENT_TYPE) &&
        this.compressibleTypes.includes(/[^;]*/.exec(headers[CONTENT_TYPE])![0])
      )
    ) {
      return false;
    }
    if (this.condition && !this.condition.call(undefined, env, status, headers, body)) return false;
    if (headers[CONTENT_LENGTH] === "0") return false;
    return true;
  }
}

export class GzipStream {
  static readonly BUFFER_LENGTH = 128 * 1_024;

  private body: any;
  private mtime: number | null | undefined;
  private sync: boolean | null;
  private writer!: (data: Uint8Array) => void;

  constructor(body: any, mtime: number | null | undefined, sync: boolean | null) {
    this.body = body;
    this.mtime = mtime;
    this.sync = sync;
  }

  async each(block: (data: Uint8Array) => void): Promise<void> {
    this.writer = block;
    const gzip = new GzipWriter(this);
    if (this.mtime) gzip.mtime = this.mtime;
    try {
      if (this.body instanceof File) {
        let part: string | null;
        while ((part = this.body.read(GzipStream.BUFFER_LENGTH)) != null) {
          gzip.write(Buffer.from(String(part), "binary"));
          if (this.sync) void gzip.flush();
        }
      } else {
        const visit = (part: string) => {
          if (part.length === 0) return;
          gzip.write(Buffer.from(String(part), "binary"));
          if (this.sync) void gzip.flush();
        };
        if (Array.isArray(this.body)) for (const part of this.body) visit(part);
        else this.body.each(visit);
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
