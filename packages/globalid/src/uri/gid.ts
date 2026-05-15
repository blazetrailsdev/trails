const APP_NAME_RE = /^[a-zA-Z0-9-]+$/;
const GID_RE = /^gid:\/\/([^/?#]+)(\/[^?#]*)(\?[^#]*)?$/;

export interface GidComponents {
  app: string;
  modelName: string;
  modelId: string | string[];
  params: Record<string, string>;
}

/** Maximum number of composite id segments. @internal */
const COMPOSITE_MODEL_ID_MAX_SIZE = 20;
/** @internal */
const COMPOSITE_MODEL_ID_DELIMITER = "/";

/**
 * Parse a `gid://app/ModelName/id` URI string.
 *
 * Mirrors: URI::GID.parse / URI::GID#set_model_components
 */
export function parseGid(uri: string): GidComponents {
  if (!uri.startsWith("gid://")) {
    throw new BadURIError(`Not a gid:// URI scheme: ${uri}`);
  }

  const m = GID_RE.exec(uri);
  if (!m) {
    throw new InvalidComponentError(`Expected a URI like gid://app/Person/1234: ${uri}`);
  }

  const [, rawApp, pathStr, queryStr] = m;
  const app = rawApp ?? "";

  if (!APP_NAME_RE.test(app)) {
    throw new InvalidComponentError(`Expected a URI like gid://app/Person/1234: ${uri}`);
  }

  const path = pathStr ?? "";
  const pathParts = path.split("/");
  // pathParts[0] is empty string (leading slash)
  const modelName = pathParts[1];
  const rawModelId = pathParts.slice(2).join("/");

  if (!modelName) {
    throw new InvalidComponentError(`Expected a URI like gid://app/Person/1234: ${uri}`);
  }

  if (!rawModelId) {
    throw new MissingModelIdError(
      `Unable to create a Global ID for ${modelName} without a model id.`,
    );
  }

  const modelId = parseModelId(rawModelId, modelName);
  const params = parseQueryParams(queryStr?.slice(1));

  return { app, modelName, modelId, params };
}

/**
 * Build a `gid://app/ModelName/id` URI string.
 *
 * Mirrors: URI::GID.build
 */
export function buildGid(
  app: string,
  modelName: string,
  modelId: unknown,
  params?: Record<string, string> | null,
): string {
  validateApp(app);
  if (!modelName) throw new InvalidComponentError("model_name is required");

  const ids = Array.isArray(modelId) ? modelId : [modelId];
  const idSegment = ids.map((p) => cgiEscape(String(p ?? ""))).join(COMPOSITE_MODEL_ID_DELIMITER);

  if (!idSegment) {
    throw new MissingModelIdError(
      `Unable to create a Global ID for ${modelName} without a model id.`,
    );
  }

  let uri = `gid://${app}/${modelName}/${idSegment}`;

  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams(params).toString();
    uri += `?${qs}`;
  }

  return uri;
}

/**
 * Validate an app name. Mirrors: URI::GID.validate_app
 */
export function validateApp(app: string | null | undefined): string {
  if (!app || !APP_NAME_RE.test(app)) {
    throw new Error(
      "Invalid app name. App names must be valid URI hostnames: alphanumeric and hyphen characters only.",
    );
  }
  return app;
}

/** Mirrors: URI::GID::MissingModelIdError */
export class MissingModelIdError extends Error {}
/** Mirrors: URI::GID::InvalidModelIdError */
export class InvalidModelIdError extends Error {}
/** @internal — mirrors URI::InvalidComponentError */
export class InvalidComponentError extends Error {}
/** @internal — mirrors URI::BadURIError */
export class BadURIError extends Error {}

function parseModelId(raw: string, modelName: string): string | string[] {
  const parts = raw
    .split(COMPOSITE_MODEL_ID_DELIMITER, COMPOSITE_MODEL_ID_MAX_SIZE)
    .filter((p) => p.length > 0)
    .map((p) => cgiUnescape(p));

  if (parts.length === 0) {
    throw new MissingModelIdError(
      `Unable to create a Global ID for ${modelName} without a model id.`,
    );
  }

  return parts.length === 1 ? parts[0] : parts;
}

function parseQueryParams(qs: string | undefined): Record<string, string> {
  if (!qs) return {};
  const result: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(qs)) {
    result[k] = v;
  }
  return result;
}

// encodeURIComponent leaves ~!*'() unescaped; CGI.escape percent-encodes them.
/** CGI.escape equivalent: space→`+`, all non-unreserved chars→`%XX`. @internal */
function cgiEscape(s: string): string {
  return encodeURIComponent(s)
    .replace(/%20/g, "+")
    .replace(/[~!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/** CGI.unescape equivalent: `+`→space, `%XX`→char. @internal */
function cgiUnescape(s: string): string {
  return decodeURIComponent(s.replace(/\+/g, "%20"));
}
