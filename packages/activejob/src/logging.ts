import {
  Concern,
  TaggedLogging,
  Logger,
  cattrAccessor,
  classAttribute,
} from "@blazetrails/activesupport";
import {
  block as rbBlock,
  Enumerator,
  extend,
  STDOUT,
  classModule,
  Extended,
} from "@blazetrails/ruby-compat";
import { Instrumentation } from "./instrumentation.js";
import type { Base } from "./base.js";

export class Logging {
  declare static included: Extended<typeof Concern>["included"];

  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob::Logging";
  }

  async performNow(this: Base) {
    return this.tagLogger(
      Object.hasOwn(this.constructor, "toString")
        ? String(this.constructor)
        : this.constructor.name || null,
      this.jobId,
      async () => await Instrumentation.prototype.performNow.call(this),
    );
  }

  /** @internal */
  tagLogger(this: Base, ...tags: (string | (() => Promise<unknown>) | null)[]) {
    const block =
      typeof tags[tags.length - 1] === "function" &&
      !Function.prototype.toString.call(tags[tags.length - 1]).startsWith("class")
        ? (tags.pop() as (...args: unknown[]) => unknown)
        : undefined;
    if ("tagged" in Object(this.logger)) {
      if (!this.isLoggerTaggedByActiveJob()) {
        tags.unshift("ActiveJob");
      }
      return this.logger.tagged(...tags, ...(block != null ? [rbBlock(block)] : []));
    } else {
      return block();
    }
  }

  /** @internal */
  isLoggerTaggedByActiveJob(this: Base): boolean {
    return (
      this.logger.formatter.currentTags instanceof globalThis.Set ||
      this.logger.formatter.currentTags instanceof globalThis.Map ||
      this.logger.formatter.currentTags instanceof Enumerator
        ? [...this.logger.formatter.currentTags]
        : Object.getPrototypeOf(this.logger.formatter.currentTags) === Object.prototype
          ? Object.entries(this.logger.formatter.currentTags as object)
          : (this.logger.formatter.currentTags as unknown[])
    ).includes("ActiveJob");
  }
}
extend(Logging, Concern);
Logging.included(null, function (this: typeof Base): void {
  cattrAccessor.call(this, "logger", { default: TaggedLogging.new(new Logger(STDOUT)) });
  classAttribute.call(this, "logArguments", { instanceAccessor: false, default: true });
  this.aroundEnqueue({ prepend: true }, function (this: Base, _: unknown, block: unknown) {
    return this.tagLogger(block as string | (() => Promise<unknown>) | null);
  });
});
