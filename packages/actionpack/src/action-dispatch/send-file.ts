import { File } from "@blazetrails/ruby-compat";

export interface SendFileOptions {
  type?: string;
  disposition?: "inline" | "attachment" | null;
  filename?: string;
  stream?: boolean;
}

export interface SendDataOptions {
  type?: string;
  disposition?: "inline" | "attachment" | null;
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

export function lookupMimeType(typeOrExt: string): string {
  if (typeOrExt.includes("/")) return typeOrExt;
  const ext = typeOrExt.startsWith(".") ? typeOrExt : `.${typeOrExt}`;
  return MIME_TYPES[ext.toLowerCase()] ?? "application/octet-stream";
}

export function sendFile(path: string, options: SendFileOptions = {}): SendResult {
  const resolvedPath = File.expandPath(path);

  if (!File.isFile(resolvedPath) || !File.isReadable(resolvedPath)) {
    throw new Error(`Cannot read file: ${path}`);
  }

  const stat = File.stat(resolvedPath);
  const filename = options.filename ?? File.basename(resolvedPath);
  const ext = File.extname(filename);
  const type = options.type
    ? lookupMimeType(options.type)
    : (MIME_TYPES[ext.toLowerCase()] ?? "application/octet-stream");
  const disposition = options.disposition;

  const headers: Record<string, string> = {
    "content-type": type,
    "content-length": String(stat.size),
  };

  if (disposition !== null && disposition !== undefined) {
    headers["content-disposition"] = buildContentDisposition(disposition, filename);
  } else if (disposition === undefined) {
    headers["content-disposition"] = buildContentDisposition("attachment", filename);
  }

  const body = Buffer.from(
    File.open(resolvedPath, "rb", (file) => file.read()),
    "latin1",
  );

  return { status: 200, headers, body };
}

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
    headers["content-disposition"] = buildContentDisposition("attachment", options.filename);
  }

  return { status: 200, headers, body };
}

function buildContentDisposition(disposition: "inline" | "attachment", filename?: string): string {
  if (!filename) return disposition;
  const hasNonAscii = /[^\x20-\x7E]/.test(filename);
  if (hasNonAscii) {
    const encoded = encodeURIComponent(filename);
    return `${disposition}; filename*=UTF-8''${encoded}`;
  }
  return `${disposition}; filename="${filename}"`;
}
