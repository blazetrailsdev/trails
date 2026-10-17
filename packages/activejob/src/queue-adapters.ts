import { camelize, Autoload } from "@blazetrails/activesupport";
import { rbModConstGet, rbObjAsString, extend, rbModConstSet } from "@blazetrails/ruby-compat";
import { rbAppend } from "./codegen-runtime.js";
import { QueueAdapters as QueueAdaptersSeat, ActiveJob as ActiveJobSeat } from "./namespaces.js";
import "./queue-adapters/abstract-adapter.js";
import "./queue-adapters/async-adapter.js";
import "./queue-adapters/inline-adapter.js";
import "./queue-adapters/test-adapter.js";

export const ADAPTER: any = "Adapter";

export function lookup(name: any): any {
  return rbModConstGet(QueueAdapters, rbAppend(camelize(rbObjAsString(name)), ADAPTER));
}

export const QueueAdapters: any = QueueAdaptersSeat;
Object.assign(QueueAdapters, { lookup });
{
  extend(QueueAdapters, Autoload);
  QueueAdapters.autoload("AbstractAdapter");
  QueueAdapters.autoload("AsyncAdapter");
  QueueAdapters.autoload("InlineAdapter");
  QueueAdapters.autoload("BackburnerAdapter");
  QueueAdapters.autoload("DelayedJobAdapter");
  QueueAdapters.autoload("QueueClassicAdapter");
  QueueAdapters.autoload("ResqueAdapter");
  QueueAdapters.autoload("SidekiqAdapter");
  QueueAdapters.autoload("SneakersAdapter");
  QueueAdapters.autoload("SuckerPunchAdapter");
  QueueAdapters.autoload("TestAdapter");
}
rbModConstSet(ActiveJobSeat, "QueueAdapters", QueueAdapters);
