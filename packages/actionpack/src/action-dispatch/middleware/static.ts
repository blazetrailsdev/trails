/**
 * ActionDispatch::Static — middleware that serves static files from a
 * directory. Mirrors Rails' `middleware/static.rb` (Static + FileHandler).
 */

import type { RackBody, RackEnv, RackResponse } from "@blazetrails/rack";
import { getFs, getPath } from "@blazetrails/activesupport";

async function* bodyFromBytes(bytes: Uint8Array): RackBody {
  yield bytes;
}

type RackApp = (env: RackEnv) => Promise<RackResponse>;

export interface StaticOptions {
  root: string;
  index?: string;
  headers?: Record<string, string>;
  gzip?: boolean;
  brotli?: boolean;
}

export interface FileHandlerOptions {
  index?: string;
  headers?: Record<string, string>;
  precompressed?: string[];
  compressibleContentTypes?: RegExp;
  gzip?: boolean;
  brotli?: boolean;
}

type AcceptEncoding = ReadonlyArray<string>;
type Found = readonly [filepath: string, contentHeaders: Record<string, string>];

const DEFAULT_COMPRESSIBLE = /^(?:text\/|application\/javascript|image\/svg\+xml)/;
const PRECOMPRESSED: Record<string, string | null> = {
  br: ".br",
  gzip: ".gz",
  identity: null,
};

export class Static {
  private app: RackApp;
  /** @internal */
  private fileHandler: FileHandler;

  constructor(app: RackApp, options: StaticOptions) {
    this.app = app;
    const { root, ...rest } = options;
    this.fileHandler = new FileHandler(root, rest);
  }

  async call(env: RackEnv): Promise<RackResponse> {
    return (await this.fileHandler.attempt(env)) ?? this.app(env);
  }
}

export class FileHandler {
  /** @internal */
  private root: string;
  /** @internal */
  private index: string;
  /** @internal */
  private headers: Record<string, string>;
  /** @internal */
  private precompressed: string[];
  /** @internal */
  private compressibleContentTypes: RegExp;

  constructor(root: string, options: FileHandlerOptions = {}) {
    this.root = getPath().resolve(root.replace(/\/$/, ""));
    this.index = options.index ?? "index.html";
    this.headers = options.headers ?? {};
    const enabled: string[] = [];
    if (options.brotli !== false) enabled.push("br");
    if (options.gzip !== false) enabled.push("gzip");
    this.precompressed = [...(options.precompressed ?? enabled), "identity"];
    this.compressibleContentTypes = options.compressibleContentTypes ?? DEFAULT_COMPRESSIBLE;
  }

  /**
   * Match a `GET`/`HEAD` request to a file on disk and return its Rack
   * response, or `null` to let the caller fall through to the next app.
   */
  async attempt(env: RackEnv): Promise<RackResponse | null> {
    const method = (env["REQUEST_METHOD"] as string) || "GET";
    if (method !== "GET" && method !== "HEAD") return null;

    const pathInfo = (env["PATH_INFO"] as string) || "/";
    const acceptEncoding = parseAcceptEncoding((env["HTTP_ACCEPT_ENCODING"] as string) ?? "");
    const found = this.findFile(pathInfo, acceptEncoding);
    if (!found) return null;
    const [filepath, contentHeaders] = found;
    return this.serve(env, filepath, contentHeaders);
  }

  /** @internal */
  serve(_env: RackEnv, filepath: string, contentHeaders: Record<string, string>): RackResponse {
    const absolute = getPath().resolve(this.root, "." + filepath);
    if (absolute !== this.root && !absolute.startsWith(this.root + getPath().sep)) {
      throw new Error(`refusing to serve path outside root: ${filepath}`);
    }
    const content = getFs().readFileSync(absolute);
    const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
    const headers: Record<string, string> = {
      "content-length": String(bytes.byteLength),
      ...this.headers,
      ...contentHeaders,
    };
    return [200, headers, bodyFromBytes(bytes)];
  }

  /** @internal */
  findFile(pathInfo: string, acceptEncoding: AcceptEncoding): Found | null {
    let result: Found | null = null;
    this.eachCandidateFilepath(pathInfo, (filepath, contentType) => {
      const response = this.tryFiles(filepath, contentType, acceptEncoding);
      if (response) {
        result = response;
        return true;
      }
      return false;
    });
    return result;
  }

  /** @internal */
  tryFiles(filepath: string, contentType: string, acceptEncoding: AcceptEncoding): Found | null {
    const headers: Record<string, string> = { "content-type": contentType };
    if (this.isCompressible(contentType)) {
      return this.tryPrecompressedFiles(filepath, headers, acceptEncoding);
    }
    if (this.isFileReadable(filepath)) return [filepath, headers];
    return null;
  }

  /** @internal */
  tryPrecompressedFiles(
    filepath: string,
    headers: Record<string, string>,
    acceptEncoding: AcceptEncoding,
  ): Found | null {
    // Mirrors Rails' shared `headers` mutation so Vary sticks through to
    // the identity fallback.
    let result: Found | null = null;
    this.eachPrecompressedFilepath(filepath, (encoding, candidate) => {
      if (!this.isFileReadable(candidate)) return false;
      if (encoding === "identity") {
        result = [candidate, headers];
        return true;
      }
      headers["vary"] = "Accept-Encoding";
      const re = new RegExp(`\\b${encoding}\\b`, "i");
      if (acceptEncoding.some((enc) => re.test(enc))) {
        headers["content-encoding"] = encoding;
        result = [candidate, headers];
        return true;
      }
      return false;
    });
    return result;
  }

  /** @internal */
  isFileReadable(path: string): boolean {
    const filePath = getPath().resolve(this.root, "." + path);
    if (filePath !== this.root && !filePath.startsWith(this.root + getPath().sep)) return false;
    try {
      const stat = getFs().statSync(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  /** @internal */
  isCompressible(contentType: string): boolean {
    return this.compressibleContentTypes.test(contentType);
  }

  /** @internal */
  eachPrecompressedFilepath(
    filepath: string,
    block: (encoding: string, candidate: string) => boolean | void,
  ): void {
    for (const encoding of this.precompressed) {
      const ext = PRECOMPRESSED[encoding];
      const candidate = ext == null ? filepath : `${filepath}${ext}`;
      if (block(encoding, candidate)) return;
    }
  }

  /** @internal */
  eachCandidateFilepath(
    pathInfo: string,
    block: (filepath: string, contentType: string) => boolean | void,
  ): void {
    const path = this.cleanPath(pathInfo);
    if (path == null) return;

    const ext = getPath().extname(path).toLowerCase();
    const contentType = MIME_TYPES[ext];
    if (block(path, contentType ?? "text/plain")) return;

    if (!contentType) {
      const defaultExt = ".html";
      if (ext !== defaultExt) {
        const defaultContentType = MIME_TYPES[defaultExt] ?? "text/plain";
        if (block(`${path}${defaultExt}`, defaultContentType)) return;
        const sep = path.endsWith("/") ? "" : "/";
        const indexCt =
          MIME_TYPES[getPath().extname(this.index).toLowerCase()] ?? defaultContentType;
        if (block(`${path}${sep}${this.index}`, indexCt)) return;
      }
    }
  }

  /** @internal */
  cleanPath(pathInfo: string): string | null {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathInfo.replace(/\/$/, ""));
    } catch {
      return null;
    }
    if (decoded.includes("\0")) return null;
    const segments: string[] = [];
    for (const seg of decoded.split("/")) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") {
        if (segments.length === 0) return null;
        segments.pop();
        continue;
      }
      segments.push(seg);
    }
    return "/" + segments.join("/");
  }
}

// Rails' try_precompressed_files only token-matches against the parsed
// Accept-Encoding entries (the q value is ignored), so trails parses out
// the bare tokens to mirror that. q=0 ("explicitly refused") is left in
// the list intentionally — Rails has the same gap.
function parseAcceptEncoding(header: string): AcceptEncoding {
  if (!header) return [];
  return header.split(",").map((part) => part.trim().split(";")[0].trim());
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
