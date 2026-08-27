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
  ActiveSupportJSON,
  include,
  extend,
  included,
  classAttribute,
  ToJsonWithActiveSupportEncoder,
  type Included,
} from "@blazetrails/activesupport";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class JSON {
  static includeRootInJson: boolean | string = false;

  declare protected static _modelName?: ModelName;

  /** @noRailsEquivalent PERMANENT */
  declare static moduleName?: string;

  declare attributes: Record<string, unknown>;

  static [included](base: object): void {
    extend(base as { prototype: object }, Naming);
    classAttribute.call(base, "includeRootInJson", { instanceWriter: false, default: false });
  }

  asJson(options?: SerializeOptions & { root?: boolean | string }): Record<string, unknown> {
    const ctor = this.constructor as typeof JSON;
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

  fromJson(json: string, ...includeRoot: [includeRoot?: boolean | string | null]): this {
    const ctor = this.constructor as typeof JSON;
    const root = includeRoot.length > 0 ? includeRoot[0] : ctor.includeRootInJson;
    let hash = ActiveSupportJSON.decode(json);
    if (root !== false && root != null) {
      hash = Object.values(hash as object)[0];
    }
    void this.setAttributes(hash);
    return this;
  }

  static get modelName(): ModelName {
    if (!Object.hasOwn(this, "_modelName") || !this._modelName) {
      const namespace = null;
      this._modelName = new ModelName(this, namespace);
    }
    return this._modelName;
  }

  serializableHash(options?: SerializeOptions): Record<string, unknown> {
    return serializableHash(this as unknown as SerializationRecord, options);
  }

  /** @internal */
  protected attributeNamesForSerialization(): string[] {
    return attributeNamesForSerialization(this as unknown as SerializationRecord);
  }

  /** @internal */
  protected serializableAttributes(attributeNames: readonly string[]): Record<string, unknown> {
    return serializableAttributes(this as unknown as SerializationRecord, attributeNames);
  }

  readAttributeForSerialization(key: string): unknown {
    return readAttributeForSerialization(this as unknown as SerializationRecord, key);
  }

  /** @internal */
  protected serializableAddIncludes(
    options: SerializeOptions = {},
    callback: (association: string, records: unknown, opts: SerializeOptions) => void = () => {},
  ): void {
    serializableAddIncludes(this as unknown as SerializationRecord, options, callback);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (core_ext/object/json.rb:47-49); the class/interface merge is how `include()` surfaces on the type side.
export interface JSON {
  setAttributes(newAttributes: unknown): Promise<void> | void;

  toJSON: Included<typeof ToJsonWithActiveSupportEncoder>["toJSON"];
}

include(JSON, ToJsonWithActiveSupportEncoder);
