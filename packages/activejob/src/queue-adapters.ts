import { camelize } from "@blazetrails/activesupport";
import { rbModConstGet, rbModConstSet } from "@blazetrails/ruby-compat";
import { ActiveJob, QueueAdapters } from "./namespaces.js";
import "./queue-adapters/abstract-adapter.js";
import "./queue-adapters/inline-adapter.js";

QueueAdapters.autoload("AbstractAdapter");
QueueAdapters.autoload("InlineAdapter");

const ADAPTER = "Adapter";

export function lookup(name: string): unknown {
  return rbModConstGet(QueueAdapters, camelize(String(name)) + ADAPTER);
}
Object.assign(QueueAdapters, { lookup });

rbModConstSet(ActiveJob, "QueueAdapters", QueueAdapters);
