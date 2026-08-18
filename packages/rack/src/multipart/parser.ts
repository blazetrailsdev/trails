import { QueryParser } from "../query-parser.js";
import { getMultipartFileLimit, getMultipartTotalPartLimit, unescapePath } from "../utils.js";

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

// ── BoundedIO ─────────────────────────────────────────────────────────────────

/** @internal */
export class BoundedIO {
  private cursor = 0;
  constructor(
    private io: { read(n: number, outbuf?: string): string | null },
    private contentLength: number,
  ) {}

  /** @internal */
  read(size: number, outbuf?: string): string | null {
    if (this.cursor >= this.contentLength) return null;

    const left = this.contentLength - this.cursor;

    const str = left < size ? this.io.read(left, outbuf) : this.io.read(size, outbuf);
    if (str) {
      this.cursor += new TextEncoder().encode(str).length;
    } else {
      throw new EmptyContentError("bad content body");
    }
    return str;
  }
}

// ── StringScanner equivalent ──────────────────────────────────────────────────

class SBuf {
  private s: string;
  private p = 0;
  private lm: RegExpExecArray | null = null;
  constructor(s: string) {
    this.s = s;
  }
  get pos() {
    return this.p;
  }
  set pos(v: number) {
    this.p = v;
  }
  get rest() {
    return this.s.slice(this.p);
  }
  get restSize() {
    return this.s.length - this.p;
  }
  get eos() {
    return this.p >= this.s.length;
  }
  peek(n: number) {
    return this.s.slice(this.p, this.p + n);
  }
  concat(s: string) {
    this.s += s;
  }
  terminate() {
    this.p = this.s.length;
  }
  set string(s: string) {
    this.s = s;
    this.p = 0;
  }
  cap(i: number) {
    return this.lm?.[i] ?? "";
  }
  scanUntil(re: RegExp): string | null {
    const sub = this.s.slice(this.p),
      m = re.exec(sub);
    if (!m) {
      this.lm = null;
      return null;
    }
    this.lm = m;
    const end = m.index + m[0].length;
    this.p += end;
    return sub.slice(0, end);
  }
  checkUntil(re: RegExp): string | null {
    const sub = this.s.slice(this.p),
      m = re.exec(sub);
    if (!m) {
      this.lm = null;
      return null;
    }
    this.lm = m;
    return sub.slice(0, m.index + m[0].length);
  }
}

// ── Collector ─────────────────────────────────────────────────────────────────

/** @internal */
export abstract class MimePart {
  constructor(
    public body: any,
    public head: string,
    public filename: string | null | undefined,
    public contentType: string | null | undefined,
    public name: string,
  ) {}

  /** @internal */
  abstract isFile(): boolean;

  /** @internal */
  abstract close(): void;

  /** @internal */
  getData(cb: (data: any) => void): void {
    let data: any = this.body;
    if (this.filename === "") {
      // filename is blank which means no file has been selected
      return;
    } else if (this.filename != null) {
      if (typeof this.body?.rewind === "function") this.body.rewind();

      // Take the basename of the upload's original filename.
      // This handles the full Windows paths given by Internet Explorer
      // (and perhaps other broken user agents) without affecting
      // those which give the lone filename.
      const fn = this.filename.split(/[/\\]/).at(-1) ?? "";

      data = {
        filename: fn,
        type: this.contentType,
        name: this.name,
        tempfile: this.body,
        head: this.head,
      };
    }

    cb(data);
  }
}

/** @internal */
export class BufferPart extends MimePart {
  /** @internal */
  isFile(): boolean {
    return false;
  }
  /** @internal */
  close(): void {}
}

/** @internal */
export class TempfilePart extends MimePart {
  /** @internal */
  isFile(): boolean {
    return true;
  }
  /** @internal */
  close(): void {
    this.body.close();
  }
}

/** @internal */
export class Collector {
  private mimeParts: MimePart[] = [];
  private openFiles = 0;
  constructor(private tempfile: ((filename: string, contentType: string) => any) | null) {}

  /** @internal */
  each(cb: (part: MimePart) => void) {
    this.mimeParts.forEach((part) => cb(part));
  }

  /** @internal */
  findAll(predicate: (part: MimePart) => boolean): MimePart[] {
    return this.mimeParts.filter((part) => predicate(part));
  }

  /** @internal */
  onMimeHead(
    mimeIndex: number,
    head: string,
    filename: string | null | undefined,
    contentType: string | null | undefined,
    name: string,
  ) {
    let body: any;
    let klass: typeof BufferPart | typeof TempfilePart;
    if (filename != null) {
      body = this.tempfile!(filename, contentType ?? "");
      if (typeof body?.binmode === "function") body.binmode();
      klass = TempfilePart;
      this.openFiles += 1;
    } else {
      body = "";
      klass = BufferPart;
    }

    this.mimeParts[mimeIndex] = new klass(body, head, filename, contentType, name);

    this.checkPartLimits();
  }

  /** @internal */
  onMimeBody(mimeIndex: number, content: string) {
    const part = this.mimeParts[mimeIndex];
    if (typeof part.body === "string") part.body += content;
    else if (typeof part.body?.write === "function") part.body.write(content);
  }

  /** @internal */
  onMimeFinish(_mimeIndex: number) {}

  /** @internal */
  private checkPartLimits() {
    const fileLimit = getMultipartFileLimit();
    const partLimit = getMultipartTotalPartLimit();

    if (fileLimit > 0) {
      if (this.openFiles >= fileLimit) {
        this.mimeParts.forEach((part) => part.close());
        throw new MultipartPartLimitError("Maximum file multiparts in content reached");
      }
    }

    if (partLimit > 0) {
      if (this.mimeParts.length >= partLimit) {
        this.mimeParts.forEach((part) => part.close());
        throw new MultipartTotalPartLimitError("Maximum total multiparts in content reached");
      }
    }
  }
}

// ── Parser ────────────────────────────────────────────────────────────────────

type State = "FAST_FORWARD" | "CONSUME_TOKEN" | "MIME_HEAD" | "MIME_BODY" | "DONE";
const CONTENT_DISPOSITION_MAX_PARAMS = 16;
const CONTENT_DISPOSITION_MAX_BYTES = 1536;

export class Parser {
  static readonly BUFSIZE = 1_048_576;
  static readonly TEXT_PLAIN = "text/plain";
  /** @internal */ state: State = "FAST_FORWARD";
  private queryParser: QueryParser;
  private params: ReturnType<QueryParser["makeParams"]>;
  private bufsize: number;
  private mimeIndex = 0;
  private collector: Collector;
  private sbuf: SBuf;
  private bodyRegex: RegExp;
  private bodyRegexAtEnd: RegExp;
  private endBoundarySize: number;
  private rxMaxSize: number;
  private headRegex: RegExp;

  static parseBoundary(contentType: string | null | undefined): string | null {
    if (!contentType) return null;
    const data = MULTIPART.exec(contentType);
    if (!data) return null;
    return data[1];
  }

  static parse(
    io: { read(n: number): string | null },
    contentLength: number | null,
    contentType: string | null | undefined,
    tmpfile: ((filename: string, contentType: string) => any) | null,
    bufsize: number,
    qp: QueryParser,
  ): MultipartInfo {
    if (contentLength === 0) return EMPTY;
    const boundary = Parser.parseBoundary(contentType);
    if (!boundary) return EMPTY;
    if (boundary.length > 70)
      // RFC 1521 Section 7.2.1 imposes a 70 character maximum for the boundary.
      // Most clients use no more than 55 characters.
      throw new BoundaryTooLongError(
        `multipart boundary size too large (${boundary.length} characters)`,
      );
    if (contentLength != null) io = new BoundedIO(io, contentLength);
    const parser = new Parser(boundary, tmpfile, bufsize, qp);
    parser.parse(io);
    return parser.result();
  }

  constructor(
    boundary: string,
    tmpfile: ((filename: string, contentType: string) => any) | null,
    bufsize: number,
    queryParser: QueryParser,
  ) {
    this.queryParser = queryParser;
    this.params = queryParser.makeParams();
    this.bufsize = bufsize;
    this.collector = new Collector(tmpfile);
    this.sbuf = new SBuf("");
    const qb = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    this.bodyRegex = new RegExp(`(?:${EOL}|^)--${qb}(?:${EOL}|--)`, "s");
    this.bodyRegexAtEnd = new RegExp(`(?:${EOL}|^)--${qb}(?:${EOL}|--)$`, "s");
    this.endBoundarySize = boundary.length + 4;
    this.rxMaxSize = boundary.length + 6;
    this.headRegex = new RegExp(`(.*?${EOL})${EOL}`, "s");
  }

  parse(io: { read(n: number, outbuf?: string): string | null }) {
    const outbuf = "";
    this.readData(io, outbuf);
    while (true) {
      let s: void | "want_read";
      if (this.state === "FAST_FORWARD") s = this.handleFastForward();
      else if (this.state === "CONSUME_TOKEN") s = this.handleConsumeToken();
      else if (this.state === "MIME_HEAD") s = this.handleMimeHead();
      else if (this.state === "MIME_BODY") s = this.handleMimeBody();
      else return;
      if (s === "want_read") this.readData(io, outbuf);
    }
  }

  result(): MultipartInfo {
    this.collector.each((part) =>
      part.getData((data) => {
        this.tagMultipartEncoding(part.filename, part.contentType, part.name, data);
        this.queryParser.normalizeParams(this.params, part.name, data);
      }),
    );
    return {
      params: this.params.toParamsHash(),
      tmpFiles: this.collector.findAll((part) => part.isFile()).map((part) => part.body),
    };
  }

  /** @internal From WEBrick::HTTPUtils */
  dequote(str: string): string {
    const m = /^"(.*)"$/.exec(str);
    return (m ? m[1] : str).replace(/\\(.)/g, "$1");
  }

  /** @internal */ private readData(
    io: { read(n: number, outbuf?: string): string | null },
    outbuf: string,
  ) {
    const content = io.read(this.bufsize, outbuf);
    this.handleEmptyContentBang(content);
    this.sbuf.concat(content!);
  }

  /** @internal */ private handleFastForward(): void | "want_read" {
    while (true) {
      const t = this.consumeBoundary();
      if (t === "BOUNDARY") {
        this.state = "MIME_HEAD";
        return;
      }
      if (t === "END_BOUNDARY") {
        if (this.sbuf.pos === this.endBoundarySize && this.sbuf.rest === EOL) {
          this.state = "DONE";
          return;
        }
      } else return "want_read";
    }
  }

  /** @internal */ private handleConsumeToken() {
    const t = this.consumeBoundary();
    this.state = t === "END_BOUNDARY" || (this.sbuf.eos && t !== "BOUNDARY") ? "DONE" : "MIME_HEAD";
  }

  /** @internal */ private handleMimeHead(): void | "want_read" {
    if (!this.sbuf.scanUntil(this.headRegex)) return "want_read";
    const head = this.sbuf.cap(1),
      contentType = MULTIPART_CONTENT_TYPE.exec(head)?.[1] ?? null;
    let name: string | undefined, filename: string | undefined, filenameStar: string | undefined;
    const dispositionMatch = MULTIPART_CONTENT_DISPOSITION.exec(head);
    if (dispositionMatch && dispositionMatch[1].length <= CONTENT_DISPOSITION_MAX_BYTES) {
      const params = this.parseDispositionParams(dispositionMatch[1]);
      name = params.name;
      filename = params.filename;
      filenameStar = params.filenameStar;
    } else {
      const contentId = MULTIPART_CONTENT_ID.exec(head);
      if (contentId) name = contentId[1];
    }
    if (filenameStar) filename = this.normalizeFilename(filenameStar.split("'", 3)[2] ?? "");
    else if (filename != null) filename = this.normalizeFilename(filename);
    if (!name) name = filename ?? `${contentType ?? Parser.TEXT_PLAIN}[]`;
    this.collector.onMimeHead(this.mimeIndex, head, filename, contentType, name);
    this.state = "MIME_BODY";
  }

  /** @internal */ private handleMimeBody(): void | "want_read" {
    const bodyWithBoundary = this.sbuf.checkUntil(this.bodyRegex);
    if (bodyWithBoundary != null) {
      const body = bodyWithBoundary.replace(this.bodyRegexAtEnd, "");
      this.collector.onMimeBody(this.mimeIndex, body);
      this.sbuf.pos += body.length + 2;
      this.state = "CONSUME_TOKEN";
      this.mimeIndex++;
    } else {
      if (this.rxMaxSize < this.sbuf.restSize) {
        const delta = this.sbuf.restSize - this.rxMaxSize;
        this.collector.onMimeBody(this.mimeIndex, this.sbuf.peek(delta));
        this.sbuf.pos += delta;
        this.sbuf.string = this.sbuf.rest;
      }
      return "want_read";
    }
  }

  /** @internal */ private consumeBoundary(): "BOUNDARY" | "END_BOUNDARY" | null {
    const r = this.sbuf.scanUntil(this.bodyRegex);
    if (r) return r.endsWith(EOL) ? "BOUNDARY" : "END_BOUNDARY";
    this.sbuf.terminate();
    return null;
  }
  /** @internal */ private normalizeFilename(filename: string): string {
    if (!/%(?![0-9a-fA-F]{2})/.test(filename)) {
      try {
        filename = unescapePath(filename);
      } catch {
        /* keep as-is for malformed UTF-8 sequences */
      }
    }
    return filename.split(/[/\\]/).at(-1) ?? "";
  }
  /** @internal */ private tagMultipartEncoding(
    _filename: string | null | undefined,
    _contentType: string | null | undefined,
    _name: string,
    _body: any,
  ) {}
  /** @internal */ private findEncoding(enc: string | null | undefined): string {
    return enc ?? "UTF-8";
  }
  /** @internal */ private handleEmptyContentBang(content: string | null | undefined) {
    if (!content) throw new EmptyContentError();
  }

  private parseDispositionParams(raw: string): {
    name?: string;
    filename?: string;
    filenameStar?: string;
  } {
    const si = raw.indexOf(";");
    if (si < 0) return {};
    let pos = si + 1,
      name: string | undefined,
      filename: string | undefined,
      filenameStar: string | undefined,
      np = 0;
    while (pos < raw.length) {
      const ei = raw.indexOf("=", pos);
      if (ei < 0 || ++np > CONTENT_DISPOSITION_MAX_PARAMS) break;
      const pn = raw.slice(pos, ei).trim().toLowerCase();
      pos = ei + 1;
      let v = "";
      if (raw[pos] === '"') {
        pos++;
        while (pos < raw.length) {
          const qi = raw.indexOf('"', pos),
            bi = raw.indexOf("\\", pos);
          if (bi >= 0 && (qi < 0 || bi < qi)) {
            v += raw.slice(pos, bi);
            pos = bi + 1;
            const e = raw[pos] ?? "";
            pos++;
            v += pn === "filename" && e !== '"' ? "\\" + e : e;
          } else if (qi >= 0) {
            v += raw.slice(pos, qi);
            pos = qi + 1;
            break;
          } else {
            v += raw.slice(pos);
            pos = raw.length;
            break;
          }
        }
      } else {
        const nsi = raw.indexOf(";", pos);
        if (nsi >= 0) {
          v = raw.slice(pos, nsi);
          pos = nsi;
        } else {
          v = raw.slice(pos).trim();
          pos = raw.length;
        }
      }
      if (pn === "name") name = v;
      else if (pn === "filename") filename = v;
      else if (pn === "filename*") filenameStar = v;
      const ns = raw.indexOf(";", pos);
      if (ns >= 0) pos = ns + 1;
      else break;
    }
    return { name, filename, filenameStar };
  }
}
