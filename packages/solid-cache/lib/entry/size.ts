import { Concern, extend } from "@blazetrails/activesupport";
import { classModule } from "@blazetrails/ruby-compat";
import type { Entry } from "../entry.js";
import { SolidCache } from "../solid-cache.js";
import { MovingAverageEstimate } from "./size/moving-average-estimate.js";

export class ClassMethods {
  static async estimatedSize(
    this: typeof Entry,
    { samples = SolidCache.configuration.sizeEstimateSamples }: { samples?: number } = {},
  ): Promise<number> {
    return (await MovingAverageEstimate.new({ samples: samples })).size;
  }
}

export class Size {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;
}
extend(Size, Concern);
Object.defineProperty(Size, "ClassMethods", { value: ClassMethods });
(
  Size as unknown as {
    included(base: null, block: (this: typeof Entry) => void): void;
  }
).included(null, function (this: typeof Entry) {
  this.scope("largestByteSizes", (limit: number) =>
    this.from(this.order({ byte_size: "desc" }).limit(limit).select("byte_size")),
  );
  this.scope("inKeyHashRange", (range: unknown) => this.where({ key_hash: range }));
  this.scope("upToByteSize", (cutoff: unknown) => this.where("byte_size <= ?", cutoff));
});
