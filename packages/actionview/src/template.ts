/**
 * ActionView::Template
 *
 * A resolved template with source, handler reference, and metadata.
 */

import { TemplateError } from "./template/error.js";

/**
 * `Template.Error` mirrors Rails' `ActionView::Template::Error` nesting so
 * downstream code (actionpack `ExceptionWrapper`) can reference the
 * canonical name. The class itself lives in `./template/error.js` to keep
 * the Rails file layout.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Template {
  export const Error = TemplateError;
  export type Error = TemplateError;
}

export interface Template {
  /** Raw template source code */
  source: string;
  /** File extension determining which handler to use (e.g., "ejs") */
  extension: string;
  /** Logical path (e.g., "posts/index") */
  identifier: string;
  /** Response format (e.g., "html", "json", "text") */
  format: string;
  /** Full filesystem path (for error reporting), if available */
  fullPath?: string;
  /** Whether this is a layout template */
  isLayout?: boolean;
  /** Whether this is a partial template */
  isPartial?: boolean;
}
