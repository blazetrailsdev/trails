import { Concern, classAttribute, extend, slice } from "@blazetrails/activesupport";
import { classModule } from "@blazetrails/ruby-compat";
import type { Base } from "@blazetrails/activerecord";
import type { Execution } from "../execution.js";

type JobAttributesClass = typeof Execution;

export class ClassMethods {
  static assumesAttributesFromJob(this: JobAttributesClass, ...attributeNames: string[]): void {
    this.assumableAttributesFromJob = [
      ...new Set([...this.assumableAttributesFromJob, ...attributeNames]),
    ];
    this.beforeCreate(function (this: JobAttributes) {
      return this.assumeAttributesFromJob();
    });
  }

  static attributesFromJob(this: JobAttributesClass, job: Base): Record<string, unknown> {
    return slice(job.attributes, ...this.assumableAttributesFromJob);
  }
}

export class JobAttributes {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;
  declare job: Promise<Base>;

  /** @internal */
  async assumeAttributesFromJob(): Promise<void> {
    const job = (await this.job) as unknown as Record<string, unknown>;
    for (const attribute of (this.constructor as unknown as JobAttributesClass)
      .assumableAttributesFromJob) {
      (this as unknown as Record<string, unknown>)[attribute] = job[attribute];
    }
  }
}
extend(JobAttributes, Concern);
Object.defineProperty(JobAttributes, "ClassMethods", { value: ClassMethods });
(
  JobAttributes as unknown as {
    included(base: null, block: (this: JobAttributesClass) => void): void;
  }
).included(null, function (this: JobAttributesClass) {
  classAttribute.call(this, "assumableAttributesFromJob", {
    instanceAccessor: false,
    default: ["queue_name", "priority"],
  });
});
