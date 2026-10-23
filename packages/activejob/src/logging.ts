import {
  cattrAccessor,
  classAttribute,
  Concern,
  extend,
  Logger,
  TaggedLogging,
} from "@blazetrails/activesupport";
import {
  block as rbBlock,
  defineModule,
  rbCallSuper,
  rbModConstSet,
  rbModName,
  rbObjClass,
  rbObjRespondTo,
  STDOUT,
} from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";

interface TaggedLike {
  tagged(...tags: unknown[]): unknown;
  formatter: { currentTags: unknown[] };
}

interface LoggingJob {
  logger: unknown;
  jobId: string;
  tagLogger(...tags: unknown[]): unknown;
  isLoggerTaggedByActiveJob(): boolean;
}

interface LoggingClass {
  aroundEnqueue(...filters: unknown[]): void;
}

async function performNow(this: LoggingJob): Promise<unknown> {
  return await this.tagLogger(rbModName(rbObjClass(this)), this.jobId, () =>
    rbCallSuper(this, performNow),
  );
}

/** @internal */
function tagLogger(this: LoggingJob, ...tags: unknown[]): unknown {
  const block = tags.pop() as () => unknown;
  if (rbObjRespondTo(this.logger, "tagged")) {
    if (!this.isLoggerTaggedByActiveJob()) tags.unshift("ActiveJob");
    return (this.logger as TaggedLike).tagged(...tags, block);
  } else {
    return block();
  }
}

/** @internal */
function isLoggerTaggedByActiveJob(this: LoggingJob): boolean {
  return (this.logger as TaggedLike).formatter.currentTags.includes("ActiveJob");
}

export const Logging = defineModule({ performNow }, {}, { tagLogger, isLoggerTaggedByActiveJob });
extend(Logging, Concern);

Concern.included.call(Logging as never, null, function (this: LoggingClass) {
  cattrAccessor.call(this, "logger", {
    default: TaggedLogging.new(new Logger(STDOUT as never)),
  });

  classAttribute.call(this, "logArguments", { instanceAccessor: false, default: true });

  this.aroundEnqueue(
    { prepend: true },
    rbBlock(function (this: LoggingJob, _: unknown, block: () => unknown) {
      return this.tagLogger(block);
    }),
  );
});

rbModConstSet(ActiveJob, "Logging", Logging);
