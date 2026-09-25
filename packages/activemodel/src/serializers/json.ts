import {
  serializableHash,
  attributeNamesForSerialization,
  serializableAttributes,
  readAttributeForSerialization,
  serializableAddIncludes,
  asJsonThenable,
  type SerializeOptions,
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
import { Serializers } from "../namespaces.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class JSON {
  static includeRootInJson: boolean | string = false;

  declare static modelName: ModelName;

  declare readonly attributes: Record<string, unknown>;

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

  declare serializableHash: typeof serializableHash;

  /** @internal */
  declare attributeNamesForSerialization: typeof attributeNamesForSerialization;

  /** @internal */
  declare serializableAttributes: typeof serializableAttributes;

  declare readAttributeForSerialization: typeof readAttributeForSerialization;

  /** @internal */
  declare serializableAddIncludes: typeof serializableAddIncludes;
}

JSON.prototype.serializableHash = serializableHash;
JSON.prototype.attributeNamesForSerialization = attributeNamesForSerialization;
JSON.prototype.serializableAttributes = serializableAttributes;
JSON.prototype.readAttributeForSerialization = readAttributeForSerialization;
JSON.prototype.serializableAddIncludes = serializableAddIncludes;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (core_ext/object/json.rb:47-49); the class/interface merge is how `include()` surfaces on the type side.
export interface JSON {
  setAttributes(newAttributes: unknown): Promise<void> | void;

  toJSON: Included<typeof ToJsonWithActiveSupportEncoder>["toJSON"];
}

include(JSON, ToJsonWithActiveSupportEncoder);

Serializers.JSON = JSON;
