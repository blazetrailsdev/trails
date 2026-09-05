import { defineModule, include, isPlainObject } from "@blazetrails/activesupport";
import { escape, escapePath, unescape, Params } from "@blazetrails/rack";
import { ArgumentError, Encoding, StringIO, b } from "@blazetrails/ruby-compat";
import { UploadedFile } from "./uploaded-file.js";
import { END_BOUNDARY, START_BOUNDARY, Session } from "./test.js";

/** @noRailsEquivalent PERMANENT */
function isHash(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) || value instanceof Params;
}

function buildNestedQuery(value: unknown, prefix: string | null = null): string {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${prefix ?? ""}[]=`;
    } else {
      if (!unescape(prefix!).endsWith("[]")) prefix = `${prefix}[]`;
      return value.map((v) => buildNestedQuery(v, String(prefix))).join("&");
    }
  } else if (isHash(value)) {
    return Object.entries(value)
      .map(([k, v]) => buildNestedQuery(v, prefix != null ? `${prefix}[${escape(k)}]` : escape(k)))
      .join("&");
  } else if (value == null) {
    return prefix ?? "";
  } else {
    return `${prefix ?? ""}=${escape(value as { toString(): string })}`;
  }
}

function buildMultipart(
  params: unknown,
  _first: boolean = true,
  multipart: boolean = false,
): string | null {
  if (!isHash(params)) throw new ArgumentError("value must be a Hash");

  if (!multipart) {
    const query = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(query);
      } else if (isHash(value)) {
        Object.values(value).forEach(query);
      } else if (value instanceof UploadedFile) {
        multipart = true;
      }
    };
    Object.values(params).forEach(query);
    if (!multipart) return null;
  }

  params = normalizeMultipartParams(params, true);

  const buffer = new StringIO();
  buildParts(buffer, params as Record<string, unknown>);
  return buffer.string();
}

function normalizeMultipartParams(
  params: Record<string, unknown>,
  first: boolean = false,
): Record<string, unknown> {
  const flattenedParams: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    const k = first ? String(key) : `[${key}]`;

    if (Array.isArray(value)) {
      value.map((v) => {
        if (isHash(v)) {
          const nestedParams: Record<string, unknown> = {};
          for (const [subkey, subvalue] of Object.entries(normalizeMultipartParams(v))) {
            nestedParams[subkey] = subvalue;
          }
          ((flattenedParams[`${k}[]`] ??= []) as unknown[]).push(nestedParams);
        } else {
          flattenedParams[`${k}[]`] = value;
        }
      });
    } else if (isHash(value)) {
      for (const [subkey, subvalue] of Object.entries(normalizeMultipartParams(value))) {
        flattenedParams[k + subkey] = subvalue;
      }
    } else {
      flattenedParams[k] = value;
    }
  }

  return flattenedParams;
}

function buildParts(buffer: StringIO, parameters: Record<string, unknown>): void {
  _buildParts(buffer, parameters);
  buffer.write(END_BOUNDARY);
}

function _buildParts(buffer: StringIO, parameters: Record<string, unknown>): void {
  Object.entries(parameters).map(([name, value]) => {
    if (/\[\]\n?$/.test(name) && Array.isArray(value) && value.every((v) => isHash(v))) {
      value.forEach((hash) => {
        const newValue: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(hash)) newValue[name + k] = v;
        _buildParts(buffer, newValue);
      });
    } else {
      [value].flat(Infinity).map((v) => {
        if (v != null && typeof v === "object" && "originalFilename" in v) {
          buildFilePart(buffer, name, v as UploadedFile);
        } else {
          buildPrimitivePart(buffer, name, v);
        }
      });
    }
  });
}

function buildPrimitivePart(buffer: StringIO, parameterName: string, value: unknown): StringIO {
  buffer.write(START_BOUNDARY);
  buffer.write('content-disposition: form-data; name="');
  buffer.write(b(String(parameterName)));
  buffer.write('"\r\n\r\n');
  buffer.write(b(value == null ? "" : String(value)));
  buffer.write("\r\n");
  return buffer;
}

/** @missingRailsArgs b — PERMANENT */
function buildFilePart(
  buffer: StringIO,
  parameterName: string,
  uploadedFile: UploadedFile,
): StringIO {
  buffer.write(START_BOUNDARY);
  buffer.write('content-disposition: form-data; name="');
  buffer.write(b(String(parameterName)));
  buffer.write('"; filename="');
  buffer.write(b(escapePath(uploadedFile.originalFilename ?? "")));
  buffer.write('"\r\ncontent-type: ');
  buffer.write(b(uploadedFile.contentType == null ? "" : String(uploadedFile.contentType)));
  buffer.write("\r\ncontent-length: ");
  buffer.write(b(String(uploadedFile.size)));
  buffer.write("\r\n\r\n");

  if ("setEncoding" in uploadedFile) {
    uploadedFile.setEncoding(Encoding.BINARY);
    uploadedFile.appendTo(buffer);
  }

  buffer.write("\r\n");
  return buffer;
}

export const Utils = defineModule(
  { buildNestedQuery, buildMultipart },
  {},
  {
    normalizeMultipartParams,
    buildParts,
    _buildParts,
    buildPrimitivePart,
    buildFilePart,
  },
);

include(Session, Utils);
