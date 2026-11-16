import { Concern, extend } from "@blazetrails/activesupport";
import { classModule } from "@blazetrails/ruby-compat";
import type { Relation } from "@blazetrails/activerecord";
import type { Entry } from "../entry.js";
import { SolidCache } from "../solid-cache.js";
import { Estimate } from "./size/estimate.js";
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
  static Estimate: typeof Estimate;
  static MovingAverageEstimate: typeof MovingAverageEstimate;
}
extend(Size, Concern);
Object.defineProperty(Size, "ClassMethods", { value: ClassMethods });
Size.Estimate = Estimate;
Size.MovingAverageEstimate = MovingAverageEstimate;
(
  Size as unknown as {
    included(base: null, block: (this: typeof Entry) => void): void;
  }
).included(null, function (this: typeof Entry) {
  this.scope("largestByteSizes", function (this: Relation<Entry>, limit: number) {
    return this.from(this.order({ byte_size: "desc" }).limit(limit).select("byte_size"));
  });
  this.scope("inKeyHashRange", function (this: Relation<Entry>, range: unknown) {
    return this.where({ key_hash: range });
  });
  this.scope("upToByteSize", function (this: Relation<Entry>, cutoff: unknown) {
    return this.where("byte_size <= ?", cutoff);
  });
});
