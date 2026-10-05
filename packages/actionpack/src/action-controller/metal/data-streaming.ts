import { File, merge, slice } from "@blazetrails/ruby-compat";
import { ContentDisposition } from "../../action-dispatch/http/content-disposition.js";
import { Mime, MimeType } from "../../action-dispatch/http/mime-type.js";
import type { RenderOptions } from "../base.js";
import { MissingFile } from "./exceptions.js";

export const DEFAULT_SEND_FILE_TYPE = "application/octet-stream";
export const DEFAULT_SEND_FILE_DISPOSITION = "attachment";

/** @internal */
export interface SendFileHeadersHost {
  contentType: string | null;
  response: { sendingFile: boolean };
  headers: { set(name: string, value: string): unknown };
}

export interface SendDataOptions extends SendFileHeadersOptions {
  status?: RenderOptions["status"];
  contentType?: string;
}

export interface SendFileOptions extends SendDataOptions {
  urlBasedFilename?: boolean;
}

export interface SendFileHeadersOptions {
  type?: string | null;
  filename?: string | null;
  disposition?: string | false | null;
}

/** @internal */
export interface DataStreamingHost extends SendFileHeadersHost {
  status: number | string;
  response: { sendingFile: boolean; sendFile(path: string): void };
  sendFileHeadersBang(options: SendFileHeadersOptions): void;
  render(options: RenderOptions): void | Promise<void>;
}

/** @internal */
export function sendFile(
  this: DataStreamingHost,
  path: string,
  options: SendFileOptions = {},
): void {
  if (!(File.isFile(path) && File.isReadable(path))) {
    throw new MissingFile(`Cannot read file ${path}`);
  }

  if (!options.urlBasedFilename) options.filename ??= File.basename(path);
  this.sendFileHeadersBang(options);

  this.status = options.status ?? 200;
  if (Object.hasOwn(options, "contentType")) this.contentType = options.contentType!;
  this.response.sendFile(path);
}

/** @internal */
export function sendData(
  this: DataStreamingHost,
  data: string | Buffer,
  options: SendDataOptions = {},
): void | Promise<void> {
  this.sendFileHeadersBang(options);
  return this.render(
    merge(slice(options as Record<string, unknown>, "status", "contentType"), {
      body: Buffer.isBuffer(data) ? data.toString("latin1") : data,
    }),
  );
}

/** @internal */
export function sendFileHeadersBang(
  this: SendFileHeadersHost,
  options: SendFileHeadersOptions,
): void {
  const typeProvided = Object.hasOwn(options, "type");

  let contentType: string | null = typeProvided
    ? (options.type as string | null)
    : DEFAULT_SEND_FILE_TYPE;
  this.contentType = contentType;
  this.response.sendingFile = true;

  if (contentType === null || contentType === undefined) {
    throw new TypeError(":type option required");
  }

  if (typeProvided && !contentType.includes("/")) {
    const extension = Mime.get(contentType);
    if (!extension) throw new TypeError(`Unknown MIME type ${String(options.type)}`);
    contentType = extension.toString();
  } else if (!typeProvided && options.filename) {
    const ext = File.extname(options.filename).toLowerCase().replace(/^\./, "");
    const guessed = MimeType.lookupByExtension(ext);
    if (guessed) contentType = guessed.toString();
  }
  this.contentType = contentType;

  const disposition: string | false | null | undefined = Object.hasOwn(options, "disposition")
    ? (options.disposition ?? false)
    : DEFAULT_SEND_FILE_DISPOSITION;

  if (disposition) {
    this.headers.set(
      "Content-Disposition",
      ContentDisposition.format({
        disposition,
        filename: options.filename ?? null,
      }),
    );
  }

  this.headers.set("Content-Transfer-Encoding", "binary");
}
