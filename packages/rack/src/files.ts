import { File, IO } from "@blazetrails/ruby-compat";
import { CONTENT_TYPE, CONTENT_LENGTH } from "./constants.js";
import { mimeType as lookupMime } from "./mime.js";
import { Request } from "./request.js";
import { Head } from "./head.js";
import * as Utils from "./utils.js";

const ALLOWED_VERBS = ["GET", "HEAD", "OPTIONS"];
const ALLOW_HEADER = ALLOWED_VERBS.join(", ");
export const MULTIPART_BOUNDARY = "AaB03x";

export class BaseIterator {
  path: string;
  ranges: [number, number][];
  options: { mimeType: string | null | undefined; size: number };

  constructor(
    path: string,
    ranges: [number, number][],
    options: { mimeType?: string | null; size: number },
  ) {
    this.path = path;
    this.ranges = ranges;
    this.options = { mimeType: options.mimeType, size: options.size };
  }

  each(cb: (chunk: string) => void): void {
    File.open(this.path, "rb", (file) => {
      for (const range of this.ranges) {
        if (this.multipart()) cb(this.multipartHeading(range));
        this.eachRangePart(file, range, cb);
      }
      if (this.multipart()) cb(`\r\n--${MULTIPART_BOUNDARY}--\r\n`);
    });
  }

  *[Symbol.iterator](): Generator<string> {
    const chunks: string[] = [];
    this.each((chunk) => chunks.push(chunk));
    yield* chunks;
  }

  bytesize(): number {
    let size = 0;
    for (const range of this.ranges) {
      if (this.multipart()) size += Buffer.byteLength(this.multipartHeading(range));
      size += range[1] - range[0] + 1;
    }
    if (this.multipart()) size += Buffer.byteLength(`\r\n--${MULTIPART_BOUNDARY}--\r\n`);
    return size;
  }

  close(): void {}

  /** @internal */
  private multipart(): boolean {
    return this.ranges.length > 1;
  }

  /** @internal */
  private multipartHeading(range: [number, number]): string {
    const ct = this.options.mimeType ? `content-type: ${this.options.mimeType}\r\n` : "";
    return (
      `\r\n--${MULTIPART_BOUNDARY}\r\n` +
      ct +
      `content-range: bytes ${range[0]}-${range[1]}/${this.options.size}\r\n\r\n`
    );
  }

  /** @internal */
  private eachRangePart(file: IO, range: [number, number], cb: (chunk: string) => void): void {
    file.seek(range[0]);
    let remainingLen = range[1] - range[0] + 1;
    while (remainingLen > 0) {
      const part = file.read(Math.min(8192, remainingLen));
      if (part === null) break;
      remainingLen -= part.length;

      cb(part);
    }
  }
}

export class Iterator extends BaseIterator {
  toPath(): string {
    return this.path;
  }
}

export class Files {
  root: string;
  private headers: Record<string, string>;
  private defaultMime: string | null;
  private head: Head;

  /** @missingRailsArgs new — PERMANENT */
  constructor(
    root: string,
    headers: Record<string, string> = {},
    defaultMime: string | null = "text/plain",
  ) {
    this.root = root ? File.expandPath(root) : "";
    this.headers = headers;
    this.defaultMime = defaultMime;
    this.head = new Head((env) => this.get(env));
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, any>, any]> {
    return this.head.call(env);
  }

  get(env: Record<string, any>): [number, Record<string, any>, any] {
    const request = new Request(env);
    if (!ALLOWED_VERBS.includes(request.requestMethod)) {
      return this.fail(405, "Method Not Allowed", { allow: ALLOW_HEADER });
    }

    const pathInfo = Utils.unescapePath(request.pathInfo);
    if (!Utils.validPath(pathInfo)) return this.fail(400, "Bad Request");

    const cleanPathInfo = Utils.cleanPathInfo(pathInfo);
    const path = File.join(this.root, cleanPathInfo);

    const available = File.isFile(path) && File.isReadable(path);

    if (available) {
      return this.serving(request, path);
    } else {
      return this.fail(404, `File not found: ${pathInfo}`);
    }
  }

  serving(request: Request, path: string): [number, Record<string, any>, any] {
    if (request.isOptions()) {
      return [200, { allow: ALLOW_HEADER, [CONTENT_LENGTH]: "0" }, []];
    }

    const lastModified = File.mtime(path).toUTCString();
    if (request.getHeader("HTTP_IF_MODIFIED_SINCE") === lastModified) return [304, {}, []];

    const headers: Record<string, string> = { "last-modified": lastModified };
    const mimeType = this.mimeType(path, this.defaultMime);
    if (mimeType) headers[CONTENT_TYPE] = mimeType;

    if (this.headers) Object.assign(headers, this.headers);

    let status = 200;
    let size = this.filesize(path);
    let partialContent = false;
    let body: any;

    let ranges = Utils.getByteRanges(request.getHeader("HTTP_RANGE") as string | undefined, size);
    if (ranges === null) {
      ranges = [[0, size - 1]];
    } else if (ranges.length === 0) {
      const response = this.fail(416, "Byte range unsatisfiable");
      response[1]["content-range"] = `bytes */${size}`;
      return response;
    } else {
      partialContent = true;

      if (ranges.length === 1) {
        const range = ranges[0];
        headers["content-range"] = `bytes ${range[0]}-${range[1]}/${size}`;
      } else {
        headers[CONTENT_TYPE] = `multipart/byteranges; boundary=${MULTIPART_BOUNDARY}`;
      }

      status = 206;
      body = new BaseIterator(path, ranges, { mimeType, size });
      size = body.bytesize();
    }

    headers[CONTENT_LENGTH] = String(size);

    if (request.isHead()) {
      body = [];
    } else if (!partialContent) {
      body = new Iterator(path, ranges, { mimeType, size });
    }

    return [status, headers, body];
  }

  /** @internal */
  fail(
    status: number,
    body: string,
    headers: Record<string, string> = {},
  ): [number, Record<string, any>, any] {
    const msg = body + "\n";
    return [
      status,
      {
        [CONTENT_TYPE]: "text/plain",
        [CONTENT_LENGTH]: String(Buffer.byteLength(msg)),
        "x-cascade": "pass",
        ...headers,
      },
      [msg],
    ];
  }

  /** @internal */
  mimeType(path: string, defaultMime: string | null): string | null {
    return lookupMime(File.extname(path), defaultMime);
  }

  /** @internal */
  filesize(path: string): number {
    return File.sizeQ(path) ?? Buffer.byteLength(File.read(path));
  }
}
