import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { Files, Mime, Request, Utils } from "@blazetrails/rack";
import { File } from "@blazetrails/ruby-compat";

type RackApp = (env: RackEnv) => Promise<RackResponse>;

export interface StaticOptions {
  index?: string;
  headers?: Record<string, string>;
}

export interface FileHandlerOptions {
  index?: string;
  headers?: Record<string, string>;
  precompressed?: string[];
  compressibleContentTypes?: RegExp;
}

type AcceptEncoding = ReadonlyArray<[string, number]>;
type Found = readonly [filepath: string, contentHeaders: Record<string, string>];

export class Static {
  private app: RackApp;
  /** @internal */
  private fileHandler: FileHandler;

  constructor(app: RackApp, path: string, { index = "index", headers = {} }: StaticOptions = {}) {
    this.app = app;
    this.fileHandler = new FileHandler(path, { index, headers });
  }

  async call(env: RackEnv): Promise<RackResponse> {
    return (await this.fileHandler.attempt(env)) ?? this.app(env);
  }
}

export class FileHandler {
  static readonly PRECOMPRESSED: Record<string, string | null> = {
    br: ".br",
    gzip: ".gz",
    identity: null,
  };

  /** @internal */
  private root: string;
  /** @internal */
  private index: string;
  /** @internal */
  private precompressed: string[];
  /** @internal */
  private compressibleContentTypes: RegExp;
  /** @internal */
  private fileServer: Files;

  constructor(
    root: string,
    {
      index = "index",
      headers = {},
      precompressed = ["br", "gzip"],
      compressibleContentTypes = /^(?:text\/|application\/javascript|image\/svg\+xml)/,
    }: FileHandlerOptions = {},
  ) {
    this.root = root.replace(/\/$/, "");
    this.index = index;

    this.precompressed = [...new Set([...precompressed, "identity"])];
    this.compressibleContentTypes = compressibleContentTypes;

    this.fileServer = new Files(this.root, headers);
  }

  async call(env: RackEnv): Promise<RackResponse> {
    return (await this.attempt(env)) ?? this.fileServer.call(env);
  }

  async attempt(env: RackEnv): Promise<RackResponse | null> {
    const request = new Request(env);

    if (request.isGet() || request.isHead()) {
      const found = this.findFile(request.pathInfo, { acceptEncoding: request.acceptEncoding });
      if (found) {
        return this.serve(request, ...found);
      }
    }
    return null;
  }

  /** @internal */
  private async serve(
    request: Request,
    filepath: string,
    contentHeaders: Record<string, string>,
  ): Promise<RackResponse> {
    const original = request.pathInfo;
    request.pathInfo = Utils.escapePath(filepath);

    try {
      const [status, headers, body] = await this.fileServer.call(request.env);
      if (status !== 304) {
        Object.assign(headers, contentHeaders);
      }
      return [status, headers, body];
    } finally {
      request.pathInfo = original;
    }
  }

  /** @internal */
  private findFile(
    pathInfo: string,
    { acceptEncoding }: { acceptEncoding: AcceptEncoding },
  ): Found | null {
    let result: Found | null = null;
    this.eachCandidateFilepath(pathInfo, (filepath, contentType) => {
      const response = this.tryFiles(filepath, contentType, { acceptEncoding });
      if (response) {
        result = response;
        return true;
      }
      return false;
    });
    return result;
  }

  /** @internal */
  private tryFiles(
    filepath: string,
    contentType: string,
    { acceptEncoding }: { acceptEncoding: AcceptEncoding },
  ): Found | null {
    const headers: Record<string, string> = { "content-type": contentType };
    if (this.isCompressible(contentType)) {
      return this.tryPrecompressedFiles(filepath, headers, { acceptEncoding });
    } else if (this.isFileReadable(filepath)) {
      return [filepath, headers];
    }
    return null;
  }

  /** @internal */
  private tryPrecompressedFiles(
    filepath: string,
    headers: Record<string, string>,
    { acceptEncoding }: { acceptEncoding: AcceptEncoding },
  ): Found | null {
    let result: Found | null = null;
    this.eachPrecompressedFilepath(filepath, (contentEncoding, precompressedFilepath) => {
      if (this.isFileReadable(precompressedFilepath)) {
        if (contentEncoding === "identity") {
          result = [precompressedFilepath, headers];
          return true;
        } else {
          headers["vary"] = "accept-encoding";

          const re = new RegExp(`\\b${contentEncoding}\\b`, "i");
          if (acceptEncoding.some(([enc]) => re.test(enc))) {
            headers["content-encoding"] = contentEncoding;
            result = [precompressedFilepath, headers];
            return true;
          }
        }
      }
      return false;
    });
    return result;
  }

  /** @internal */
  private isFileReadable(path: string): boolean {
    const filePath = File.join(this.root, path);
    return File.isFile(filePath) && File.isReadable(filePath);
  }

  /** @internal */
  private isCompressible(contentType: string): boolean {
    return this.compressibleContentTypes.test(contentType);
  }

  /** @internal */
  private eachPrecompressedFilepath(
    filepath: string,
    block: (contentEncoding: string, precompressedFilepath: string) => boolean | void,
  ): void {
    for (const contentEncoding of this.precompressed) {
      const precompressedExt = FileHandler.PRECOMPRESSED[contentEncoding];
      if (block(contentEncoding, `${filepath}${precompressedExt ?? ""}`)) return;
    }
  }

  /** @internal */
  private eachCandidateFilepath(
    pathInfo: string,
    block: (filepath: string, contentType: string) => boolean | void,
  ): void {
    const path = this.cleanPath(pathInfo);
    if (path == null) return;

    const ext = File.extname(path);
    const contentType = Mime.mimeType(ext, null);
    if (block(path, contentType ?? "text/plain")) return;

    if (!contentType) {
      const defaultExt = ".html";
      if (ext !== defaultExt) {
        const defaultContentType = Mime.mimeType(defaultExt, "text/plain")!;

        if (block(`${path}${defaultExt}`, defaultContentType)) return;
        if (block(`${path}/${this.index}${defaultExt}`, defaultContentType)) return;
      }
    }
  }

  /** @internal */
  private cleanPath(pathInfo: string): string | null {
    let path: string;
    try {
      path = Utils.unescapePath(pathInfo.replace(/\/$/, ""));
    } catch {
      return null;
    }
    if (Utils.validPath(path)) {
      return Utils.cleanPathInfo(path);
    }
    return null;
  }
}
