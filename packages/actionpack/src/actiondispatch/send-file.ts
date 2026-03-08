/**
 * ActionController::DataStreaming (send_file / send_data)
 *
 * Helpers for sending files and raw data as downloads.
 */

import * as path from "path";
import * as fs from "fs";

export interface SendFileOptions {
  /** Content type (auto-detected from filename if not provided) */
  type?: string;
  /** Content disposition: "inline" or "attachment" (default: "attachment") */
  disposition?: "inline" | "attachment" | null;
  /** Display filename (defaults to the file's basename) */
  filename?: string;
  /** Stream the file (default: true) */
  stream?: boolean;
}

export interface SendDataOptions {
  /** Content type (default: "application/octet-stream") */
  type?: string;
  /** Content disposition: "inline" or "attachment" (default: "attachment") */
  disposition?: "inline" | "attachment" | null;
  /** Display filename */
  filename?: string;
}

export interface SendResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer | string;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".txt": "text/plain",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".csv": "text/csv",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Look up a MIME type by extension or symbol. */
export function lookupMimeType(typeOrExt: string): string {
  if (typeOrExt.includes("/")) return typeOrExt; // Already a MIME type
  const ext = typeOrExt.startsWith(".") ? typeOrExt : `.${typeOrExt}`;
  return MIME_TYPES[ext.toLowerCase()] ?? "application/octet-stream";
}

/**
 * Generate headers and body for sending a file.
 * Mirrors Rails' send_file.
 */
export function sendFile(filePath: string, options: SendFileOptions = {}): SendResult {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Cannot read file: ${filePath}`);
  }

  const stat = fs.statSync(resolvedPath);
  const filename = options.filename ?? path.basename(resolvedPath);
  const ext = path.extname(filename);
  const type = options.type ? lookupMimeType(options.type) : (MIME_TYPES[ext.toLowerCase()] ?? "application/octet-stream");
  const disposition = options.disposition;

  const headers: Record<string, string> = {
    "content-type": type,
    "content-length": String(stat.size),
  };

  // Don't include charset for binary types
  // (Rails strips charset from send_file headers)

  if (disposition !== null && disposition !== undefined) {
    headers["content-disposition"] = buildContentDisposition(disposition, filename);
  } else if (disposition === undefined) {
    // Default: attachment
    headers["content-disposition"] = buildContentDisposition("attachment", filename);
  }

  const body = fs.readFileSync(resolvedPath);

  return { status: 200, headers, body };
}

/**
 * Generate headers and body for sending raw data.
 * Mirrors Rails' send_data.
 */
export function sendData(data: Buffer | string, options: SendDataOptions = {}): SendResult {
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const type = options.type ? lookupMimeType(options.type) : "application/octet-stream";
  const disposition = options.disposition;

  const headers: Record<string, string> = {
    "content-type": type,
    "content-length": String(body.length),
  };

  if (disposition !== null && disposition !== undefined) {
    headers["content-disposition"] = buildContentDisposition(disposition, options.filename);
  } else if (disposition === undefined) {
    // Default: attachment
    headers["content-disposition"] = buildContentDisposition("attachment", options.filename);
  }

  return { status: 200, headers, body };
}

function buildContentDisposition(disposition: "inline" | "attachment", filename?: string): string {
  if (!filename) return disposition;
  // RFC 6266: use filename* for non-ASCII
  const hasNonAscii = /[^\x20-\x7E]/.test(filename);
  if (hasNonAscii) {
    const encoded = encodeURIComponent(filename);
    return `${disposition}; filename*=UTF-8''${encoded}`;
  }
  return `${disposition}; filename="${filename}"`;
}
