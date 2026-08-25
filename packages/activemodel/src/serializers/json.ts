import {
  serializableHash,
  attributeNamesForSerialization,
  serializableAttributes,
  readAttributeForSerialization,
  serializableAddIncludes,
  asJsonThenable,
  type SerializeOptions,
  type SerializationRecord,
} from "../serialization.js";
import { ModelName, Naming } from "../naming.js";
import {
  include,
  extend,
  included,
  classAttribute,
  ToJsonWithActiveSupportEncoder,
  type Included,
} from "@blazetrails/activesupport";

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
 * `Model` gets `as_json` / `from_json` from this module, via the
 * `include(Model, JSON)` in `model.ts`; the class is also the mixin host for
 * lighter-weight adopters and the file-level Rails surface
 * (`serializable_hash`, `model_name`).
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class JSON {
  // Rails: included do; class_attribute :include_root_in_json, default: false; end
  // Typed boolean | string to match Model.includeRootInJson — Rails
  // accepts a string here too (treated as a custom root key by as_json).
  static includeRootInJson: boolean | string = false;

  declare protected static _modelName?: ModelName;

  /**
   * Optional `::`-joined Ruby module path for a namespaced model — the
   * namespace `model_name` passes to `ActiveModel::Name.new`
   * (naming.rb:271-275).
   *
   * @noRailsEquivalent PERMANENT — Ruby reads the module path off the constant itself
   * (`module_parents`); a JS class name carries no module path, so a
   * namespaced host declares it. Same carrier as `Model.moduleName`.
   */
  declare static moduleName?: string;

  /** Plain attribute store for lightweight adopters; subclasses override with their storage shape. */
  declare attributes: Record<string, unknown>;

  /**
   * Mirrors: json.rb:12-16
   *   included do
   *     extend ActiveModel::Naming
   *     class_attribute :include_root_in_json, instance_writer: false, default: false
   *   end
   */
  static [included](base: object): void {
    extend(base as { prototype: object }, Naming);
    classAttribute.call(base, "includeRootInJson", { instanceWriter: false, default: false });
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
    // A `:root` option overrides `include_root_in_json` (json.rb:101-107);
    // asJsonThenable applies Rails' truthiness + recursive JSON coercion.
    const rootOpt =
      options && Object.prototype.hasOwnProperty.call(options, "root")
        ? options.root
        : ctor.includeRootInJson;
    return asJsonThenable(
      () => this.serializableHash(options),
      rootOpt,
      () => ctor.modelName.element,
      options ?? {},
    );
  }

  /**
   * Mirrors: json.rb:144-149
   *   def from_json(json, include_root = include_root_in_json)
   *     hash = ActiveSupport::JSON.decode(json)
   *     hash = hash.values.first if include_root
   *     self.attributes = hash
   *     self
   *   end
   *
   * `include_root` is a Ruby optional parameter, so its default is evaluated
   * only when the argument is OMITTED — an explicit `nil` stays `nil` and
   * :147's `if include_root` is false. A TS default parameter would swallow
   * that (CLAUDE.md § "Ruby idioms that do not translate literally", kwargs),
   * so the argument rides in a rest tuple whose length IS the distinction.
   */
  fromJson(json: string, ...includeRoot: [includeRoot?: boolean | string | null]): this {
    const ctor = this.constructor as typeof JSON;
    const root = includeRoot.length > 0 ? includeRoot[0] : ctor.includeRootInJson;
    let hash = globalThis.JSON.parse(json) as unknown;
    // Ruby truthiness: only `false`/`nil` skip the unwrap, and Rails ignores
    // the configured root key on the read path (json.rb:146-147).
    if (root !== false && root != null) {
      hash = Object.values(hash as object)[0];
    }
    void this.setAttributes(hash);
    return this;
  }

  /**
   * Rails: `included do; extend ActiveModel::Naming; end` — surfaces
   * `model_name` on the host class (naming.rb:270-277). `@_model_name ||=` is
   * a per-class ivar, so the memo is an own property; the namespace is the
   * enclosing module, carried as `moduleName` because a JS class has no
   * module path.
   */
  static get modelName(): ModelName {
    if (!Object.hasOwn(this, "_modelName") || !this._modelName) {
      // Rails walks `module_parents` for a module answering
      // `use_relative_model_naming?` (naming.rb:271-276). JS has no
      // enclosing-module chain to walk, so nothing can declare relative naming
      // and the detect answers nil.
      const namespace = null;
      this._modelName = new ModelName(this, namespace);
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
    return serializableHash(this as unknown as SerializationRecord, options);
  }

  /**
   * Mirrors: ActiveModel::Serialization#attribute_names_for_serialization
   * (serialization.rb:158-160), inherited via `include Serialization`.
   *
   * @internal Rails-private helper.
   */
  protected attributeNamesForSerialization(): string[] {
    return attributeNamesForSerialization(this as unknown as SerializationRecord);
  }

  /**
   * Mirrors: ActiveModel::Serialization#serializable_attributes
   * (serialization.rb:162-164), inherited via `include Serialization`.
   *
   * @internal Rails-private helper.
   */
  protected serializableAttributes(attributeNames: readonly string[]): Record<string, unknown> {
    return serializableAttributes(this as unknown as SerializationRecord, attributeNames);
  }

  /**
   * Mirrors: ActiveModel::Serialization#read_attribute_for_serialization
   * (serialization.rb:167 `alias :read_attribute_for_serialization :send`),
   * inherited via `include Serialization`. Public in Rails (declared before the
   * `private` section) so callers and subclasses can override the hook.
   */
  readAttributeForSerialization(key: string): unknown {
    return readAttributeForSerialization(this as unknown as SerializationRecord, key);
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
    serializableAddIncludes(this as unknown as SerializationRecord, options, callback);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (core_ext/object/json.rb:47-49); the class/interface merge is how `include()` surfaces on the type side.
export interface JSON {
  /**
   * `alias attributes= assign_attributes` (attribute_assignment.rb:36) — the
   * write half `from_json` uses (json.rb:147), which a host declares just as
   * json.rb's own docstring host declares `def attributes=(hash)`. A TS `set`
   * accessor cannot be awaited and the aliased path can owe I/O, so trails
   * keeps the Rails name in a `setX()` method (CLAUDE.md § "Fidelity is the
   * job").
   */
  setAttributes(newAttributes: unknown): Promise<void> | void;

  /** `ActiveSupport::ToJsonWithActiveSupportEncoder#to_json` (json.rb:35-43). */
  toJSON: Included<typeof ToJsonWithActiveSupportEncoder>["toJSON"];
}

include(JSON, ToJsonWithActiveSupportEncoder);
