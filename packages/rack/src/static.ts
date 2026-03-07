import * as fs from "fs";
import * as path from "path";
import { Files } from "./files.js";
import { mimeType } from "./mime.js";

export interface StaticOptions {
  urls?: string[];
  root?: string;
  index?: string;
  cascade?: boolean;
  header_rules?: any[];
  cache_control?: string;
  gzip?: boolean;
}

export class Static {
  private app: any;
  private urls: string[];
  private root: string;
  private index: string | null;
  private cascade: boolean;
  private fileServer: Files;
  private headerRules: any[];
  private cacheControl: string | null;
  private gzip: boolean;

  constructor(app: any, opts: StaticOptions = {}) {
    this.app = app;
    this.urls = opts.urls || ["/"];
    this.root = opts.root ? path.resolve(opts.root) : process.cwd();
    this.index = opts.index || null;
    this.cascade = opts.cascade || false;
    this.headerRules = opts.header_rules || [];
    this.cacheControl = opts.cache_control || null;
    this.fileServer = new Files(this.root, {});
    this.gzip = opts.gzip || false;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, any>, any]> {
    const pathInfo = env["PATH_INFO"] || "/";

    if (!this.canServe(pathInfo)) {
      return this.app(env);
    }

    // Check for index file
    let servePath = pathInfo;
    if (this.index && (pathInfo.endsWith("/") || pathInfo === "")) {
      servePath = pathInfo + this.index;
    }

    // Try gzip version first
    if (this.gzip && this.acceptsGzip(env)) {
      const gzPath = servePath + ".gz";
      const fullGzPath = path.join(this.root, gzPath);
      if (fs.existsSync(fullGzPath) && !fs.statSync(fullGzPath).isDirectory()) {
        const [status, headers, body] = this.fileServer.serving(env, gzPath);
        if (status === 200 || status === 304) {
          headers["content-encoding"] = "gzip";
          // Use original content type
          const origExt = path.extname(servePath);
          if (origExt) {
            const mime = mimeType(origExt, "text/plain");
            if (mime) headers["content-type"] = mime;
          }
          this.applyHeaders(headers, servePath);
          return [status, headers, body];
        }
      }
    }

    const [status, headers, body] = this.fileServer.serving(env, servePath);

    if (status === 404) {
      if (this.cascade) {
        return this.app(env);
      }
      return [status, headers, body];
    }

    this.applyHeaders(headers, servePath);
    return [status, headers, body];
  }

  private canServe(pathInfo: string): boolean {
    return this.urls.some(url => pathInfo.startsWith(url));
  }

  private acceptsGzip(env: Record<string, any>): boolean {
    const ae = env["HTTP_ACCEPT_ENCODING"] || "";
    return ae.includes("gzip");
  }

  private applyHeaders(headers: Record<string, any>, path: string): void {
    if (this.cacheControl) {
      headers["cache-control"] = this.cacheControl;
    }

    for (const rule of this.headerRules) {
      if (!Array.isArray(rule) || rule.length < 2) continue;
      const [matcher, headerValues] = rule;

      let matches = false;
      if (matcher === ":all") {
        matches = true;
      } else if (matcher === ":fonts") {
        matches = /\.(woff2?|ttf|otf|eot|svg)$/i.test(path);
      } else if (typeof matcher === "string") {
        matches = path.startsWith(matcher) || path.startsWith("/" + matcher);
      } else if (Array.isArray(matcher)) {
        matches = matcher.some((ext: string) => path.endsWith(ext));
      } else if (matcher instanceof RegExp) {
        matches = matcher.test(path);
      }

      if (matches && typeof headerValues === "object") {
        Object.assign(headers, headerValues);
      }
    }
  }
}
