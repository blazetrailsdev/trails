import * as fs from "fs";
import * as path from "path";
import { CONTENT_TYPE, CONTENT_LENGTH } from "./constants.js";
import { mimeType } from "./mime.js";

export class Files {
  private root: string;
  private headers: Record<string, string>;
  private defaultMime: string | null;

  constructor(root: string, headers: Record<string, string> = {}, defaultMime: string | null = "text/plain") {
    this.root = root ? path.resolve(root) : "";
    this.headers = headers;
    this.defaultMime = defaultMime;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, any>, any]> {
    const method = env["REQUEST_METHOD"];

    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      return [405, { "allow": "GET, HEAD, OPTIONS" }, ["Method Not Allowed"]];
    }

    if (method === "OPTIONS") {
      return [200, { "allow": "GET, HEAD, OPTIONS", [CONTENT_LENGTH]: "0" }, []];
    }

    const pathInfo = env["PATH_INFO"] || "/";
    return this.serving(env, pathInfo);
  }

  serving(env: Record<string, any>, pathInfo: string): [number, Record<string, any>, any] {
    const decodedPath = decodeURIComponent(pathInfo);

    // Null byte check
    if (decodedPath.includes("\0")) {
      return [400, { [CONTENT_TYPE]: "text/plain" }, ["Bad Request"]];
    }

    const filePath = this.root ? path.join(this.root, decodedPath) : decodedPath;
    const resolved = path.resolve(filePath);

    // Directory traversal check
    if (this.root && !resolved.startsWith(this.root)) {
      return [404, { [CONTENT_TYPE]: "text/plain", [CONTENT_LENGTH]: "10" }, ["Not Found\n"]];
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolved);
    } catch {
      return [404, { [CONTENT_TYPE]: "text/plain", [CONTENT_LENGTH]: "10" }, ["Not Found\n"]];
    }

    if (stat.isDirectory()) {
      return [404, { [CONTENT_TYPE]: "text/plain", [CONTENT_LENGTH]: "10" }, ["Not Found\n"]];
    }

    const size = stat.size;
    const headers: Record<string, string> = { ...this.headers };

    // MIME type
    const ext = path.extname(resolved);
    const mime = mimeType(ext, this.defaultMime);
    if (mime) {
      headers[CONTENT_TYPE] = mime;
    }

    // Last-Modified
    headers["last-modified"] = stat.mtime.toUTCString();

    const method = env["REQUEST_METHOD"];

    // Conditional GET
    const ifModifiedSince = env["HTTP_IF_MODIFIED_SINCE"];
    if (ifModifiedSince) {
      const since = new Date(ifModifiedSince);
      if (stat.mtime <= since) {
        return [304, headers, []];
      }
    }

    // Range handling
    const range = env["HTTP_RANGE"];
    if (range && size > 0) {
      return this.serveRange(resolved, size, range, headers, method);
    }

    headers[CONTENT_LENGTH] = String(size);

    if (method === "HEAD") {
      return [200, headers, []];
    }

    const body = new FileBody(resolved);
    return [200, headers, body];
  }

  private serveRange(
    filePath: string, size: number, range: string, headers: Record<string, string>, method: string
  ): [number, Record<string, any>, any] {
    const ranges = this.parseByteRanges(range, size);

    if (!ranges || ranges.length === 0) {
      headers["content-range"] = `bytes */${size}`;
      headers[CONTENT_LENGTH] = "0";
      return [416, headers, []];
    }

    if (ranges.length === 1) {
      const [start, end] = ranges[0];
      const len = end - start + 1;
      headers["content-range"] = `bytes ${start}-${end}/${size}`;
      headers[CONTENT_LENGTH] = String(len);

      if (method === "HEAD") {
        return [206, headers, []];
      }

      const buf = Buffer.alloc(len);
      const fd = fs.openSync(filePath, "r");
      fs.readSync(fd, buf, 0, len, start);
      fs.closeSync(fd);
      return [206, headers, [buf.toString()]];
    }

    // Multiple ranges
    const boundary = "AaB03x";
    const ct = headers[CONTENT_TYPE] || "application/octet-stream";
    const parts: string[] = [];
    for (const [start, end] of ranges) {
      const len = end - start + 1;
      const buf = Buffer.alloc(len);
      const fd = fs.openSync(filePath, "r");
      fs.readSync(fd, buf, 0, len, start);
      fs.closeSync(fd);
      parts.push(`\r\n--${boundary}\r\ncontent-type: ${ct}\r\ncontent-range: bytes ${start}-${end}/${size}\r\n\r\n${buf.toString()}`);
    }
    parts.push(`\r\n--${boundary}--\r\n`);
    const bodyStr = parts.join("");
    headers[CONTENT_TYPE] = `multipart/byteranges; boundary=${boundary}`;
    headers[CONTENT_LENGTH] = String(Buffer.byteLength(bodyStr));
    return [206, headers, [bodyStr]];
  }

  private parseByteRanges(range: string, size: number): [number, number][] | null {
    const m = range.match(/^bytes=(.+)$/);
    if (!m) return null;

    const specs = m[1].split(",").map(s => s.trim());
    const ranges: [number, number][] = [];

    for (const spec of specs) {
      if (spec.startsWith("-")) {
        const suffixLen = parseInt(spec.substring(1));
        if (isNaN(suffixLen)) return null;
        const start = Math.max(0, size - suffixLen);
        ranges.push([start, size - 1]);
      } else if (spec.endsWith("-")) {
        const start = parseInt(spec);
        if (isNaN(start) || start >= size) return null;
        ranges.push([start, size - 1]);
      } else {
        const [s, e] = spec.split("-").map(Number);
        if (isNaN(s) || isNaN(e)) return null;
        if (s > e || s >= size) return null;
        ranges.push([s, Math.min(e, size - 1)]);
      }
    }

    return ranges.length > 0 ? ranges : null;
  }
}

class FileBody {
  private path: string;

  constructor(filePath: string) {
    this.path = filePath;
  }

  toPath(): string {
    return this.path;
  }

  forEach(cb: (chunk: string) => void): void {
    const data = fs.readFileSync(this.path, "utf-8");
    cb(data);
  }

  each(cb: (chunk: string) => void): void {
    this.forEach(cb);
  }

  close(): void {}

  [Symbol.iterator](): Iterator<string> {
    const data = fs.readFileSync(this.path, "utf-8");
    let done = false;
    return {
      next() {
        if (done) return { value: undefined, done: true };
        done = true;
        return { value: data, done: false };
      }
    };
  }
}
