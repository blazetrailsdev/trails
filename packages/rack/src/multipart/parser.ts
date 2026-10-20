import {
  ArgumentError,
  EOFError,
  Encoding,
  Errno,
  File,
  forceEncoding,
  include,
  NoMethodError,
  rbObjDup,
  Tempfile,
} from "@blazetrails/ruby-compat";
import { BadRequest } from "../bad-request.js";
import { QueryParser } from "../query-parser.js";
import { multipartFileLimit, multipartTotalPartLimit, unescapePath } from "../utils.js";

export class MultipartPartLimitError extends Errno.EMFILE {
  constructor(mesg?: string) {
    super(mesg);
    this.name = "MultipartPartLimitError";
  }
}
include(MultipartPartLimitError, BadRequest);
export class MultipartTotalPartLimitError extends Error {
  constructor(message = "Maximum total multiparts in content reached") {
    super(message);
    this.name = "MultipartTotalPartLimitError";
  }
}
include(MultipartTotalPartLimitError, BadRequest);
export class EmptyContentError extends EOFError {
  constructor(message = "bad content body") {
    super(message);
    this.name = "EmptyContentError";
  }
}
include(EmptyContentError, BadRequest);
export class BoundaryTooLongError extends Error {
  constructor(message = "multipart boundary is too long") {
    super(message);
    this.name = "BoundaryTooLongError";
  }
}
include(BoundaryTooLongError, BadRequest);

export const EOL = "\r\n";
export const MULTIPART = /^multipart\/.*boundary="?([^";,]+)"?/i;
export const MULTIPART_CONTENT_TYPE = new RegExp(`Content-Type: (.*)${EOL}`, "i");
export const MULTIPART_CONTENT_DISPOSITION = new RegExp(
  `Content-Disposition:(.*)(?=${EOL}(\\S|$))`,
  "i",
);
export const MULTIPART_CONTENT_ID = new RegExp(`Content-ID:\\s*([^${EOL}]*)`, "i");

export class MultipartInfo {
  params: Record<string, any> | null;
  tmpFiles: any[];

  constructor(params: Record<string, any> | null, tmpFiles: any[]) {
    this.params = params;
    this.tmpFiles = tmpFiles;
  }
}
const EMPTY = new MultipartInfo(null, []);
Object.freeze(EMPTY.tmpFiles);
Object.freeze(EMPTY);

/** @internal */
export class BoundedIO {
  private cursor = 0;
  constructor(
    private io: { read(n: number, outbuf?: string): string | null },
    private contentLength: number,
  ) {}

  read(size: number, outbuf?: string): string | null {
    if (this.cursor >= this.contentLength) return null;

    const left = this.contentLength - this.cursor;

    const str = left < size ? this.io.read(left, outbuf) : this.io.read(size, outbuf);
    if (str) {
      this.cursor += str.length;
    } else {
      throw new EOFError("bad content body");
    }
    return str;
  }
}

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

/** @internal */
export abstract class MimePart {
  constructor(
    public body: any,
    public head: string,
    public filename: string | null | undefined,
    public contentType: string | null | undefined,
    public name: string,
  ) {}

  getData(cb: (data: any) => void): void {
    let data: any = this.body;
    if (this.filename === "") {
      return;
    } else if (this.filename != null) {
      if (typeof this.body?.rewind === "function") this.body.rewind();

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
  isFile(): boolean {
    return false;
  }
  close(): void {}
}

/** @internal */
export class TempfilePart extends MimePart {
  isFile(): boolean {
    return true;
  }
  close(): void {
    this.body.close();
  }
}

/** @internal */
export class Collector {
  private mimeParts: (BufferPart | TempfilePart)[] = [];
  private openFiles = 0;
  constructor(private tempfile: ((filename: string, contentType: string) => any) | null) {}

  each(cb: (part: BufferPart | TempfilePart) => void) {
    this.mimeParts.forEach((part) => cb(part));
  }

  findAll(predicate: (part: BufferPart | TempfilePart) => boolean): (BufferPart | TempfilePart)[] {
    return this.mimeParts.filter((part) => predicate(part));
  }

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

  onMimeBody(mimeIndex: number, content: string) {
    const part = this.mimeParts[mimeIndex];
    if (typeof part.body === "string") part.body += content;
    else if (typeof part.body?.write === "function")
      part.body.write(Uint8Array.from(content, (c) => c.charCodeAt(0)));
  }

  onMimeFinish(_mimeIndex: number) {}

  /** @internal */
  private checkPartLimits() {
    const fileLimit = multipartFileLimit();
    const partLimit = multipartTotalPartLimit();

    if (fileLimit && fileLimit > 0) {
      if (this.openFiles >= fileLimit) {
        this.mimeParts.forEach((part) => part.close());
        throw new MultipartPartLimitError("Maximum file multiparts in content reached");
      }
    }

    if (partLimit && partLimit > 0) {
      if (this.mimeParts.length >= partLimit) {
        this.mimeParts.forEach((part) => part.close());
        throw new MultipartTotalPartLimitError("Maximum total multiparts in content reached");
      }
    }
  }
}

type State = "FAST_FORWARD" | "CONSUME_TOKEN" | "MIME_HEAD" | "MIME_BODY" | "DONE";
const CONTENT_DISPOSITION_MAX_PARAMS = 16;
const CONTENT_DISPOSITION_MAX_BYTES = 1536;

export class Parser {
  static readonly BUFSIZE = 1_048_576;
  static readonly TEXT_PLAIN = "text/plain";
  static readonly TEMPFILE_FACTORY = (filename: string, _contentType: string): Tempfile => {
    const extension = File.extname(filename.replace(/\0/g, "%00")).slice(0, 129);

    return Tempfile.new(["RackMultipart", extension]);
  };
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
      throw new BoundaryTooLongError(
        `multipart boundary size too large (${boundary.length} characters)`,
      );
    if (contentLength != null) io = new BoundedIO(io, contentLength);
    const parser = new Parser(boundary, tmpfile, bufsize, qp);
    parser.parse(io);
    return parser.result();
  }

  /** @missingRailsName dup — PERMANENT */
  constructor(
    boundary: string,
    tempfile: ((filename: string, contentType: string) => any) | null,
    bufsize: number,
    queryParser: QueryParser,
  ) {
    this.queryParser = queryParser;
    this.params = queryParser.makeParams();
    this.bufsize = bufsize;
    this.collector = new Collector(tempfile);
    this.sbuf = new SBuf(rbObjDup(""));
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
        let name: string;
        [name, data] = this.tagMultipartEncoding(part.filename, part.contentType, part.name, data);
        this.queryParser.normalizeParams(this.params, name, data);
      }),
    );
    return new MultipartInfo(
      this.params.toParamsHash(),
      this.collector.findAll((part) => part.isFile()).map((part) => part.body),
    );
  }

  /** @internal */
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
    if (this.sbuf.scanUntil(this.headRegex)) {
      const head = this.sbuf.cap(1);
      const contentType = MULTIPART_CONTENT_TYPE.exec(head)?.[1] ?? null;
      let name: string | undefined, filename: string | undefined, filenameStar: string | undefined;
      let disposition = MULTIPART_CONTENT_DISPOSITION.exec(head)?.[1];
      if (disposition != null && Buffer.byteLength(disposition) <= CONTENT_DISPOSITION_MAX_BYTES) {
        let i = disposition.indexOf(";");
        if (i === -1) throw new NoMethodError("undefined method `+' for nil");
        disposition = disposition.slice(i + 1);
        let param: string;
        let numParams = 0;

        while ((i = disposition.indexOf("=")) !== -1) {
          numParams += 1;
          if (numParams > CONTENT_DISPOSITION_MAX_PARAMS) break;

          param = disposition.slice(0, i + 1);
          disposition = disposition.slice(i + 1);

          param = param.replace(/=$/, "").trimStart();

          let value: string;
          if (disposition[0] === '"') {
            disposition = disposition.slice(1);
            value = "";

            let m: RegExpExecArray | null;
            while ((m = /(["\\])/.exec(disposition))) {
              const c = m[1];
              i = m.index;

              value += disposition.slice(0, i);
              disposition = disposition.slice(i);

              disposition = disposition.slice(1);

              if (c === '"') break;

              const escapedChar = disposition.slice(0, 1);
              disposition = disposition.slice(1);
              if (param === "filename" && escapedChar !== '"') {
                value += c + escapedChar;
              } else {
                value += escapedChar;
              }
            }
          } else {
            if ((i = disposition.indexOf(";")) !== -1) {
              value = disposition.slice(0, i);
              disposition = disposition.slice(i);
            } else {
              disposition = disposition.trim();
              value = disposition;
              disposition = "";
            }
          }

          switch (param) {
            case "name":
              name = value;
              break;
            case "filename":
              filename = value;
              break;
            case "filename*":
              filenameStar = value;
              break;
          }

          if ((i = disposition.indexOf(";")) !== -1) {
            disposition = disposition.slice(i + 1);
          }
        }
      } else {
        name = MULTIPART_CONTENT_ID.exec(head)?.[1];
      }

      if (filenameStar) {
        const first = filenameStar.indexOf("'");
        const second = first === -1 ? -1 : filenameStar.indexOf("'", first + 1);
        const encoding = first === -1 ? filenameStar : filenameStar.slice(0, first);
        filename = second === -1 ? undefined : filenameStar.slice(second + 1);
        filename = this.normalizeFilename(filename || "");
        filename = forceEncoding(filename, this.findEncoding(encoding));
      } else if (filename != null) {
        filename = this.normalizeFilename(filename);
      }

      if (name == null || name.length === 0) {
        name = filename ?? `${contentType ?? Parser.TEXT_PLAIN}[]`;
      }

      this.collector.onMimeHead(this.mimeIndex, head, filename, contentType, name);
      this.state = "MIME_BODY";
    } else {
      return "want_read";
    }
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
        /** @empty */
      }
    }
    return filename.split(/[/\\]/).at(-1) ?? "";
  }
  /** @internal */
  private tagMultipartEncoding(
    filename: string | null | undefined,
    contentType: string | null | undefined,
    name: string,
    body: any,
  ): [string, any] {
    name = String(name);
    let encoding: Encoding | null = Encoding.UTF_8;

    if (filename != null) return [forceEncoding(name, encoding), body];

    if (contentType != null) {
      const list = contentType.split(";");
      const typeSubtype = list[0].trim();
      if (Parser.TEXT_PLAIN === typeSubtype) {
        const rest = list.slice(1);
        for (const param of rest) {
          const eq = param.indexOf("=");
          const k = (eq === -1 ? param : param.slice(0, eq)).trim();
          let v = (eq === -1 ? "" : param.slice(eq + 1)).trim();
          if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
          if (k === "charset") encoding = this.findEncoding(v);
        }
      }
    }

    name = forceEncoding(name, encoding);
    return [name, typeof body === "string" ? forceEncoding(body, encoding) : body];
  }
  /** @internal */
  private findEncoding(enc: string | null | undefined): Encoding | null {
    try {
      return Encoding.find(enc!);
    } catch (error) {
      if (!(error instanceof ArgumentError)) throw error;
      return Encoding.BINARY;
    }
  }
  /** @internal */ private handleEmptyContentBang(content: string | null | undefined) {
    if (!content) throw new EmptyContentError();
  }
}
