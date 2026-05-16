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
    const qs = Object.entries(params)
      .map(([k, v]) => `${cgiEscape(k)}=${cgiEscape(v)}`)
      .join("&");
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

/**
 * @internal Normalize a raw modelId input (scalar or array) into the
 * same shape parseGid produces: stringify with `?? ""` (parity with
 * buildGid), filter empty segments, cap at COMPOSITE_MODEL_ID_MAX_SIZE,
 * collapse to a single string when arity = 1. Throws MissingModelIdError
 * when all segments normalize to empty — matches parseGid's check,
 * since buildGid joins sparse arrays into a `/`-only segment string
 * which is truthy and slips past its own guard.
 *
 * Shared by GlobalID.create and GID.build so their skip-parse paths
 * agree with the round-trip through parseGid(buildGid(...)).
 */
export function normalizeModelId(raw: unknown, modelName: string): string | string[] {
  // Mirror parseModelId ordering: cap raw segments at
  // COMPOSITE_MODEL_ID_MAX_SIZE first, then filter empties. Reversing
  // the order would let a 21st non-empty segment slip past the cap
  // when preceded by empty/null entries.
  const parts = (Array.isArray(raw) ? raw : [raw])
    .slice(0, COMPOSITE_MODEL_ID_MAX_SIZE)
    .map((p) => String(p ?? ""))
    .filter((p) => p.length > 0);
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

// ─── URI::GID class wrapper (Rails parity) ─────────────────────────────────

/**
 * Class form of the GID URI. Wraps {@link parseGid}/{@link buildGid} so the
 * Rails `URI::GID` method surface (parse / create / build / validate_app on
 * the class; modelName / modelId / params / toString / deconstructKeys on
 * the instance) is reachable for api:compare matching and for callers who
 * prefer an OO shape.
 *
 * Mirrors: URI::GID (vendor/globalid/lib/global_id/uri/gid.rb)
 */
export class GID {
  /** The raw GID URI string. */
  readonly uri: string;
  private readonly _components: GidComponents;

  /** @internal — callers should use {@link GID.parse} / {@link GID.create} / {@link GID.build}. */
  constructor(uri: string, components?: GidComponents) {
    this.uri = uri;
    this._components = components ?? parseGid(uri);
  }

  /** Mirrors `alias :app :host`. */
  get app(): string {
    return this._components.app;
  }
  /** Mirrors `attr_reader :model_name`. */
  get modelName(): string {
    return this._components.modelName;
  }
  /** Mirrors `attr_reader :model_id`. */
  get modelId(): string | string[] {
    return this._components.modelId;
  }
  /** Mirrors `attr_reader :params`. */
  get params(): Record<string, string> {
    return this._components.params;
  }

  /** Mirrors: URI::GID#to_s */
  toString(): string {
    return this.uri;
  }

  /**
   * Mirrors: URI::GID#deconstruct_keys. Ruby uses this for pattern
   * matching; TS has no equivalent, so we return a shallow copy of the
   * components hash (a copy, not the internal state, so callers can't
   * mutate the GID via the returned object).
   */
  deconstructKeys(_keys: readonly string[] | null = null): GidComponents {
    const { modelId } = this._components;
    return {
      ...this._components,
      modelId: Array.isArray(modelId) ? [...modelId] : modelId,
      params: { ...this._components.params },
    };
  }

  // ─── Static factories ────────────────────────────────────────────────────

  /** Mirrors: URI::GID.parse */
  static parse(uri: string): GID {
    return new GID(uri);
  }

  /** Mirrors: URI::GID.create(app, model, params) */
  static create(
    app: string,
    model: { id: unknown; constructor: { name: string } },
    params: Record<string, string> | null = null,
  ): GID {
    return GID.build({ app, modelName: model.constructor.name, modelId: model.id, params });
  }

  /** Mirrors: URI::GID.build({app:, model_name:, model_id:, params:}) */
  static build(args: {
    app: string;
    modelName: string;
    modelId: unknown;
    params?: Record<string, string> | null;
  }): GID {
    const uri = buildGid(args.app, args.modelName, args.modelId, args.params);
    return new GID(uri, {
      app: args.app,
      modelName: args.modelName,
      modelId: normalizeModelId(args.modelId, args.modelName),
      params: args.params ?? {},
    });
  }

  /** Mirrors: URI::GID.validate_app */
  static validateApp(app: string | null | undefined): string {
    return validateApp(app);
  }

  // ─── URI::Generic subclass hooks ─────────────────────────────────────────
  //
  // Rails URI::GID inherits from URI::Generic and overrides these hooks so
  // the standard URI library calls them while parsing/assigning. We don't
  // subclass URI in TS — public parsing goes through GID.parse → parseGid,
  // not through these hooks. They exist for two reasons:
  //   1. api:compare parity (the methods need to be present on URI::GID).
  //   2. Subclass extension points: a TS subclass of GID can override these
  //      to plug into the validation pipeline if needed.
  // Each delegates to the same standalone helpers parseGid/validateApp use,
  // so behavior matches if anyone does call them directly.

  /** @internal Mirrors URI::GID#set_path — re-parses model components from path. */
  protected setPath(path: string): void {
    this.setModelComponents(path, true);
  }
  /** @internal Mirrors URI::GID#query= — assigns parsed params via a setter. */
  protected set query(value: string | undefined) {
    this.setParams(this.parseQueryParams(value));
  }
  /** @internal Mirrors URI::GID#set_query (Ruby ≤ 2.1 alias of query=). */
  protected setQuery(query: string | undefined): void {
    this.query = query;
  }
  /** @internal Mirrors URI::GID#set_params. */
  protected setParams(params: Record<string, string>): void {
    (this._components as { params: Record<string, string> }).params = params;
  }
  /** @internal Mirrors URI::GID#check_host. */
  protected checkHost(host: string): true {
    this.validateComponent(host);
    return true;
  }
  /** @internal Mirrors URI::GID#check_path. */
  protected checkPath(path: string): true {
    this.validateComponent(path);
    this.setModelComponents(path, true);
    return true;
  }
  /** @internal Mirrors URI::GID#check_scheme — only "gid" is valid. */
  protected checkScheme(scheme: string): true {
    if (scheme !== "gid") {
      throw new BadURIError(`Not a gid:// URI scheme: ${scheme}`);
    }
    return true;
  }
  /**
   * @internal Mirrors URI::GID#set_model_components.
   *
   * Nominal stub for api:compare parity. In Rails this assigns
   * `@model_name` and `@model_id` from the path; our GID instances are
   * built from a parsed `GidComponents` snapshot at construction time
   * (via parseGid in the public path, or directly from args in build()),
   * so re-deriving model components from the path string after the fact
   * isn't needed. We still run the same validation a Rails caller would
   * see so a TS subclass that overrides this gets predictable failures.
   */
  protected setModelComponents(path: string, validate = false): void {
    const parts = path.split("/");
    const modelName = parts[1];
    const rawModelId = parts.slice(2).join("/");
    if (validate) {
      this.validateComponent(modelName);
      this.validateModelIdSection(rawModelId, modelName);
    }
  }
  /** @internal Mirrors URI::GID#validate_component — must be non-blank. */
  protected validateComponent(component: string | null | undefined): string {
    if (!component) {
      throw new InvalidComponentError(`Expected a URI like gid://app/Person/1234`);
    }
    return component;
  }
  /** @internal Mirrors URI::GID#validate_model_id_section. */
  protected validateModelIdSection(modelId: string, modelName: string): string {
    if (!modelId) {
      throw new MissingModelIdError(
        `Unable to create a Global ID for ${modelName} without a model id.`,
      );
    }
    return modelId;
  }
  /** @internal Mirrors URI::GID#validate_model_id — composite parts cannot contain '/'. */
  protected validateModelId(modelIdPart: string): void {
    if (modelIdPart.includes("/")) {
      throw new InvalidModelIdError(
        `Unable to create a Global ID for ${this.modelName} with a malformed model id.`,
      );
    }
  }
  /** @internal Mirrors URI::GID#parse_query_params. */
  protected parseQueryParams(query: string | undefined): Record<string, string> {
    return parseQueryParams(query);
  }
}
