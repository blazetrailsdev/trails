import { UploadedFile } from "./multipart/uploaded-file.js";
import { Generator } from "./multipart/generator.js";
import { defaultQueryParser } from "./utils.js";
import {
  RACK_INPUT,
  RACK_MULTIPART_BUFFER_SIZE,
  RACK_MULTIPART_TEMPFILE_FACTORY,
  RACK_TEMPFILES,
} from "./constants.js";
import { include } from "@blazetrails/ruby-compat";
import { BadRequest } from "./bad-request.js";
import type { QueryParser } from "./query-parser.js";

export const MULTIPART_BOUNDARY = "AaB03x";
export { UploadedFile } from "./multipart/uploaded-file.js";
import {
  MultipartPartLimitError,
  MultipartTotalPartLimitError,
  BoundaryTooLongError,
  EmptyContentError,
  Parser,
} from "./multipart/parser.js";

export {
  MultipartPartLimitError,
  MultipartTotalPartLimitError,
  BoundaryTooLongError,
  EmptyContentError,
} from "./multipart/parser.js";

export interface UploadedFileInfo {
  filename: string;
  type: string;
  name: string;
  tempfile: { read(): string; rewind?(): void; path?: string };
  head: string;
}

export class MissingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingInputError";
  }
}
include(MissingInputError, BadRequest);

export function parseMultipart(
  env: Record<string, any>,
  params: QueryParser = defaultQueryParser(),
): Record<string, any> | null {
  const io = env[RACK_INPUT];
  if (io == null || io === false) {
    throw new MissingInputError("Missing input stream!");
  }

  let contentLength = env["CONTENT_LENGTH"];
  if (contentLength != null && contentLength !== false) {
    contentLength = parseInt(String(contentLength), 10) || 0;
  }

  const contentType = env["CONTENT_TYPE"];

  const tempfile = env[RACK_MULTIPART_TEMPFILE_FACTORY] || Parser.TEMPFILE_FACTORY;
  const bufsize = env[RACK_MULTIPART_BUFFER_SIZE] || Parser.BUFSIZE;

  const info = Parser.parse(io, contentLength, contentType, tempfile, bufsize, params);
  env[RACK_TEMPFILES] = info.tmpFiles;

  return info.params;
}

export class ParamList {
  private _pairs: [string, unknown][] = [];

  static makeParams(): ParamList {
    return new ParamList();
  }

  static normalizeParams(params: ParamList, key: string, value: unknown): void {
    params.push([key, value]);
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
  _params: QueryParser = defaultQueryParser(),
): Record<string, any> | null {
  return parseMultipart(request.env);
}

export function buildMultipart(
  params: unknown,
  first: boolean = true,
): string | Record<string, unknown> | null {
  return new Generator(params, first).dump();
}

export const Multipart = {
  MULTIPART_BOUNDARY,
  parseMultipart,
  extractMultipart,
  buildMultipart,
  ParamList,
  UploadedFile,
  BoundaryTooLongError,
  EmptyContentError,
  MissingInputError,
  MultipartPartLimitError,
  MultipartTotalPartLimitError,
};
