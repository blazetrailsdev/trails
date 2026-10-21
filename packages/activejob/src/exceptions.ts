import { classAttribute, Concern, extend } from "@blazetrails/activesupport";
import { classModule, rbModConstSet, StandardError } from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";

type AfterDiscardProc = (this: unknown, job: unknown, exception: unknown) => unknown;

export class Exceptions {
  static readonly [classModule] = true;
  declare afterDiscardProcs: AfterDiscardProc[];

  /** @internal */
  async runAfterDiscardProcs(exception: unknown): Promise<void> {
    const exceptions: unknown[] = [];
    for (const blk of this.afterDiscardProcs) {
      try {
        await blk.call(this, this, exception);
      } catch (e) {
        if (!(e instanceof StandardError)) throw e;
        exceptions.push(e);
      }
    }
    if (exceptions.length !== 0) throw exceptions[exceptions.length - 1];
  }
}
extend(Exceptions, Concern);
(Exceptions as unknown as { included(base: null, block: (this: object) => void): void }).included(
  null,
  function (this: object) {
    classAttribute.call(this, "retryJitter", {
      instanceAccessor: false,
      instancePredicate: false,
      default: 0.0,
    });
    classAttribute.call(this, "afterDiscardProcs", { default: [] });
  },
);

rbModConstSet(ActiveJob, "Exceptions", Exceptions);
