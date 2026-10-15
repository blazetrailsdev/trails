import { isBlank } from "@blazetrails/activesupport";
import {
  ArgumentError,
  BadURIError,
  Error as URIError,
  Generic,
  InvalidComponentError,
  RFC2396Parser,
  stringSplit,
  URI,
  Util,
} from "@blazetrails/ruby-compat";

export { BadURIError, InvalidComponentError };

export interface GidComponents {
  app: string;
  modelName: string;
  modelId: string | string[];
  params: Record<string, string>;
}

export class MissingModelIdError extends InvalidComponentError {}
export class InvalidModelIdError extends InvalidComponentError {}

/** @internal */
const COMPOSITE_MODEL_ID_MAX_SIZE = 20;
/** @internal */
const COMPOSITE_MODEL_ID_DELIMITER = "/";

/** @internal */
const URI_PARSER = new RFC2396Parser();

/** @internal */
function cgiEscape(s: string): string {
  return URI.encodeWwwFormComponent(s);
}

/** @internal */
function cgiUnescape(s: string): string {
  return decodeURIComponent(s.replace(/\+/g, "%20"));
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

export class GID extends Generic {
  static override readonly COMPONENT: readonly string[] = Object.freeze([
    "scheme",
    "app",
    "modelName",
    "modelId",
    "params",
  ]);

  declare private _modelName: string;
  declare private _modelId: string | string[];
  declare private _params: Record<string, string> | null;

  get app(): string {
    return this.host!;
  }
  get modelName(): string {
    return this._modelName;
  }
  get modelId(): string | string[] {
    return this._modelId;
  }
  get params(): Record<string, string> {
    return this._params!;
  }

  static validateApp(app: string | null | undefined): string {
    try {
      return this.parse(`gid://${app ?? ""}/Model/1`).app;
    } catch (error) {
      if (!(error instanceof URIError)) throw error;
      throw new ArgumentError(
        "Invalid app name. App names must be valid URI hostnames: alphanumeric and hyphen characters only.",
      );
    }
  }

  static parse(uri: string): GID {
    const genericComponents = [...URI.split(uri), URI_PARSER, true] as const;
    return new GID(...genericComponents);
  }

  static create(
    app: string,
    model: { id: unknown; constructor: { name: string } },
    params: Record<string, string> | null = null,
  ): GID {
    return GID.build({ app, modelName: model.constructor.name, modelId: model.id, params });
  }

  static override build(args: {
    app: string;
    modelName: string;
    modelId: unknown;
    params?: Record<string, string> | null;
  }): GID {
    const parts = Util.makeComponentsHash(this, args);
    parts["host"] = parts["app"];
    const modelIdSegment = (Array.isArray(parts["modelId"]) ? parts["modelId"] : [parts["modelId"]])
      .map((p) => cgiEscape(String(p ?? "")))
      .join(COMPOSITE_MODEL_ID_DELIMITER);
    parts["path"] = `/${parts["modelName"] as string}/${modelIdSegment}`;

    const params = parts["params"] as Record<string, string> | null | undefined;
    if (params != null && Object.keys(params).length > 0) {
      parts["query"] = URI.encodeWwwForm(params);
    }

    return super.build(parts) as GID;
  }

  override toString(): string {
    return `gid://${this.host ?? ""}${this.path ?? ""}${this.query != null ? "?" + this.query : ""}`;
  }

  /** @noRailsEquivalent PERMANENT */
  equals(oth: GID): boolean {
    if (oth == null) return false;
    return (
      this.app.toLowerCase() === oth.app.toLowerCase() &&
      this.modelName === oth.modelName &&
      modelIdEquals(this.modelId, oth.modelId) &&
      paramsEquals(this.params ?? {}, oth.params ?? {})
    );
  }

  deconstructKeys(_keys: readonly string[] | null = null): GidComponents {
    const { modelId } = this;
    return {
      app: this.app,
      modelName: this.modelName,
      modelId: Array.isArray(modelId) ? [...modelId] : modelId,
      params: { ...this.params },
    };
  }

  /** @internal */
  protected override setPath(path: string | null): void {
    if (!(this._modelName !== undefined && this._modelId)) this.setModelComponents(path!);
    super.setPath(path);
  }

  /** @internal */
  override set query(query: string | null) {
    this.setParams(this.parseQueryParams(query));
    super.query = query;
  }

  /** @internal */
  override get query(): string | null {
    return super.query;
  }

  /** @internal */
  protected setQuery(query: string | null): void {
    this.setParams(this.parseQueryParams(query));
  }

  /** @internal */
  protected setParams(params: Record<string, string> | null): void {
    this._params = params;
  }

  /** @internal */
  protected override checkHost(host: string | null): boolean | null {
    this.validateComponent(host);
    return super.checkHost(host);
  }

  /** @internal */
  protected override checkPath(path: string | null): boolean {
    this.validateComponent(path);
    this.setModelComponents(path!, true);
    return true;
  }

  /** @internal */
  protected override checkScheme(scheme: string | null): boolean {
    if (scheme === "gid") {
      return true;
    } else {
      throw new BadURIError(`Not a gid:// URI scheme: ${this.inspect()}`);
    }
  }

  /** @internal */
  private setModelComponents(path: string, validate = false): void {
    const [, modelName, modelId] = stringSplit(path, "/", 3);

    if (validate) {
      this.validateComponent(modelName);
      this.validateModelIdSection(modelId, modelName);
    }
    this._modelName = modelName!;

    if (modelId != null) {
      const modelIdParts = stringSplit(
        modelId,
        COMPOSITE_MODEL_ID_DELIMITER,
        COMPOSITE_MODEL_ID_MAX_SIZE,
      )
        .filter((part) => !isBlank(part))
        .map((id) => {
          this.validateModelId(id);
          return cgiUnescape(id);
        });

      this._modelId = modelIdParts.length === 1 ? modelIdParts[0] : modelIdParts;
    }
  }

  /** @internal */
  private validateComponent(component: string | null | undefined): string | null | undefined {
    if (!isBlank(component)) return component;

    throw new InvalidComponentError(`Expected a URI like gid://app/Person/1234: ${this.inspect()}`);
  }

  /** @internal */
  private validateModelIdSection(
    modelId: string | undefined,
    modelName: string | undefined,
  ): string | undefined {
    if (!isBlank(modelId)) return modelId;

    throw new MissingModelIdError(
      `Unable to create a Global ID for ${modelName ?? ""} without a model id.`,
    );
  }

  /** @internal */
  private validateModelId(modelIdPart: string): void {
    if (!modelIdPart.includes("/")) return;

    throw new InvalidModelIdError(
      `Unable to create a Global ID for ${this.modelName} with a malformed model id.`,
    );
  }

  /** @internal */
  private parseQueryParams(query: string | null): Record<string, string> | null {
    if (query == null) return null;
    return Object.fromEntries(URI.decodeWwwForm(query));
  }
}

URI.registerScheme("GID", GID as never);
