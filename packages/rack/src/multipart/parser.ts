import { QueryParser } from "../query-parser.js";

// ── Error classes ─────────────────────────────────────────────────────────────

export class MultipartPartLimitError extends Error {
  constructor(message = "Maximum file multiparts in content reached") {
    super(message);
    this.name = "MultipartPartLimitError";
  }
}

export class MultipartTotalPartLimitError extends Error {
  constructor(message = "Maximum total multiparts in content reached") {
    super(message);
    this.name = "MultipartTotalPartLimitError";
  }
}

export class EmptyContentError extends Error {
  constructor(message = "bad content body") {
    super(message);
    this.name = "EmptyContentError";
  }
}

export class BoundaryTooLongError extends Error {
  constructor(message = "multipart boundary is too long") {
    super(message);
    this.name = "BoundaryTooLongError";
  }
}

// ── Module-level constants ────────────────────────────────────────────────────

export const EOL = "\r\n";
export const MULTIPART = /^multipart\/.*boundary="?([^";,]+)"?/i;
export const MULTIPART_CONTENT_TYPE = new RegExp(`Content-Type: (.*)${EOL}`, "i");
export const MULTIPART_CONTENT_DISPOSITION = new RegExp(
  `Content-Disposition:(.*)(?=${EOL}(\\S|$))`,
  "i",
);
export const MULTIPART_CONTENT_ID = new RegExp(`Content-ID:\\s*([^${EOL}]*)`, "i");

// ── Result type ───────────────────────────────────────────────────────────────

export interface MultipartInfo {
  params: Record<string, any> | null;
  tmpFiles: any[];
}

const EMPTY: MultipartInfo = { params: null, tmpFiles: [] };
Object.freeze(EMPTY.tmpFiles);
Object.freeze(EMPTY);

// ── Parser ────────────────────────────────────────────────────────────────────

type State = "FAST_FORWARD" | "CONSUME_TOKEN" | "MIME_HEAD" | "MIME_BODY" | "DONE";

export class Parser {
  static readonly BUFSIZE = 1_048_576;
  static readonly TEXT_PLAIN = "text/plain";

  /** @internal */
  state: State = "FAST_FORWARD";

  private _queryParser: QueryParser;
  private _params: ReturnType<QueryParser["makeParams"]>;
  private _bufsize: number;

  static parseBoundary(contentType: string | null | undefined): string | null {
    if (!contentType) return null;
    const m = MULTIPART.exec(contentType);
    return m ? m[1] : null;
  }

  static parse(
    io: { read(size: number): string | null },
    contentLength: number | null,
    contentType: string | null | undefined,
    tmpfile: ((filename: string, ct: string) => any) | null,
    bufsize: number,
    qp: QueryParser,
  ): MultipartInfo {
    if (contentLength === 0) return EMPTY;
    const boundary = Parser.parseBoundary(contentType);
    if (!boundary) return EMPTY;
    if (boundary.length > 70) {
      throw new BoundaryTooLongError(
        `multipart boundary size too large (${boundary.length} characters)`,
      );
    }
    const parser = new Parser(boundary, tmpfile, bufsize, qp);
    parser.parse(io);
    return parser.result();
  }

  constructor(
    _boundary: string,
    _tmpfile: ((filename: string, ct: string) => any) | null,
    bufsize: number,
    queryParser: QueryParser,
  ) {
    this._queryParser = queryParser;
    this._params = queryParser.makeParams();
    this._bufsize = bufsize;
    // Part B: SBuf + regex setup
  }

  parse(io: { read(size: number): string | null }): void {
    this._readData(io);
    while (true) {
      let status: void | "want_read";
      switch (this.state) {
        case "FAST_FORWARD":
          status = this._handleFastForward();
          break;
        case "CONSUME_TOKEN":
          status = this._handleConsumeToken();
          break;
        case "MIME_HEAD":
          status = this._handleMimeHead();
          break;
        case "MIME_BODY":
          status = this._handleMimeBody();
          break;
        default:
          return;
      }
      if (status === "want_read") this._readData(io);
    }
  }

  result(): MultipartInfo {
    // Part B: Collector iteration + tagMultipartEncoding
    throw new globalThis.Error("not yet implemented (Part B)");
  }

  /** @internal From WEBrick::HTTPUtils */
  _dequote(str: string): string {
    const m = /^"(.*)"$/.exec(str);
    return (m ? m[1] : str).replace(/\\(.)/g, "$1");
  }

  // ── Part B stubs ─────────────────────────────────────────────────────────────

  private _readData(_io: { read(size: number): string | null }): void {
    throw new globalThis.Error("not yet implemented (Part B)");
  }

  private _handleFastForward(): void | "want_read" {
    throw new globalThis.Error("not yet implemented (Part B)");
  }

  private _handleConsumeToken(): void {
    throw new globalThis.Error("not yet implemented (Part B)");
  }

  private _handleMimeHead(): void | "want_read" {
    throw new globalThis.Error("not yet implemented (Part B)");
  }

  private _handleMimeBody(): void | "want_read" {
    throw new globalThis.Error("not yet implemented (Part B)");
  }
}
