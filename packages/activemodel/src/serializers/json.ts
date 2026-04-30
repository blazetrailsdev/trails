import {
  serializableHash,
  attributeNamesForSerialization,
  serializableAttributes,
  serializableAddIncludes,
  coerceForJson,
  type SerializeOptions,
} from "../serialization.js";
import { ModelName } from "../naming.js";

function isPlainJsonObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function describeJsonShape(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/**
 * JSON serializer mixin host.
 *
 * Mirrors: ActiveModel::Serializers::JSON (json.rb:9-13)
 *
 *   module JSON
 *     extend ActiveSupport::Concern
 *     include ActiveModel::Serialization
 *
 *     included do
 *       extend ActiveModel::Naming
 *       class_attribute :include_root_in_json, instance_writer: false, default: false
 *     end
 *     ...
 *
 * Rails ships JSON as a module that pulls in `Serialization` (giving
 * `serializable_hash`) and extends `Naming` (giving `model_name`).
 * Trails' `Model` already wires up `asJson` / `fromJson`; this class
 * is the canonical mixin host for lighter-weight adopters and the
 * file-level Rails surface (`serializable_hash`, `model_name`).
 */
export class JSON {
  // Rails: included do; class_attribute :include_root_in_json, default: false; end
  // Typed boolean | string to match Model.includeRootInJson — Rails
  // accepts a string here too (treated as a custom root key by as_json).
  static includeRootInJson: boolean | string = false;

  // Per-class memo so the static getter can be inherited without
  // recomputing or sharing state across subclasses (matches Model's
  // model.ts:1179-1185 pattern).
  protected static _modelName?: ModelName;

  // Rails: included do; extend ActiveModel::Naming; end — surfaces
  // model_name on the host class. Subclasses override to customize.
  static get modelName(): ModelName {
    if (!this._modelName || this._modelName.name !== this.name) {
      this._modelName = new ModelName(this.name, { klass: this as unknown as { name: string } });
    }
    return this._modelName;
  }

  /**
   * Mirrors: ActiveModel::Serialization#serializable_hash
   * (serialization.rb), included into JSON via `include
   * ActiveModel::Serialization`. Delegates to the canonical
   * implementation in `serialization.ts` so a subclass that mixes in
   * the JSON host gets the same Rails semantics for `:only`, `:except`,
   * `:methods`, `:include`.
   */
  serializableHash(options?: SerializeOptions): Record<string, unknown> {
    return serializableHash(this as unknown as Parameters<typeof serializableHash>[0], options);
  }

  /**
   * Mirrors: ActiveModel::Serialization#attribute_names_for_serialization
   * (serialization.rb:158-160), inherited via `include Serialization`.
   *
   * @internal Rails-private helper.
   */
  protected attributeNamesForSerialization(): string[] {
    return attributeNamesForSerialization(this);
  }

  /**
   * Mirrors: ActiveModel::Serialization#serializable_attributes
   * (serialization.rb:162-164), inherited via `include Serialization`.
   *
   * @internal Rails-private helper.
   */
  protected serializableAttributes(attributeNames: readonly string[]): Record<string, unknown> {
    return serializableAttributes(this, attributeNames);
  }

  /**
   * Mirrors: ActiveModel::Serialization#serializable_add_includes
   * (serialization.rb:171-183), inherited via `include Serialization`.
   *
   * @internal Rails-private helper.
   */
  protected serializableAddIncludes(
    options: SerializeOptions = {},
    callback: (association: string, records: unknown, opts: SerializeOptions) => void = () => {},
  ): void {
    serializableAddIncludes(this, options, callback);
  }

  /**
   * Mirrors: json.rb:96-108
   *   def as_json(options = nil)
   *     root = if options&.key?(:root) then options[:root] else include_root_in_json end
   *     hash = serializable_hash(options).as_json
   *     if root
   *       root = model_name.element if root == true
   *       { root => hash }
   *     else
   *       hash
   *     end
   *   end
   */
  asJson(options?: SerializeOptions & { root?: boolean | string }): Record<string, unknown> {
    const ctor = this.constructor as typeof JSON;
    const rootOpt =
      options && Object.prototype.hasOwnProperty.call(options, "root")
        ? options.root
        : ctor.includeRootInJson;
    // Rails calls `serializable_hash(options).as_json` — recursive
    // JSON-coerce on the resulting hash. Mirror that with coerceForJson
    // so JSON-unsafe values (bigint, undefined, cyclic refs, etc.)
    // surface predictably, matching Model.asJson (model.ts:1708).
    const hash = coerceForJson(this.serializableHash(options)) as Record<string, unknown>;
    // Rails uses Ruby truthiness — only false/nil skip the wrap. JS
    // falsiness would also skip an empty-string root key, which Rails
    // would happily emit as `{ "" => hash }`. Match Rails semantics
    // explicitly (json.rb:101-107).
    if (rootOpt === false || rootOpt == null) return hash;
    const rootKey = rootOpt === true ? ctor.modelName.element : (rootOpt as string);
    return { [rootKey]: hash };
  }

  /**
   * Mirrors: json.rb:144-149
   *   def from_json(json, include_root = include_root_in_json)
   *     hash = ActiveSupport::JSON.decode(json)
   *     hash = hash.values.first if include_root
   *     self.attributes = hash
   *     self
   *   end
   */
  fromJson(json: string, includeRoot?: boolean | string): this {
    const ctor = this.constructor as typeof JSON;
    const root = includeRoot ?? ctor.includeRootInJson;
    let hash = globalThis.JSON.parse(json) as unknown;
    // Rails calls `hash.values.first` and raises NoMethodError if the
    // decoded JSON isn't a Hash. Surface the same failure mode loudly
    // instead of silently writing `undefined` into `attributes`.
    if (!isPlainJsonObject(hash)) {
      throw new TypeError(`fromJson expected a JSON object, got ${describeJsonShape(hash)}`);
    }
    // Rails truthiness: false/nil skip; everything else (including
    // empty string and any string root key) triggers unwrap via
    // `hash.values.first` unconditionally — Rails ignores the configured
    // root key on the read path (json.rb:146-147).
    if (root !== false && root != null) {
      hash = Object.values(hash as Record<string, unknown>)[0];
      if (!isPlainJsonObject(hash)) {
        throw new TypeError(
          `fromJson root payload must be a JSON object, got ${describeJsonShape(hash)}`,
        );
      }
    }
    (this as unknown as { attributes: Record<string, unknown> }).attributes = hash as Record<
      string,
      unknown
    >;
    return this;
  }

  /**
   * `JSON.stringify(instance)` consults a `toJSON` method when present.
   * Delegating to `asJson()` ensures the host runs the same coercion +
   * root-wrapping as the Rails entry point. Mirrors Model.toJSON
   * (model.ts) and matches the surface ActiveSupport adds on Object via
   * `as_json` indirection in Rails.
   */
  toJSON(): Record<string, unknown> {
    return this.asJson();
  }

  /**
   * Mirrors Ruby's `to_json` — encodes the model to a JSON string. Same
   * shape as Model#toJson (model.ts:1720-1722) so JSONHost adopters
   * stay compatible with Model-style consumers.
   */
  toJson(options?: SerializeOptions & { root?: boolean | string }): string {
    return globalThis.JSON.stringify(this.asJson(options));
  }
}
