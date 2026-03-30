import type { SerializeOptions } from "../serialization.js";

/**
 * JSON serializer — provides as_json and from_json.
 *
 * Mirrors: ActiveModel::Serializers::JSON
 *
 * In Rails, this module is included into ActiveModel::Model and provides
 * as_json (returns a hash suitable for JSON encoding) and from_json
 * (populates a model from a JSON string). Model already implements
 * asJson() and fromJson().
 */
export interface JSON {
  asJson(options?: SerializeOptions): Record<string, unknown>;
  fromJson(json: string, includeRoot?: boolean): this;
}
