import { UploadedFile } from "./multipart/uploaded-file.js";
import { Generator } from "./multipart/generator.js";
import { getDefaultQueryParser } from "./utils.js";

export { UploadedFile } from "./multipart/uploaded-file.js";
import {
  MultipartPartLimitError,
  MultipartTotalPartLimitError,
  BoundaryTooLongError,
  EmptyContentError,
} from "./multipart/parser.js";

export {
  MultipartPartLimitError,
  MultipartTotalPartLimitError,
  BoundaryTooLongError,
  EmptyContentError,
} from "./multipart/parser.js";

export class MultipartBufferedMimeDataError extends Error {
  constructor(message = "exceeded buffered MIME data size limit") {
    super(message);
    this.name = "MultipartBufferedMimeDataError";
  }
}

const MULTIPART_TEXT_LIMIT = 64 * 1024;

export class MissingInputError extends Error {
  constructor(message = "bad request: no body") {
    super(message);
    this.name = "MissingInputError";
  }
}

const CONTENT_DISPOSITION_MAX_PARAMS = 16;
const CONTENT_DISPOSITION_MAX_BYTES = 1536;

export interface UploadedFileInfo {
  filename: string;
  type: string;
  name: string;
  tempfile: { read(): string; rewind?(): void; path?: string };
  head: string;
}

interface ParamsCollector {
  toParamsHash(): any;
}

interface QueryParserLike {
  makeParams(): ParamsCollector;
  normalizeParams(params: any, key: string, value: any): void;
}

export function parseMultipart(
  env: Record<string, any>,
  params: QueryParserLike = getDefaultQueryParser() as unknown as QueryParserLike,
): any | null {
  const contentType = env["CONTENT_TYPE"];
  if (!contentType || !contentType.match(/multipart/i)) return null;

  const boundary = parseBoundary(contentType);
  if (!boundary) return null;

  if (boundary.length > 70) {
    throw new BoundaryTooLongError(
      `multipart boundary size too large (${boundary.length} characters)`,
    );
  }

  const input = env["rack.input"] || (env as any)[Symbol.for("rack.input")];
  if (!input) {
    throw new MissingInputError();
  }

  let body: Buffer;
  if (Buffer.isBuffer(input)) {
    body = input;
  } else if (typeof input === "string") {
    body = Buffer.from(input, "binary");
  } else if (typeof input.read === "function") {
    const data = input.read();
    if (
      data === null ||
      data === undefined ||
      (typeof data === "string" && data.length === 0) ||
      (Buffer.isBuffer(data) && data.length === 0)
    ) {
      throw new EmptyContentError();
    }
    body = Buffer.isBuffer(data) ? data : Buffer.from(data, "binary");
  } else {
    throw new MissingInputError();
  }

  if (body.length === 0) {
    throw new EmptyContentError();
  }

  return parseBody(body, boundary, env, params);
}

function parseBoundary(contentType: string): string | null {
  const m = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);
  if (!m) return null;
  return m[1] || m[2];
}

function parseBody(
  body: Buffer,
  boundary: string,
  env: Record<string, any>,
  queryParser: QueryParserLike,
): any {
  const delimiter = Buffer.from("--" + boundary);
  const endDelimiter = Buffer.from("--" + boundary + "--");
  const headerSep = Buffer.from("\r\n\r\n");

  const params = queryParser.makeParams();
  const fileLimit = env._multipart_file_limit || 0;
  const totalLimit = env._multipart_total_limit || 0;
  const textLimit = env._multipart_text_limit ?? MULTIPART_TEXT_LIMIT;
  const tempfileFactory = env["rack.multipart.tempfile_factory"] as
    | ((
        filename: string,
        contentType: string,
      ) => { read(): string; rewind(): void; toString(): string } & Record<string, any>)
    | undefined;
  let fileCount = 0;
  let totalCount = 0;
  let totalTextSize = 0;

  let pos = 0;

  const firstBoundaryIdx = findNextBoundary(body, delimiter, pos);
  if (firstBoundaryIdx === -1) {
    throw new EmptyContentError();
  }

  if (firstBoundaryIdx > 0) {
    const preamble = body.subarray(0, firstBoundaryIdx).toString("binary").trim();
    if (preamble.length > 0) {
      const afterFirst = body.subarray(
        firstBoundaryIdx + delimiter.length,
        firstBoundaryIdx + delimiter.length + 2,
      );
      if (afterFirst.toString() === "--") {
        const nextBoundary = findNextBoundary(
          body,
          delimiter,
          firstBoundaryIdx + endDelimiter.length,
        );
        if (nextBoundary === -1) {
          return params.toParamsHash();
        }
        pos = nextBoundary;
      } else {
        throw new EmptyContentError("bad content body");
      }
    } else {
      pos = firstBoundaryIdx;
    }
  } else {
    pos = firstBoundaryIdx;
  }

  {
    const afterDelim = body.subarray(pos + delimiter.length, pos + delimiter.length + 2);
    if (afterDelim.toString() === "--") {
      const nextBoundary = findNextBoundary(body, delimiter, pos + endDelimiter.length);
      if (nextBoundary === -1) {
        return params.toParamsHash();
      }
      pos = nextBoundary;
    }
  }

  while (pos < body.length) {
    const boundaryEnd = pos + delimiter.length;
    if (boundaryEnd > body.length) break;

    const afterBoundary = body.subarray(boundaryEnd, boundaryEnd + 2);
    const ab = afterBoundary.toString();
    if (ab === "--") {
      break;
    }

    let headStart = boundaryEnd;
    if (body[headStart] === 0x0d && body[headStart + 1] === 0x0a) {
      headStart += 2;
    }

    const headerEndIdx = bufferIndexOf(body, headerSep, headStart);
    if (headerEndIdx === -1) {
      if (headStart >= body.length) break;
      throw new EmptyContentError();
    }

    const headerBuf = body.subarray(headStart, headerEndIdx);
    const headerStr = headerBuf.toString("binary");

    const bodyStart = headerEndIdx + 4;

    const nextBoundaryIdx = findNextBoundary(body, delimiter, bodyStart);
    let bodyEnd: number;
    if (nextBoundaryIdx === -1) {
      throw new EmptyContentError();
    } else {
      bodyEnd = nextBoundaryIdx;
      if (body[bodyEnd - 2] === 0x0d && body[bodyEnd - 1] === 0x0a) {
        bodyEnd -= 2;
      }
    }

    const contentBuf = body.subarray(bodyStart, bodyEnd);

    const headers = parseMimeHeaders(headerStr);
    const disposition = headers["content-disposition"] || "";
    const contentTypeHeader = headers["content-type"] || null;
    const contentId = headers["content-id"] || null;

    let name: string | null = null;
    let filename: string | undefined = undefined;

    if (disposition && disposition.length <= CONTENT_DISPOSITION_MAX_BYTES) {
      const parsed = parseContentDisposition(disposition);
      name = parsed.name || null;
      filename = parsed.filename;
    }

    if (!name || name === "") {
      if (contentId) {
        name = contentId;
      } else if (filename) {
        name = filename;
      } else if (contentTypeHeader) {
        name = contentTypeHeader + "[]";
      }
    }

    if (!name) {
      pos = nextBoundaryIdx === -1 ? body.length : nextBoundaryIdx;
      continue;
    }

    totalCount++;
    if (totalLimit > 0 && totalCount > totalLimit) {
      throw new MultipartTotalPartLimitError();
    }

    if (filename !== undefined) {
      if (filename === "") {
        /** @empty */
      } else {
        fileCount++;
        if (fileLimit > 0 && fileCount > fileLimit) {
          throw new MultipartPartLimitError();
        }

        const normalizedFilename = normalizeFilename(filename);
        const ctype = contentTypeHeader || "application/octet-stream";

        let tempfile: any;
        if (tempfileFactory) {
          tempfile = tempfileFactory(normalizedFilename, ctype);
          const content = contentBuf.toString("binary");
          if (typeof tempfile.write === "function") {
            tempfile.write(content);
          }
        } else {
          tempfile = makeTempfile(contentBuf);
        }

        const fileInfo: UploadedFileInfo = {
          filename: normalizedFilename,
          type: ctype,
          name,
          tempfile,
          head: headerStr + "\r\n",
        };

        queryParser.normalizeParams(params, name, fileInfo);
      }
    } else {
      let _encoding = "utf-8";
      if (contentTypeHeader) {
        const charsetMatch = contentTypeHeader.match(/charset=(?:"([^"]+)"|([^\s;]+))/i);
        if (charsetMatch) {
          _encoding = (charsetMatch[1] || charsetMatch[2]).toLowerCase();
        }
      }

      const textValue = contentBuf.toString("utf-8");

      if (textLimit > 0) {
        totalTextSize += contentBuf.length;
        if (contentBuf.length > textLimit || totalTextSize > textLimit) {
          throw new MultipartBufferedMimeDataError();
        }
      }

      queryParser.normalizeParams(params, name, textValue);
    }

    pos = nextBoundaryIdx === -1 ? body.length : nextBoundaryIdx;
  }

  return params.toParamsHash();
}

function makeTempfile(buf: Buffer): { read(): string; rewind(): void } {
  let pos = 0;
  return {
    read(): string {
      const result = buf.subarray(pos).toString("binary");
      pos = buf.length;
      return result;
    },
    rewind(): void {
      pos = 0;
    },
  };
}

function normalizeFilename(filename: string): string {
  const percentSequences = filename.match(/%..?/g);
  if (percentSequences && percentSequences.every((s) => /^%[0-9a-fA-F]{2}$/.test(s))) {
    try {
      filename = decodeURIComponent(filename);
    } catch {
      /** @empty */
    }
  }

  const parts = filename.split(/[/\\]/);
  return parts[parts.length - 1] || "";
}

function parseMimeHeaders(headerStr: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const unfolded = headerStr.replace(/\r\n([ \t])/g, " ");
  for (const line of unfolded.split("\r\n")) {
    if (!line) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.substring(0, colonIdx).trim().toLowerCase();
    const val = line.substring(colonIdx + 1).trim();
    headers[key] = val;
  }
  return headers;
}

function parseContentDisposition(disposition: string): { name?: string; filename?: string } {
  let name: string | undefined;
  let filename: string | undefined;

  const semiIdx = disposition.indexOf(";");
  if (semiIdx === -1) return {};

  let rest = disposition.substring(semiIdx + 1);
  let numParams = 0;

  while (rest.length > 0) {
    const eqIdx = rest.indexOf("=");
    if (eqIdx === -1) break;

    numParams++;
    if (numParams > CONTENT_DISPOSITION_MAX_PARAMS) break;

    const paramName = rest.substring(0, eqIdx).trim();
    rest = rest.substring(eqIdx + 1);

    let value: string;

    if (rest.startsWith('"')) {
      rest = rest.substring(1);
      value = "";

      while (rest.length > 0) {
        const nextSpecial = rest.search(/["\\]/);
        if (nextSpecial === -1) {
          value += rest;
          rest = "";
          break;
        }

        value += rest.substring(0, nextSpecial);
        const ch = rest[nextSpecial];
        rest = rest.substring(nextSpecial + 1);

        if (ch === '"') {
          break;
        }

        if (rest.length > 0) {
          const escapedChar = rest[0];
          rest = rest.substring(1);
          if (paramName === "filename" && escapedChar !== '"') {
            value += ch + escapedChar;
          } else {
            value += escapedChar;
          }
        }
      }
    } else {
      const nextSemi = rest.indexOf(";");
      if (nextSemi !== -1) {
        value = rest.substring(0, nextSemi);
        rest = rest.substring(nextSemi);
      } else {
        value = rest.trim();
        rest = "";
      }
    }

    if (paramName === "name") {
      name = value;
    } else if (paramName === "filename") {
      filename = value;
    }

    const nextSemiIdx = rest.indexOf(";");
    if (nextSemiIdx !== -1) {
      rest = rest.substring(nextSemiIdx + 1);
    } else {
      rest = "";
    }
  }

  return { name, filename };
}

function bufferIndexOf(haystack: Buffer, needle: Buffer, fromIndex: number): number {
  return haystack.indexOf(needle, fromIndex);
}

function findNextBoundary(body: Buffer, delimiter: Buffer, fromIndex: number): number {
  let pos = fromIndex;
  while (pos < body.length) {
    const idx = body.indexOf(delimiter, pos);
    if (idx === -1) return -1;
    const afterIdx = idx + delimiter.length;
    if (afterIdx >= body.length) return idx;
    const b0 = body[afterIdx];
    const b1 = afterIdx + 1 < body.length ? body[afterIdx + 1] : -1;
    if ((b0 === 0x0d && b1 === 0x0a) || (b0 === 0x2d && b1 === 0x2d)) {
      return idx;
    }
    pos = idx + 1;
  }
  return -1;
}

export class MultipartParser {
  static parse(
    input: string | Buffer,
    contentType: string,
    opts: Record<string, any> = {},
  ): Record<string, any> | null {
    if (!contentType || !contentType.match(/multipart/i)) return null;

    const boundary = parseBoundary(contentType);
    if (!boundary) return null;

    if (boundary.length > 70) {
      throw new BoundaryTooLongError(
        `multipart boundary size too large (${boundary.length} characters)`,
      );
    }

    const body = typeof input === "string" ? Buffer.from(input, "binary") : input;
    if (!body || body.length === 0) {
      throw new MissingInputError();
    }

    const env: Record<string, any> = {
      CONTENT_TYPE: contentType,
      "rack.input": {
        read() {
          return body;
        },
      },
      _multipart_file_limit: opts.multipart_file_limit || 0,
      _multipart_total_limit: opts.multipart_total_limit || 0,
    };

    return parseBody(body, boundary, env, getDefaultQueryParser() as unknown as QueryParserLike);
  }

  static buildMultipartBody(params: Record<string, any>): { body: string; boundary: string } {
    const boundary = "AaB03x";
    const parts: string[] = [];

    function addParts(prefix: string, value: any): void {
      if (value && typeof value === "object" && value.filename) {
        const content = typeof value.read === "function" ? value.read() : value.content || "";
        parts.push(
          `--${boundary}\r\n` +
            `content-disposition: form-data; name="${prefix}"; filename="${value.filename}"\r\n` +
            `content-type: ${value.type || value.contentType || "application/octet-stream"}\r\n\r\n` +
            content +
            "\r\n",
        );
      } else if (value instanceof UploadedFile) {
        const content = value.read();
        parts.push(
          `--${boundary}\r\n` +
            `content-disposition: form-data; name="${prefix}"; filename="${value.filename}"\r\n` +
            `content-type: ${value.contentType}\r\n\r\n` +
            content +
            "\r\n",
        );
      } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (typeof item === "object" && item !== null && !(item instanceof Buffer)) {
            for (const [k, v] of Object.entries(item)) {
              addParts(`${prefix}[][${k}]`, v);
            }
          } else {
            parts.push(
              `--${boundary}\r\n` +
                `content-disposition: form-data; name="${prefix}[]"\r\n\r\n` +
                String(item) +
                "\r\n",
            );
          }
        }
      } else if (typeof value === "object" && value !== null && !(value instanceof Buffer)) {
        for (const [k, v] of Object.entries(value)) {
          addParts(`${prefix}[${k}]`, v);
        }
      } else {
        parts.push(
          `--${boundary}\r\n` +
            `content-disposition: form-data; name="${prefix}"\r\n\r\n` +
            String(value) +
            "\r\n",
        );
      }
    }

    for (const [key, value] of Object.entries(params)) {
      addParts(key, value);
    }

    parts.push(`--${boundary}--\r\n`);
    return { body: parts.join(""), boundary };
  }
}

export class ParamList {
  private _pairs: [string, unknown][] = [];

  static makeParams(): ParamList {
    return new ParamList();
  }

  static normalizeParams(params: ParamList, key: string, value: unknown): void {
    params._pairs.push([key, value]);
  }

  push(pair: [string, unknown]): void {
    this._pairs.push(pair);
  }

  toParamsHash(): [string, unknown][] {
    return this._pairs;
  }
}

export function extractMultipart(
  request: { env: Record<string, any> },
  _params: QueryParserLike = getDefaultQueryParser() as unknown as QueryParserLike,
): any | null {
  return parseMultipart(request.env);
}

export function buildMultipart(
  params: unknown,
  first: boolean = true,
): string | Record<string, unknown> | null {
  return new Generator(params, first).dump();
}

export const Multipart = {
  parseMultipart,
  parseBoundary,
  extractMultipart,
  buildMultipart,
  ParamList,
  MultipartParser,
  UploadedFile,
  BoundaryTooLongError,
  EmptyContentError,
  MissingInputError,
  MultipartPartLimitError,
  MultipartTotalPartLimitError,
  MultipartBufferedMimeDataError,
};
