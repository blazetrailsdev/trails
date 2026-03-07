import { parseNestedQuery } from "./utils.js";

export class MultipartPartLimitError extends Error {
  constructor(message = "exceeded multipart part limit") {
    super(message);
    this.name = "MultipartPartLimitError";
  }
}

export class MultipartTotalPartLimitError extends Error {
  constructor(message = "exceeded multipart total part limit") {
    super(message);
    this.name = "MultipartTotalPartLimitError";
  }
}

export class BoundaryTooLongError extends Error {
  constructor(message = "multipart boundary is too long") {
    super(message);
    this.name = "BoundaryTooLongError";
  }
}

export class EmptyContentError extends Error {
  constructor(message = "bad content body") {
    super(message);
    this.name = "EmptyContentError";
  }
}

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

/**
 * Parse a multipart/form-data body.
 *
 * The `env` object should have:
 *   CONTENT_TYPE - the multipart content type with boundary
 *   CONTENT_LENGTH - content length (optional)
 *   rack.input - an object with a read() method returning the body
 *
 * Returns a params hash (possibly nested via query-string normalization),
 * or null if the content type is not multipart.
 */
export function parseMultipart(env: Record<string, any>): Record<string, any> | null {
  const contentType = env["CONTENT_TYPE"];
  if (!contentType || !contentType.match(/multipart/i)) return null;

  const boundary = parseBoundary(contentType);
  if (!boundary) return null;

  if (boundary.length > 70) {
    throw new BoundaryTooLongError(`multipart boundary size too large (${boundary.length} characters)`);
  }

  const input = env["rack.input"] || env[Symbol.for("rack.input")];
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
    if (data === null || data === undefined || (typeof data === "string" && data.length === 0) || (Buffer.isBuffer(data) && data.length === 0)) {
      throw new EmptyContentError();
    }
    body = Buffer.isBuffer(data) ? data : Buffer.from(data, "binary");
  } else {
    throw new MissingInputError();
  }

  if (body.length === 0) {
    throw new EmptyContentError();
  }

  return parseBody(body, boundary, env);
}

function parseBoundary(contentType: string): string | null {
  const m = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);
  if (!m) return null;
  return m[1] || m[2];
}

function parseBody(body: Buffer, boundary: string, env: Record<string, any>): Record<string, any> {
  const delimiter = Buffer.from("--" + boundary);
  const endDelimiter = Buffer.from("--" + boundary + "--");
  const crlf = Buffer.from("\r\n");
  const headerSep = Buffer.from("\r\n\r\n");

  const params: Record<string, any> = {};
  const fileLimit = env._multipart_file_limit || 0;
  const totalLimit = env._multipart_total_limit || 0;
  let fileCount = 0;
  let totalCount = 0;

  // Find all boundary positions
  let pos = 0;

  // Skip any preamble - find first boundary
  const firstBoundaryIdx = bufferIndexOf(body, delimiter, pos);
  if (firstBoundaryIdx === -1) {
    throw new BoundaryTooLongError("multipart boundary not found within limit");
  }

  // Check for preceding data (invalid)
  if (firstBoundaryIdx > 0) {
    const preamble = body.subarray(0, firstBoundaryIdx).toString("binary").trim();
    if (preamble.length > 0) {
      // Check if the first boundary is actually an end boundary
      const afterFirst = body.subarray(firstBoundaryIdx + delimiter.length, firstBoundaryIdx + delimiter.length + 2);
      if (afterFirst.toString() === "--") {
        // End boundary first - look for a real opening boundary after it
        const nextBoundary = bufferIndexOf(body, delimiter, firstBoundaryIdx + endDelimiter.length);
        if (nextBoundary === -1) {
          // Only had end boundary
          return params;
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

  // Check if first boundary is an end boundary
  {
    const afterDelim = body.subarray(pos + delimiter.length, pos + delimiter.length + 2);
    if (afterDelim.toString() === "--") {
      // End boundary first - look for opening boundary after
      const nextBoundary = bufferIndexOf(body, delimiter, pos + endDelimiter.length);
      if (nextBoundary === -1) {
        return params;
      }
      pos = nextBoundary;
    }
  }

  while (pos < body.length) {
    // We should be at a boundary
    const boundaryEnd = pos + delimiter.length;
    if (boundaryEnd > body.length) break;

    // Check what follows boundary
    const afterBoundary = body.subarray(boundaryEnd, boundaryEnd + 2);
    const ab = afterBoundary.toString();
    if (ab === "--") {
      break; // end boundary
    }

    // Skip \r\n after boundary
    let headStart = boundaryEnd;
    if (body[headStart] === 0x0d && body[headStart + 1] === 0x0a) {
      headStart += 2;
    }

    // Find header/body separator
    const headerEndIdx = bufferIndexOf(body, headerSep, headStart);
    if (headerEndIdx === -1) break;

    const headerBuf = body.subarray(headStart, headerEndIdx);
    const headerStr = headerBuf.toString("binary");

    const bodyStart = headerEndIdx + 4;

    // Find next boundary
    const nextBoundaryIdx = bufferIndexOf(body, delimiter, bodyStart);
    let bodyEnd: number;
    if (nextBoundaryIdx === -1) {
      bodyEnd = body.length;
    } else {
      // Body ends before the \r\n preceding the boundary
      bodyEnd = nextBoundaryIdx;
      if (body[bodyEnd - 2] === 0x0d && body[bodyEnd - 1] === 0x0a) {
        bodyEnd -= 2;
      }
    }

    const contentBuf = body.subarray(bodyStart, bodyEnd);

    // Parse headers
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
      // Fall back to content-id or content-type
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
        // Empty filename means no file selected - skip
      } else {
        fileCount++;
        if (fileLimit > 0 && fileCount > fileLimit) {
          throw new MultipartPartLimitError();
        }

        const normalizedFilename = normalizeFilename(filename);
        const tempContent = contentBuf.toString("binary");

        const fileInfo: UploadedFileInfo = {
          filename: normalizedFilename,
          type: contentTypeHeader || "application/octet-stream",
          name,
          tempfile: makeTempfile(contentBuf),
          head: headerStr + "\r\n",
        };

        normalizeAndSet(params, name, fileInfo);
      }
    } else {
      // Text field
      let encoding = "utf-8";
      if (contentTypeHeader) {
        const charsetMatch = contentTypeHeader.match(/charset=(?:"([^"]+)"|([^\s;]+))/i);
        if (charsetMatch) {
          encoding = (charsetMatch[1] || charsetMatch[2]).toLowerCase();
        }
      }

      const textValue = contentBuf.toString("utf-8");
      normalizeAndSet(params, name, textValue);
    }

    pos = nextBoundaryIdx === -1 ? body.length : nextBoundaryIdx;
  }

  return params;
}

function normalizeAndSet(params: Record<string, any>, name: string, value: any): void {
  // Use nested query normalization for bracket notation
  if (name.includes("[")) {
    // Simple nested assignment
    const match = name.match(/^([^\[]+)((?:\[[^\]]*\])*)$/);
    if (match) {
      const prefix = match[1];
      const brackets = match[2];
      if (!brackets) {
        params[prefix] = value;
      } else {
        const keys = brackets.match(/\[([^\]]*)\]/g)!.map(b => b.slice(1, -1));
        let current = params;
        if (!(prefix in current) || typeof current[prefix] !== "object") {
          current[prefix] = {};
        }
        current = current[prefix];
        for (let i = 0; i < keys.length - 1; i++) {
          const k = keys[i];
          if (!(k in current) || typeof current[k] !== "object") {
            current[k] = {};
          }
          current = current[k];
        }
        current[keys[keys.length - 1]] = value;
      }
    } else {
      params[name] = value;
    }
  } else {
    params[name] = value;
  }
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
  // If all % sequences are valid hex escapes, decode them
  const percentSequences = filename.match(/%..?/g);
  if (percentSequences && percentSequences.every(s => /^%[0-9a-fA-F]{2}$/.test(s))) {
    try {
      filename = decodeURIComponent(filename);
    } catch {
      // keep as-is if decode fails
    }
  }

  // Strip IE full paths - take last component after / or \
  const parts = filename.split(/[\/\\]/);
  return parts[parts.length - 1] || "";
}

function parseMimeHeaders(headerStr: string): Record<string, string> {
  const headers: Record<string, string> = {};
  // Handle folded headers (continuation lines)
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

/**
 * Parse Content-Disposition header value with full Ruby Rack compatibility.
 * Handles quoted values with backslash escaping, unquoted values,
 * semicolons in values, IE paths, etc.
 */
function parseContentDisposition(disposition: string): { name?: string; filename?: string } {
  let name: string | undefined;
  let filename: string | undefined;

  // Skip "form-data" or "attachment" type
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
      // Quoted value - parse with backslash escape handling
      rest = rest.substring(1); // skip opening quote
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
          break; // end of quoted value
        }

        // Backslash escape
        if (rest.length > 0) {
          const escapedChar = rest[0];
          rest = rest.substring(1);
          if (paramName === "filename" && escapedChar !== '"') {
            // IE uploaded filename: keep backslash and char
            value += ch + escapedChar;
          } else {
            value += escapedChar;
          }
        }
      }
    } else {
      // Unquoted value
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
    // ignore filename* and other params (prefer filename over filename*)

    // Skip to next semicolon
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

// --- Generator / Builder API ---

export class UploadedFile {
  path: string | null;
  private _io: any;
  filename: string;
  contentType: string;
  private _binary: boolean;

  constructor(pathOrOpts: string | { io: any; filename: string; content_type?: string }, opts: { binary?: boolean; content_type?: string } = {}) {
    if (typeof pathOrOpts === "string") {
      const fs = require("fs");
      if (!fs.existsSync(pathOrOpts)) {
        throw new Error(`no such file to load -- ${pathOrOpts}`);
      }
      this.path = pathOrOpts;
      this._io = null;
      this.filename = require("path").basename(pathOrOpts);
      this.contentType = opts.content_type || "text/plain";
      this._binary = opts.binary || false;
    } else {
      this.path = null;
      this._io = pathOrOpts.io;
      this.filename = pathOrOpts.filename;
      this.contentType = pathOrOpts.content_type || "text/plain";
      this._binary = false;
    }
  }

  read(): string {
    if (this._io) {
      if (typeof this._io.read === "function") return this._io.read();
      return String(this._io);
    }
    if (this.path) {
      const fs = require("fs");
      return fs.readFileSync(this.path, this._binary ? undefined : "utf-8");
    }
    return "";
  }

  get binmode(): boolean {
    return this._binary;
  }
}

export class MultipartParser {
  static parse(input: string | Buffer, contentType: string, opts: Record<string, any> = {}): Record<string, any> | null {
    if (!contentType || !contentType.match(/multipart/i)) return null;

    const boundary = parseBoundary(contentType);
    if (!boundary) return null;

    if (boundary.length > 70) {
      throw new BoundaryTooLongError(`multipart boundary size too large (${boundary.length} characters)`);
    }

    const body = typeof input === "string" ? Buffer.from(input, "binary") : input;
    if (!body || body.length === 0) {
      throw new MissingInputError();
    }

    const env: Record<string, any> = {
      CONTENT_TYPE: contentType,
      "rack.input": { read() { return body; } },
      _multipart_file_limit: opts.multipart_file_limit || 0,
      _multipart_total_limit: opts.multipart_total_limit || 0,
    };

    return parseBody(body, boundary, env);
  }

  static buildMultipartBody(params: Record<string, any>): { body: string; boundary: string } {
    const boundary = "AaB03x";
    const parts: string[] = [];

    function addParts(prefix: string, value: any): void {
      if (value && typeof value === "object" && value.filename) {
        const content = typeof value.read === "function" ? value.read() : (value.content || "");
        parts.push(
          `--${boundary}\r\n` +
          `content-disposition: form-data; name="${prefix}"; filename="${value.filename}"\r\n` +
          `content-type: ${value.type || value.contentType || "application/octet-stream"}\r\n\r\n` +
          content + "\r\n"
        );
      } else if (value instanceof UploadedFile) {
        const content = value.read();
        parts.push(
          `--${boundary}\r\n` +
          `content-disposition: form-data; name="${prefix}"; filename="${value.filename}"\r\n` +
          `content-type: ${value.contentType}\r\n\r\n` +
          content + "\r\n"
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
              String(item) + "\r\n"
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
          String(value) + "\r\n"
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

// Convenience top-level
export const Multipart = {
  parseMultipart,
  parseBoundary,
  MultipartParser,
  UploadedFile,
  BoundaryTooLongError,
  EmptyContentError,
  MissingInputError,
  MultipartPartLimitError,
  MultipartTotalPartLimitError,
};
