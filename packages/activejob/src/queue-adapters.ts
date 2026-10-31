import { camelize } from "@blazetrails/activesupport";
import { constGet } from "@blazetrails/ruby-compat";
import { ActiveJob, QueueAdapters } from "./namespaces.js";
import "./queue-adapters/abstract-adapter.js";
import "./queue-adapters/async-adapter.js";
import "./queue-adapters/inline-adapter.js";
import "./queue-adapters/test-adapter.js";

QueueAdapters.autoload("AbstractAdapter");
QueueAdapters.autoload("AsyncAdapter");
QueueAdapters.autoload("InlineAdapter");
QueueAdapters.autoload("TestAdapter");

const ADAPTER = "Adapter";

export function lookup(name: string): unknown {
  return constGet(QueueAdapters, camelize(String(name)) + ADAPTER);
}
Object.assign(QueueAdapters, { lookup });

ActiveJob.QueueAdapters = QueueAdapters;
