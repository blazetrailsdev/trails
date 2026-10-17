import {
  TaggedLogging,
  Logger,
  cattrAccessor,
  classAttribute,
  Concern,
} from "@blazetrails/activesupport";
import {
  rbModName,
  block as rbBlock,
  rbBlockGivenP,
  rbObjRespondTo,
  STDOUT,
  extend,
  Module,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { rbEnum } from "./codegen-runtime.js";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";

export function performNow(this: any): any {
  return this.tagLogger(
    rbModName(this.constructor),
    this.jobId,
    rbBlock(() => Logging.superMethod(this, "performNow")!()),
  );
}

/** @internal */
export function tagLogger(this: any, ...tags: any[]): any {
  const block = rbBlockGivenP(tags[tags.length - 1]) ? tags.pop() : undefined;
  if (rbObjRespondTo(this.logger, "tagged")) {
    if (!this.isLoggerTaggedByActiveJob()) {
      tags.unshift("ActiveJob");
    }
    return this.logger.tagged(...tags, ...(block != null ? [rbBlock(block)] : []));
  } else {
    return block();
  }
}

/** @internal */
export function isLoggerTaggedByActiveJob(this: any): any {
  return rbEnum(this.logger.formatter.currentTags).includes("ActiveJob");
}

export const Logging: any = new Module((mod: any) => {
  mod.defineMethod("performNow", performNow);
  mod.defineMethod("tagLogger", tagLogger);
  mod.defineMethod("isLoggerTaggedByActiveJob", isLoggerTaggedByActiveJob);
});
extend(Logging, Concern);
Logging.included(null, function (this: any): void {
  const base = this;
  cattrAccessor.call(base, "logger", { default: TaggedLogging.new(new Logger(STDOUT)) });
  classAttribute.call(base, "logArguments", { instanceAccessor: false, default: true });
  base.aroundEnqueue(
    { prepend: true },
    rbBlock(function (this: any, _?: any, block?: any) {
      return this.tagLogger(...(block != null ? [rbBlock(block)] : []));
    }),
  );
});
rbModConstSet(ActiveJobSeat, "Logging", Logging);
