/**
 * ActionController::DataStreaming
 *
 * Methods for sending arbitrary data and for streaming files to the
 * browser, instead of rendering.
 * @see https://api.rubyonrails.org/classes/ActionController/DataStreaming.html
 */

import { getPath } from "@blazetrails/activesupport";
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

/**
 * Minimal controller-like host that `sendFileHeadersBang` mutates.
 * Mirrors the surface Rails relies on (`self.content_type=`,
 * `response.sending_file=`, `headers["..."]=` — surfaced here as
 * `setHeader` to match `ActionController::Base`'s public API).
 * @internal
 */
export interface SendFileHeadersHost {
  contentType: string | null;
  response: { sendingFile: boolean };
  setHeader(name: string, value: string): void;
}

/** Options accepted by `sendFileHeadersBang`. */
export interface SendFileHeadersOptions {
  /** MIME type as string or Mime symbol key (e.g. `"json"`). */
  type?: string | null;
  /** Suggested filename for Content-Disposition. */
  filename?: string | null;
  /**
   * Content disposition: `"inline"`, `"attachment"`, or falsy to omit
   * the header entirely. Defaults to `"attachment"`.
   */
  disposition?: string | false | null;
}

/**
 * Populate Content-Type, Content-Disposition, and
 * Content-Transfer-Encoding headers on the host controller for a file
 * or data response. Mirrors Rails' private `send_file_headers!`.
 *
 * Assigned to controllers as a `this`-typed function so the runtime
 * receiver supplies the contentType/response/headers slots.
 *
 * @internal
 */
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
    // String matches the Mime symbol shape (e.g. "json"). Mirror
    // Rails' `Mime[content_type]` lookup and reject unknown keys.
    if (!MimeType.isRegistered(contentType)) {
      throw new TypeError(`Unknown MIME type ${String(options.type)}`);
    }
    contentType = MimeType.lookup(contentType).toString();
  } else if (!typeProvided && options.filename) {
    // Guess from extension when caller didn't pin a type.
    const ext = getPath().extname(options.filename).toLowerCase().replace(/^\./, "");
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
