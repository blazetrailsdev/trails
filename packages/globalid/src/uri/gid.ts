const APP_NAME_RE = /^[a-zA-Z0-9-]+$/;
const GID_RE = /^gid:\/\/([^/?#]+)(\/[^?#]*)(\?[^#]*)?$/;

export interface GidComponents {
  app: string;
  modelName: string;
  modelId: string | string[];
  params: Record<string, string>;
}

/** @internal */
const COMPOSITE_MODEL_ID_MAX_SIZE = 20;
/** @internal */
const COMPOSITE_MODEL_ID_DELIMITER = "/";

/** @internal */
function parseGid(uri: string): GidComponents {
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

/** @internal */
function buildGid(
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

export function validateApp(app: string | null | undefined): string {
  if (!app || !APP_NAME_RE.test(app)) {
    throw new Error(
      "Invalid app name. App names must be valid URI hostnames: alphanumeric and hyphen characters only.",
    );
  }
  return app;
}

export class MissingModelIdError extends Error {}
export class InvalidModelIdError extends Error {}
/** @internal */
export class InvalidComponentError extends Error {}
/** @internal */
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

/** @internal */
function normalizeModelId(raw: unknown, modelName: string): string | string[] {
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

/** @internal */
function parseQueryParams(qs: string | undefined): Record<string, string> {
  if (!qs) return {};
  const result: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(qs)) {
    result[k] = v;
  }
  return result;
}

/** @internal */
function cgiEscape(s: string): string {
  return encodeURIComponent(s)
    .replace(/%20/g, "+")
    .replace(/[~!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function modelIdEquals(a: string | string[], b: string | string[]): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((segment, i) => segment === b[i]);
  }
  return a === b;
}

/** @internal */
function paramsEquals(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key]);
}

/** @internal */
function cgiUnescape(s: string): string {
  return decodeURIComponent(s.replace(/\+/g, "%20"));
}

export class GID {
  private readonly _uri: string;
  private readonly _components: GidComponents;

  /** @noRailsEquivalent PERMANENT */
  constructor(uri: string, components?: GidComponents) {
    this._uri = uri;
    this._components = components ?? parseGid(uri);
  }

  get app(): string {
    return this._components.app;
  }
  get modelName(): string {
    return this._components.modelName;
  }
  get modelId(): string | string[] {
    return this._components.modelId;
  }
  get params(): Record<string, string> {
    return this._components.params;
  }

  toString(): string {
    return this._uri;
  }

  /** @noRailsEquivalent PERMANENT */
  equals(oth: GID): boolean {
    if (oth == null) return false;
    return (
      this.app.toLowerCase() === oth.app.toLowerCase() &&
      this.modelName === oth.modelName &&
      modelIdEquals(this.modelId, oth.modelId) &&
      paramsEquals(this.params, oth.params)
    );
  }

  deconstructKeys(_keys: readonly string[] | null = null): GidComponents {
    const { modelId } = this._components;
    return {
      ...this._components,
      modelId: Array.isArray(modelId) ? [...modelId] : modelId,
      params: { ...this._components.params },
    };
  }

  static parse(uri: string): GID {
    return new GID(uri);
  }

  static create(
    app: string,
    model: { id: unknown; constructor: { name: string } },
    params: Record<string, string> | null = null,
  ): GID {
    return GID.build({ app, modelName: model.constructor.name, modelId: model.id, params });
  }

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

  static validateApp(app: string | null | undefined): string {
    return validateApp(app);
  }

  /** @internal */
  protected setPath(path: string): void {
    if (!("modelName" in this._components) || !this.modelId) this.setModelComponents(path);
  }
  /** @internal */
  protected set query(query: string | undefined) {
    this.setParams(this.parseQueryParams(query));
  }
  /** @internal */
  protected setQuery(query: string | undefined): void {
    this.query = query;
  }
  /** @internal */
  protected setParams(params: Record<string, string>): void {
    (this._components as { params: Record<string, string> }).params = params;
  }
  /** @internal */
  protected checkHost(host: string): true {
    this.validateComponent(host);
    return true;
  }
  /** @internal */
  protected checkPath(path: string): true {
    this.validateComponent(path);
    this.setModelComponents(path, true);
    return true;
  }
  /** @internal */
  protected checkScheme(scheme: string): true {
    if (scheme !== "gid") {
      throw new BadURIError(`Not a gid:// URI scheme: ${scheme}`);
    }
    return true;
  }
  /** @internal */
  protected setModelComponents(path: string, validate = false): void {
    const parts = path.split("/");
    const modelName = parts[1];
    const modelId = parts.slice(2).join("/");
    if (validate) {
      this.validateComponent(modelName);
      this.validateModelIdSection(modelId, modelName);
    }
  }
  /** @internal */
  protected validateComponent(component: string | null | undefined): string {
    if (!component) {
      throw new InvalidComponentError(`Expected a URI like gid://app/Person/1234`);
    }
    return component;
  }
  /** @internal */
  protected validateModelIdSection(modelId: string, modelName: string): string {
    if (!modelId) {
      throw new MissingModelIdError(
        `Unable to create a Global ID for ${modelName} without a model id.`,
      );
    }
    return modelId;
  }
  /** @internal */
  protected validateModelId(modelIdPart: string): void {
    if (modelIdPart.includes("/")) {
      throw new InvalidModelIdError(
        `Unable to create a Global ID for ${this.modelName} with a malformed model id.`,
      );
    }
  }
  /** @internal */
  protected parseQueryParams(query: string | undefined): Record<string, string> {
    return parseQueryParams(query);
  }
}
