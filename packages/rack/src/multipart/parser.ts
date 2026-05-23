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
    private io: { read(n: number): string | null },
    private contentLength: number,
  ) {}

  /** @internal */
  read(size: number, _outbuf?: string): string | null {
    if (this.cursor >= this.contentLength) return null;
    const left = this.contentLength - this.cursor;
    const str = this.io.read(left < size ? left : size);
    if (str) {
      this.cursor += str.length;
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
export class Part {
  isFile = false;
  constructor(
    public body: any,
    public head: string,
    public filename: string | null | undefined,
    public contentType: string | null | undefined,
    public name: string,
  ) {}
  close() {
    if (this.isFile && typeof this.body?.close === "function") this.body.close();
  }
  getData(cb: (d: any) => void) {
    if (this.filename === "") return;
    let d: any = this.body;
    if (this.filename != null) {
      if (typeof this.body?.rewind === "function") this.body.rewind();
      d = {
        filename: this.filename.split(/[/\\]/).at(-1) ?? "",
        type: this.contentType,
        name: this.name,
        tempfile: this.body,
        head: this.head,
      };
    }
    cb(d);
  }
}

/** @internal */
export class Collector {
  private parts: Part[] = [];
  private openFiles = 0;
  constructor(private tf: ((f: string, ct: string) => any) | null) {}

  /** @internal */
  each(cb: (p: Part) => void) {
    this.parts.forEach(cb);
  }

  files() {
    return this.parts.filter((p) => p.isFile);
  }

  /** @internal */
  onMimeHead(
    i: number,
    head: string,
    filename: string | null | undefined,
    ct: string | null | undefined,
    name: string,
  ) {
    const p = new Part("", head, filename, ct, name);
    if (filename != null && this.tf) {
      p.body = this.tf(filename, ct ?? "");
      if (typeof p.body?.binmode === "function") p.body.binmode();
      p.isFile = true;
      this.openFiles++;
    }
    this.parts[i] = p;
    this.checkPartLimits();
  }

  /** @internal */
  onMimeBody(i: number, c: string) {
    const p = this.parts[i];
    if (typeof p.body === "string") p.body += c;
    else if (typeof p.body?.write === "function") p.body.write(c);
  }

  /** @internal */
  onMimeFinish(_i: number) {}

  /** @internal */
  private checkPartLimits() {
    const fl = getMultipartFileLimit(),
      pl = getMultipartTotalPartLimit();
    if (fl > 0 && this.openFiles >= fl) {
      this.parts.forEach((x) => x.close());
      throw new MultipartPartLimitError();
    }
    if (pl > 0 && this.parts.length >= pl) {
      this.parts.forEach((x) => x.close());
      throw new MultipartTotalPartLimitError();
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
  private qp: QueryParser;
  private params: ReturnType<QueryParser["makeParams"]>;
  private bufsize: number;
  private mi = 0;
  private col: Collector;
  private sb: SBuf;
  private bodyRe: RegExp;
  private bodyReEnd: RegExp;
  private endBSz: number;
  private rxMaxSz: number;
  private headRe: RegExp;

  static parseBoundary(ct: string | null | undefined): string | null {
    if (!ct) return null;
    const m = MULTIPART.exec(ct);
    return m ? m[1] : null;
  }

  static parse(
    io: { read(n: number): string | null },
    cl: number | null,
    ct: string | null | undefined,
    tmpfile: ((f: string, ct: string) => any) | null,
    bufsize: number,
    qp: QueryParser,
  ): MultipartInfo {
    if (cl === 0) return EMPTY;
    const b = Parser.parseBoundary(ct);
    if (!b) return EMPTY;
    if (b.length > 70)
      throw new BoundaryTooLongError(`multipart boundary size too large (${b.length} characters)`);
    const boundedIo = cl != null ? new BoundedIO(io, cl) : io;
    const p = new Parser(b, tmpfile, bufsize, qp);
    p.parse(boundedIo);
    return p.result();
  }

  constructor(
    boundary: string,
    tmpfile: ((f: string, ct: string) => any) | null,
    bufsize: number,
    queryParser: QueryParser,
  ) {
    this.qp = queryParser;
    this.params = queryParser.makeParams();
    this.bufsize = bufsize;
    this.col = new Collector(tmpfile);
    this.sb = new SBuf("");
    const qb = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    this.bodyRe = new RegExp(`(?:${EOL}|^)--${qb}(?:${EOL}|--)`, "s");
    this.bodyReEnd = new RegExp(`(?:${EOL}|^)--${qb}(?:${EOL}|--)$`, "s");
    this.endBSz = boundary.length + 4;
    this.rxMaxSz = boundary.length + 6;
    this.headRe = new RegExp(`(.*?${EOL})${EOL}`, "s");
  }

  parse(io: { read(n: number): string | null }) {
    this.readData(io);
    while (true) {
      let s: void | "want_read";
      if (this.state === "FAST_FORWARD") s = this.handleFastForward();
      else if (this.state === "CONSUME_TOKEN") s = this.handleConsumeToken();
      else if (this.state === "MIME_HEAD") s = this.handleMimeHead();
      else if (this.state === "MIME_BODY") s = this.handleMimeBody();
      else return;
      if (s === "want_read") this.readData(io);
    }
  }

  result(): MultipartInfo {
    this.col.each((p) =>
      p.getData((d) => {
        this.tagMultipartEncoding(p.filename, p.contentType, p.name, d);
        this.qp.normalizeParams(this.params, p.name, d);
      }),
    );
    return { params: this.params.toParamsHash(), tmpFiles: this.col.files().map((p) => p.body) };
  }

  /** @internal From WEBrick::HTTPUtils */
  dequote(str: string): string {
    const m = /^"(.*)"$/.exec(str);
    return (m ? m[1] : str).replace(/\\(.)/g, "$1");
  }

  /** @internal */ private readData(io: { read(n: number): string | null }) {
    const c = io.read(this.bufsize);
    this.handleEmptyContentBang(c);
    this.sb.concat(c!);
  }

  /** @internal */ private handleFastForward(): void | "want_read" {
    while (true) {
      const t = this.consumeBoundary();
      if (t === "BOUNDARY") {
        this.state = "MIME_HEAD";
        return;
      }
      if (t === "END_BOUNDARY") {
        if (this.sb.pos === this.endBSz && this.sb.rest === EOL) {
          this.state = "DONE";
          return;
        }
      } else return "want_read";
    }
  }

  /** @internal */ private handleConsumeToken() {
    const t = this.consumeBoundary();
    this.state = t === "END_BOUNDARY" || (this.sb.eos && t !== "BOUNDARY") ? "DONE" : "MIME_HEAD";
  }

  /** @internal */ private handleMimeHead(): void | "want_read" {
    if (!this.sb.scanUntil(this.headRe)) return "want_read";
    const head = this.sb.cap(1),
      ct = MULTIPART_CONTENT_TYPE.exec(head)?.[1] ?? null;
    let name: string | undefined, filename: string | undefined, fstar: string | undefined;
    const dm = MULTIPART_CONTENT_DISPOSITION.exec(head);
    if (dm && dm[1].length <= CONTENT_DISPOSITION_MAX_BYTES) {
      const p = this.parseDispositionParams(dm[1]);
      name = p.name;
      filename = p.filename;
      fstar = p.filenameStar;
    } else {
      const im = MULTIPART_CONTENT_ID.exec(head);
      if (im) name = im[1];
    }
    if (fstar) filename = this.normalizeFilename(fstar.split("'", 3)[2] ?? "");
    else if (filename != null) filename = this.normalizeFilename(filename);
    if (!name) name = filename ?? `${ct ?? Parser.TEXT_PLAIN}[]`;
    this.col.onMimeHead(this.mi, head, filename, ct, name);
    this.state = "MIME_BODY";
  }

  /** @internal */ private handleMimeBody(): void | "want_read" {
    const bwb = this.sb.checkUntil(this.bodyRe);
    if (bwb != null) {
      const body = bwb.replace(this.bodyReEnd, "");
      this.col.onMimeBody(this.mi, body);
      this.sb.pos += body.length + 2;
      this.state = "CONSUME_TOKEN";
      this.mi++;
    } else {
      if (this.rxMaxSz < this.sb.restSize) {
        const d = this.sb.restSize - this.rxMaxSz;
        this.col.onMimeBody(this.mi, this.sb.peek(d));
        this.sb.pos += d;
        this.sb.string = this.sb.rest;
      }
      return "want_read";
    }
  }

  /** @internal */ private consumeBoundary(): "BOUNDARY" | "END_BOUNDARY" | null {
    const r = this.sb.scanUntil(this.bodyRe);
    if (r) return r.endsWith(EOL) ? "BOUNDARY" : "END_BOUNDARY";
    this.sb.terminate();
    return null;
  }
  /** @internal */ private normalizeFilename(fn: string): string {
    if (!/%(?![0-9a-fA-F]{2})/.test(fn)) {
      try {
        fn = unescapePath(fn);
      } catch {
        /* keep as-is for malformed UTF-8 sequences */
      }
    }
    return fn.split(/[/\\]/).at(-1) ?? "";
  }
  /** @internal */ private tagMultipartEncoding(
    _f: string | null | undefined,
    _ct: string | null | undefined,
    _n: string,
    _b: any,
  ) {}
  /** @internal */ private findEncoding(enc: string | null | undefined): string {
    return enc ?? "UTF-8";
  }
  /** @internal */ private handleEmptyContentBang(c: string | null | undefined) {
    if (!c) throw new EmptyContentError();
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
