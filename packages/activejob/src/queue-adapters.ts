import { Autoload, camelize } from "@blazetrails/activesupport";
import { extend, classModule } from "@blazetrails/ruby-compat";
import { AbstractAdapter } from "./queue-adapters/abstract-adapter.js";
import { AsyncAdapter } from "./queue-adapters/async-adapter.js";
import { InlineAdapter } from "./queue-adapters/inline-adapter.js";
import { TestAdapter } from "./queue-adapters/test-adapter.js";

export class QueueAdapters {
  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob::QueueAdapters";
  }

  static ADAPTER: unknown = "Adapter";

  static lookup(name: string) {
    return (
      {
        AbstractAdapter: AbstractAdapter,
        AsyncAdapter: AsyncAdapter,
        InlineAdapter: InlineAdapter,
        TestAdapter: TestAdapter,
        ADAPTER: QueueAdapters.ADAPTER,
      } as { [name: string]: unknown }
    )[
      ((x) =>
        typeof x === "string"
          ? x + QueueAdapters.ADAPTER
          : Array.isArray(x)
            ? (x.push(QueueAdapters.ADAPTER), x)
            : x instanceof globalThis.Set
              ? x.add(QueueAdapters.ADAPTER)
              : x.append(QueueAdapters.ADAPTER))(camelize(String(name)))
    ];
  }
}
extend(QueueAdapters, Autoload);
