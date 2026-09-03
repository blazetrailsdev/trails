import { File } from "@blazetrails/ruby-compat";
import { ContentDisposition } from "../../action-dispatch/http/content-disposition.js";
import { MimeType } from "../../action-dispatch/http/mime-type.js";

export {
  sendFile,
  sendData,
  type SendFileOptions,
  type SendDataOptions,
} from "../../action-dispatch/send-file.js";

export const DEFAULT_SEND_FILE_TYPE = "application/octet-stream";
export const DEFAULT_SEND_FILE_DISPOSITION = "attachment";

/** @internal */
export interface SendFileHeadersHost {
  contentType: string | null;
  response: { sendingFile: boolean };
  setHeader(name: string, value: string): void;
}

export interface SendFileHeadersOptions {
  type?: string | null;
  filename?: string | null;
  disposition?: string | false | null;
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
    if (!MimeType.isRegistered(contentType)) {
      throw new TypeError(`Unknown MIME type ${String(options.type)}`);
    }
    contentType = MimeType.lookup(contentType).toString();
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
    this.setHeader(
      "Content-Disposition",
      ContentDisposition.format({
        disposition,
        filename: options.filename ?? null,
      }),
    );
  }

  this.setHeader("Content-Transfer-Encoding", "binary");
}
