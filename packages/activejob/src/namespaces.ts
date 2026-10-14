import { Autoload, extend, type Extended } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "active_job/base": () => import("./base.js"),
};

export const ActiveJob = { name: "ActiveJob", loadPath } as AutoloadModule & {
  Base: typeof Base;
  QueueAdapters: typeof QueueAdapters;
  Serializers: typeof Serializers;
};
registerConstant("ActiveJob", ActiveJob);
extend(ActiveJob, Autoload);
ActiveJob.autoload("Base");
ActiveJob.autoload("QueueAdapters");
ActiveJob.autoload("Arguments");
ActiveJob.autoload("DeserializationError", "active_job/arguments");
ActiveJob.autoload("SerializationError", "active_job/arguments");
ActiveJob.autoload("EnqueueAfterTransactionCommit");
ActiveJob.eagerAutoload(() => {
  ActiveJob.autoload("Serializers");
  ActiveJob.autoload("ConfiguredJob");
});
ActiveJob.autoload("TestCase");
ActiveJob.autoload("TestHelper");

export const QueueAdapters = { name: "ActiveJob::QueueAdapters", loadPath } as AutoloadModule;
extend(QueueAdapters, Autoload);

export const Serializers = { name: "ActiveJob::Serializers", loadPath } as AutoloadModule;
extend(Serializers, Autoload);
