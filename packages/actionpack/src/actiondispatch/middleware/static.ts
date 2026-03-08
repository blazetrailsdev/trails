/**
 * ActionDispatch::Static
 *
 * Middleware that serves static files from a directory.
 */

import type { RackEnv, RackResponse } from "@rails-ts/rack";
import { bodyFromString, type RackBody } from "@rails-ts/rack";
import * as fs from "fs";
import * as path from "path";

type RackApp = (env: RackEnv) => Promise<RackResponse>;

export interface StaticOptions {
  root: string;
  index?: string;
  headers?: Record<string, string>;
  gzip?: boolean;
  brotli?: boolean;
}

export class Static {
  private app: RackApp;
  private root: string;
  private index: string;
  private headers: Record<string, string>;
  private gzip: boolean;
  private brotli: boolean;

  constructor(app: RackApp, options: StaticOptions) {
    this.app = app;
    this.root = path.resolve(options.root);
    this.index = options.index ?? "index.html";
    this.headers = options.headers ?? {};
    this.gzip = options.gzip !== false;
    this.brotli = options.brotli !== false;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const method = (env["REQUEST_METHOD"] as string) || "GET";
    if (method !== "GET" && method !== "HEAD") {
      return this.app(env);
    }

    const pathInfo = (env["PATH_INFO"] as string) || "/";

    // Validate path
    if (!this.isValidPath(pathInfo)) {
      return this.app(env);
    }

    // Try to serve the file
    const result = this.tryServe(pathInfo, env);
    if (result) return result;

    return this.app(env);
  }

  private isValidPath(requestPath: string): boolean {
    // Block null bytes
    if (requestPath.includes("\0")) return false;
    // Block path traversal
    const decoded = decodeURIComponent(requestPath);
    if (decoded.includes("..")) return false;
    return true;
  }

  private tryServe(requestPath: string, env: RackEnv): RackResponse | null {
    let filePath: string;
    try {
      filePath = path.join(this.root, decodeURIComponent(requestPath));
    } catch {
      return null;
    }

    // Security: ensure resolved path is within root
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(this.root)) {
      return null;
    }

    // Check for compressed versions
    const acceptEncoding = (env["HTTP_ACCEPT_ENCODING"] as string) || "";

    if (this.brotli && acceptEncoding.includes("br")) {
      const brPath = filePath + ".br";
      if (this.isFile(brPath)) {
        return this.serveFile(brPath, filePath, { "content-encoding": "br", vary: "Accept-Encoding" });
      }
    }

    if (this.gzip && acceptEncoding.includes("gzip")) {
      const gzPath = filePath + ".gz";
      if (this.isFile(gzPath)) {
        return this.serveFile(gzPath, filePath, { "content-encoding": "gzip", vary: "Accept-Encoding" });
      }
    }

    // Try exact file
    if (this.isFile(filePath)) {
      // Check if compressed version exists but client can't accept it
      if (this.isFile(filePath + ".gz") || this.isFile(filePath + ".br")) {
        return this.serveFile(filePath, filePath, { vary: "Accept-Encoding" });
      }
      return this.serveFile(filePath, filePath);
    }

    // Try directory index
    if (this.isDirectory(filePath)) {
      const indexPath = path.join(filePath, this.index);
      if (this.isFile(indexPath)) {
        return this.serveFile(indexPath, indexPath);
      }
    }

    // Try with index filename directly (e.g., /dir matches /dir.html before /dir/index.html)
    const withExt = filePath + ".html";
    if (this.isFile(withExt)) {
      return this.serveFile(withExt, withExt);
    }

    return null;
  }

  private serveFile(actualPath: string, originalPath: string, extraHeaders: Record<string, string> = {}): RackResponse {
    const content = fs.readFileSync(actualPath);
    const contentType = this.getMimeType(originalPath);

    const headers: Record<string, string> = {
      "content-type": contentType,
      "content-length": String(content.length),
      ...this.headers,
      ...extraHeaders,
    };

    return [200, headers, bodyFromString(content.toString())];
  }

  private isFile(p: string): boolean {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  }

  private isDirectory(p: string): boolean {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] ?? "application/octet-stream";
  }
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".br": "application/brotli",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".map": "application/json",
};
