import { getFs, getPath } from "@blazetrails/activesupport";
import type { FsStatResult } from "@blazetrails/activesupport";
import { CONTENT_TYPE, CONTENT_LENGTH } from "./constants.js";
import { mimeType as lookupMime } from "./mime.js";

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
    const fs = getFs();
    const fd = fs.openSync(this.path, "r");
    try {
      for (const range of this.ranges) {
        if (this.multipart()) cb(this.multipartHeading(range));
        this.eachRangePart(fd, range, cb);
      }
      if (this.multipart()) cb(`\r\n--${MULTIPART_BOUNDARY}--\r\n`);
    } finally {
      fs.closeSync(fd);
    }
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
  private eachRangePart(fd: number, range: [number, number], cb: (chunk: string) => void): void {
    let remaining = range[1] - range[0] + 1;
    let offset = range[0];
    while (remaining > 0) {
      const len = Math.min(8192, remaining);
      const buf = Buffer.alloc(len);
      const read = getFs().readSync(fd, buf, 0, len, offset);
      if (read === 0) break;
      cb(buf.slice(0, read).toString("binary"));
      offset += read;
      remaining -= read;
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

  constructor(
    root: string,
    headers: Record<string, string> = {},
    defaultMime: string | null = "text/plain",
  ) {
    this.root = root ? getPath().resolve(root) : "";
    this.headers = headers;
    this.defaultMime = defaultMime;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, any>, any]> {
    const method = env["REQUEST_METHOD"];
    const [status, headers, body] = this.get(env);
    return method === "HEAD" ? [status, headers, []] : [status, headers, body];
  }

  get(env: Record<string, any>): [number, Record<string, any>, any] {
    const method = env["REQUEST_METHOD"];
    if (!ALLOWED_VERBS.includes(method)) {
      return this.fail(405, "Method Not Allowed", { allow: ALLOW_HEADER });
    }

    let pathInfo: string;
    try {
      pathInfo = decodeURIComponent(env["PATH_INFO"] || "/");
    } catch {
      return this.fail(400, "Bad Request");
    }
    if (!this.validPath(pathInfo)) return this.fail(400, "Bad Request");

    const cleanPath = pathInfo;
    const filePath = this.root ? getPath().join(this.root, cleanPath) : cleanPath;
    const resolved = getPath().resolve(filePath);

    if (this.root && resolved !== this.root && !resolved.startsWith(this.root + getPath().sep)) {
      return this.fail(404, `File not found: ${pathInfo}`);
    }

    let isFile = false;
    try {
      isFile = getFs().statSync(resolved).isFile();
    } catch {
      // not found or unreadable
    }

    return isFile ? this.serving(env, resolved) : this.fail(404, `File not found: ${pathInfo}`);
  }

  serving(env: Record<string, any>, path: string): [number, Record<string, any>, any] {
    const method = env["REQUEST_METHOD"];

    if (method === "OPTIONS") {
      return [200, { allow: ALLOW_HEADER, [CONTENT_LENGTH]: "0" }, []];
    }

    let stat: FsStatResult;
    try {
      stat = getFs().statSync(path);
    } catch {
      return this.fail(404, "File not found");
    }

    if (!stat.isFile()) return this.fail(404, "File not found");

    const lastModified = stat.mtime.toUTCString();
    const ifModSince = env["HTTP_IF_MODIFIED_SINCE"];
    const headers: Record<string, string> = { "last-modified": lastModified };

    if (ifModSince && new Date(ifModSince) >= stat.mtime) return [304, headers, []]; // boundary: HTTP-date vs mtime
    const mime = this.mimeType(path, this.defaultMime);
    if (mime) headers[CONTENT_TYPE] = mime;
    Object.assign(headers, this.headers);

    const size = this.filesize(path);
    const rawRange = env["HTTP_RANGE"] as string | undefined;

    if (rawRange && size > 0) {
      const ranges = this.parseByteRanges(rawRange, size);
      if (!ranges || ranges.length === 0) {
        const resp = this.fail(416, "Byte range unsatisfiable");
        resp[1]["content-range"] = `bytes */${size}`;
        return resp;
      }

      const status = 206;
      if (ranges.length === 1) {
        headers["content-range"] = `bytes ${ranges[0][0]}-${ranges[0][1]}/${size}`;
      } else {
        headers[CONTENT_TYPE] = `multipart/byteranges; boundary=${MULTIPART_BOUNDARY}`;
      }
      const body = new BaseIterator(path, ranges, { mimeType: mime, size });
      headers[CONTENT_LENGTH] = String(body.bytesize());
      return method === "HEAD" ? [status, headers, []] : [status, headers, body];
    }

    const fullRanges: [number, number][] = size > 0 ? [[0, size - 1]] : [];
    const body = new Iterator(path, fullRanges, { mimeType: mime, size });
    headers[CONTENT_LENGTH] = String(size);
    return method === "HEAD" ? [200, headers, []] : [200, headers, body];
  }

  /** @internal */
  fail(
    status: number,
    body: string,
    extra: Record<string, string> = {},
  ): [number, Record<string, any>, any] {
    const msg = body + "\n";
    return [
      status,
      {
        [CONTENT_TYPE]: "text/plain",
        [CONTENT_LENGTH]: String(Buffer.byteLength(msg)),
        "x-cascade": "pass",
        ...extra,
      },
      [msg],
    ];
  }

  /** @internal */
  mimeType(path: string, defaultMime: string | null): string | null {
    return lookupMime(getPath().extname(path), defaultMime);
  }

  /** @internal */
  filesize(path: string): number {
    try {
      return getFs().statSync(path).size ?? 0;
    } catch {
      return 0;
    }
  }

  /** @internal */
  private validPath(pathInfo: string): boolean {
    return !pathInfo.includes("\0");
  }

  /** @internal */
  private parseByteRanges(range: string, size: number): [number, number][] | null {
    const m = range.match(/^bytes=(.+)$/);
    if (!m) return null;

    const result: [number, number][] = [];
    for (const spec of m[1].split(",").map((s) => s.trim())) {
      if (spec.startsWith("-")) {
        const len = parseInt(spec.slice(1));
        if (isNaN(len) || len <= 0) return null;
        result.push([Math.max(0, size - len), size - 1]);
      } else if (spec.endsWith("-")) {
        const start = parseInt(spec);
        if (isNaN(start) || start >= size) return null;
        result.push([start, size - 1]);
      } else {
        const [a, b] = spec.split("-").map(Number);
        if (isNaN(a) || isNaN(b) || a > b || a >= size) return null;
        result.push([a, Math.min(b, size - 1)]);
      }
    }
    return result.length > 0 ? result : null;
  }
}
